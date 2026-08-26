# Glow notes on the vendored ML2Scratch

Upstream: [champierre/ml2scratch](https://github.com/champierre/ml2scratch),
imported at commit `1747c6a793`. Tracked by glow-ets/scratch-gui#21.

The extension is branded **Glow Machine Learning** (`glowMl`); the files and the
class are named `glow-ml` / `GlowMLBlocks`. The ML2Scratch name is kept only
where it credits upstream.

## What upstream ships

ML2Scratch has exactly four source files. All four were imported and, apart from
the changes recorded below, are byte-identical to upstream:

| upstream path | here |
| --- | --- |
| `scratch-vm/src/extensions/scratch3_ml2scratch/index.js` | `glow-ml.js` |
| `scratch-gui/src/lib/libraries/extensions/ml2scratch/index.jsx` | removed, see below |
| `.../ml2scratch-small.png` | `src/lib/libraries/extensions/glow-ml/glow-ml-small.png`, redrawn |
| `.../ml2scratch.png` | replaced by `src/lib/libraries/extensions/glow-ml/glow-ml.svg` |

The extension shows two different names on purpose. The library card says
**Glow Machine Learning**; `getInfo().name` says **Glow ML**, because that same
string is the palette category heading *and* the stage monitor prefix
(`runtime.js:3317` builds monitor labels as `<name>: <block text>`), where the
long form does not fit.

`LICENSE` and `README.en.md` are upstream's, copied verbatim.

Upstream's `index.jsx` was the [Xcratch](https://xcratch.github.io/) library
entry. Glow's extension library is the single list in
`src/lib/libraries/extensions/index.jsx`, so nothing ever loaded it and it was
deleted.

## How it is wired into Glow

Upstream's `install.sh` patches `node_modules/scratch-vm` to register ML2Scratch
as a VM built-in extension. Glow does not do that: we depend on unmodified
`TurboWarp/scratch-vm`, and the specs put `src/extensions` ahead of scratch-vm
internals.

Instead `glow-ml.js` is served from our own origin (`webpack.config.js` copies
`src/extensions/**` to `static/extensions/**`) and
`src/lib/libraries/extensions/index.jsx` points at it. Glow's security manager
(`src/containers/tw-security-manager.jsx`) trusts same-origin extensions, so it
loads *unsandboxed* — which ML2Scratch needs, since it touches `document` and
pokes at `runtime.ioDevices.video.provider` internals. This is the same
mechanism `glow-lab` and `glow-midi` already use.

## What was changed in `glow-ml.js`

### Module plumbing

Replaced at the top and bottom of the file; the class body is otherwise
upstream's:

- `ArgumentType`, `BlockType`, `Cast` come from the global `Scratch` API instead
  of `require('../../extension-support/...')`; `log` is `console`.
- `formatMessage` is a thin adapter over `Scratch.translate`, keeping the
  `formatMessage.setup().locale` call in `setLocale()` working.
- `ml5` is loaded from a CDN just before registering, instead of
  `require('ml5')`. Bundling it would have meant a new npm dependency and a
  multi-megabyte payload in the main bundle; ml5 downloads the MobileNet
  weights over the network at runtime regardless, so the extension needs the
  internet either way.
- `extensionURL` defaults to our static URL rather than champierre's Xcratch
  module.
- The trailing CommonJS exports are replaced by
  `Scratch.extensions.register(...)`.

### Block review

Upstream offers most operations twice, once with a 1..10 dropdown and once with
a free-text field. The dropdowns cap you at ten labels and teach that a label is
a number, so the numbered variants are gone and the free-text ones are the only
way in:

| removed | kept instead |
| --- | --- |
| `addExample1/2/3` — `train label 1`, `2`, `3` | `train` — `train label [▾]` |
| `getCountByLabel1..10` — `counts of label 1..10` | `getCountByLabel` — `counts of label [▾]` |
| `trainAny`, `whenReceivedAny`, `resetAny` — the free-text variants | the dropdown versions |

### The label pool

Upstream's dropdowns were a fixed 1..10. They are now driven by a pool of label
names that works roughly like Scratch's broadcast messages, with one deliberate
difference: a label is **never** dropped just because no block uses it any more.

- The pool starts as `label A`, `label B` (`DEFAULT_LABELS`).
- It lives in `runtime.extensionStorage.glowMl.labels`, so it is written into
  `project.json` and comes back with the project. It is read through a getter
  rather than cached, because the runtime replaces that object wholesale when a
  project loads.
- The getter also unions in anything present in `this.counts`, so a dropdown can
  never hide a label that actually has training behind it.
- Deleting the last label brings the defaults back, so no dropdown is ever
  empty.

New labels are made with a **palette button**, the way `Make a Variable` works.
Scratch puts `new message` inside the dropdown itself, but that is
scratch-blocks' own `FieldVariable` machinery: an extension menu is a plain
`field_dropdown` and there is no hook on selection anywhere in the extension
API. (`extensionInfo.customFieldTypes` could in principle do it, but it means
shipping a scratch-blocks `Field` subclass from the extension — too fragile to
be worth it here.) All five label menus are *dynamic* (`items: 'getSomeMenu'`,
resolved by scratch-blocks every time the dropdown opens, like upstream's
`mediadevices` menu), so a new label appears everywhere immediately without a
`refreshBlocks()`.

Menu order matters: an argument with no `defaultValue` takes the **first** item
(`runtime.js:1688`). So `reset` and `counts of` lead with `all`, `when received`
leads with `any` — and `delete label` puts `all` *last*, so a block dragged
straight out of the palette does not default to wiping everything.

### Other behaviour changes

- `counts of label [all]` returns the sum over all labels, and every count
  reporter returns 0 instead of throwing when nothing has been trained yet
  (`this.counts` is null until the first training or upload).
- `getTopConfidenceLabel` compared each confidence against `topConfidence` but
  never advanced it, so classification returned the *last* label with a non-zero
  confidence rather than the best one. One line, fixed here rather than left in
  place, since every classify call depends on it.
- `set video transparency to [ ]` took its text from scratch-vm's videoSensing
  translation strings rather than this extension's `Message` table. It now uses
  the table like every other block, and its `blockType` is stated rather than
  relying on the default.

Added:

- `confidence` — how sure the classifier is about the label it is reporting,
  captured from `result.confidencesByLabel` in `classify()`. Rounded to two
  decimals, because a k-nearest-neighbour vote share otherwise reads as
  `0.6666666666666666` on a stage monitor.
- `labels and counts` — one reporter, `label:count` pairs separated by two
  spaces, e.g. `label A:12  label B:0  cat:3`. Scratch 3 has no list-valued
  reporter (`BlockType` offers only `REPORTER` and `BOOLEAN` for values, and no
  argument type picks a list), and two parallel comma-separated reporters turned
  out to be hard to read against each other. Labels with nothing trained yet are
  included, so it doubles as a view of the pool.
- `delete label [▾]` — where `reset` forgets what a label learned but keeps the
  label, `delete` also takes it out of the pool. `all` is behind a confirm.

Blocks not mentioned above are upstream's, unchanged.

### Look

Block palette colours are `#f000ee` / `#c000be` / `#950094`. The block icon is
the same artwork as the library inset icon, inlined as a data URI — upstream's
is ML2Scratch green, which clashed badly with the pink blocks.

### Translations

Italian throughout. The upload dialog's close button was hard-coded to 閉じる
and its "select a file" alert to English; both now come from the `Message`
table.

## Open points

- **Licence.** ML2Scratch is AGPL-3.0 and Glow inherits TurboWarp's GPL-3.0.
  Distributing the two together needs a deliberate decision; see
  glow-ets/scratch-gui#21.
- **ml5 is not vendored yet.** `loadMl5()` already tries
  `static/extensions/glow-ml/ml5.min.js` first and only falls back to unpkg,
  logging a warning. To finish the job, drop the file in and commit it:

  ```
  curl -L https://unpkg.com/ml5@0.12.2/dist/ml5.min.js \
    -o src/extensions/glow-ml/ml5.min.js
  ```

  The existing `src/extensions/**` copy rule ships it; no build change needed.
  ml5 still fetches the MobileNet weights from the network at runtime, so this
  removes the unpkg dependency but does not make the extension work offline.
- **A failed ml5 load leaves the extension manager waiting.** `loadExtensionURL`
  resolves only when `Scratch.extensions.register` is called, and there is no
  way to reject it from inside the extension, so the failure path just logs and
  alerts. Self-hosting ml5 would make this far less likely.
- **Training data still lives outside the project.** `download` / `upload`
  write and read a JSON file by hand. See "Storing the training data" below.
- **Classroom readiness: to review.** Not stress-tested. The upload dialog is
  still built with nested `<html><body>` inside `innerHTML`, as upstream has it.

## Storing the training data

Two routes, and they are not equivalent.

**`runtime.extensionStorage.glowMl`** — what the label pool already uses. Any
JSON-serialisable value, written into `project.json` (`sb3.js:611`, saved at
`:730`, loaded at `:1545`), only when the extension is actually used in the
project. Available today, from `src/extensions`, no fork. But `project.json` is
copied *in full* into every restore point (`tw-restore-point-api.js:305`), so
megabytes of feature vectors would be duplicated per autosave.

**A custom asset type** — the instinct is right, and TurboWarp already has a
precedent in custom fonts: its own `AssetType.Font` (listed in scratch-gui's
`src/lib/storage.js:22`), a JSON manifest in `project.json` via
`fontManager.serializeJSON()` (`sb3.js:712`), binary payloads as their own zip
entries (`virtual-machine.js:649`), and a load path via `fontManager.deserialize`
(`sb3.js:1505`). The payoff is real: `serializeAssets` entries are keyed by
content hash, and restore points write each asset **once** and share it across
every restore point (`tw-restore-point-api.js`, `checkMissingAssets`), which is
exactly the duplication problem above.

The catch is that `VirtualMachine.serializeAssets()` (`virtual-machine.js:646`)
concatenates three hard-coded sources — costumes, sounds, fonts. There is no
registry for an extension to join. Doing this means a `glow-ml-manager.js` in
scratch-vm mirroring `tw-font-manager.js` plus those four hook points, i.e.
forking scratch-vm and repointing our dependency at `glow-ets/scratch-vm`.
Nothing an extension can do from `src/extensions`.

Either way the data needs a cap. `knnClassifier.save()` emits raw float arrays,
1024 floats per example, roughly 10-12 KB of JSON each. Quantising the vectors
first (float32 to int8, or rounding to four decimals) cuts that several-fold;
after that a hard limit on example count with rotation and a warning.
