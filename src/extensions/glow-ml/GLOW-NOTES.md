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
| `addExample1/2/3` — `train label 1`, `2`, `3` | `trainAny` — `train label [ ]` |
| `train` — `train label [4..10 ▾]` | same |
| `whenReceived` — `when received label [any/1..10 ▾]` | `whenReceivedAny` — `when received label [ ]` |
| `getCountByLabel1..10` — `counts of label 1..10` | `getCountByLabel` — `counts of label [ ]` |

The `trainAny` / `whenReceivedAny` / `resetAny` opcodes keep upstream's names
even though they are no longer the "any" alternatives to anything, so the diff
against upstream stays readable.

Behaviour changes on the surviving blocks:

- `when received label [ ]` defaults to empty, and an empty label fires on any
  label. It reuses upstream's `whenReceived` by passing its `'any'` sentinel.
- `counts of label [ ]` returns the sum over all labels when empty, and returns
  0 instead of throwing when nothing has been trained yet (`this.counts` is
  null until the first training or upload).
- `getTopConfidenceLabel` compared each confidence against `topConfidence` but
  never advanced it, so classification returned the *last* label with a non-zero
  confidence rather than the best one. One line, fixed here rather than left in
  place, since every classify call depends on it.
- `set video transparency to [ ]` took its text from scratch-vm's videoSensing
  translation strings rather than this extension's `Message` table. It now uses
  the table like every other block, and its `blockType` is stated rather than
  relying on the default.

Added:

- `labels` and `counts` reporters. Scratch 3 has no list-valued reporter —
  `BlockType` offers only `REPORTER` and `BOOLEAN` for values, and there is no
  argument type that picks a list — so these return comma separated strings that
  line up index by index. Both read `this.counts`, so the order matches.

Blocks not mentioned above are upstream's, unchanged. That includes the two
`reset` blocks, whose dropdown still lists 1..10.

### Translations

Italian added throughout, and the block palette colours are the magenta of
`glow-ml-small.png`. The upload dialog's close button was hard-coded to 閉じる
and its "select a file" alert to English; both now come from the `Message`
table.

## Open points

- **Licence.** ML2Scratch is AGPL-3.0 and Glow inherits TurboWarp's GPL-3.0.
  Distributing the two together needs a deliberate decision; see
  glow-ets/scratch-gui#21.
- **Third-party origin.** `unpkg.com` is a runtime dependency for ml5, and ml5
  in turn fetches MobileNet weights. Neither is under our control, and neither
  works offline. Self-hosting both would fix that.
- **A failed ml5 load leaves the extension manager waiting.** `loadExtensionURL`
  resolves only when `Scratch.extensions.register` is called, and there is no
  way to reject it from inside the extension, so the failure path just logs and
  alerts. Self-hosting ml5 would make this far less likely.
- **Training data still lives outside the project.** `download` / `upload`
  write and read a JSON file by hand. TurboWarp's `extensionStorage` slot could
  hold it inside the `.sb3` instead; see glow-ets/scratch-gui#21 for the size
  and restore-point costs.
- **Classroom readiness: to review.** Not stress-tested. The upload dialog is
  still built with nested `<html><body>` inside `innerHTML`, as upstream has it.
