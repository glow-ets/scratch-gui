# Glow notes on the vendored ML2Scratch

Upstream: [champierre/ml2scratch](https://github.com/champierre/ml2scratch),
imported at commit `1747c6a793`. Tracked by glow-ets/scratch-gui#21.

The extension is branded **Glow Machine Learning** (`glowML`); the files and the
class are named `glow-ml` / `GlowMLBlocks`. The ML2Scratch name is kept only
where it credits upstream.

### Vocabulary: category, not label

What upstream calls a *label*, Glow calls a **category**, everywhere: block
text in all six languages, opcodes, argument names, methods, constants, the
stored pool, the default `category A` / `category B`. Two vocabularies stay as
they are, because they are not ours to rename:

- ml5's `knnClassifier` — `addExample`, `clearLabel`, `clearAllLabels`,
  `getNumLabels`, `getCountByLabel`, `confidencesByLabel`, and the `label` key
  in the saved dataset. A category is passed straight through as ml5's label.
- the DOM — `MediaDeviceInfo.label` (a camera's name) and `aria-label`.

The rename is **not backward compatible**, and neither is `glowMl` → `glowML`.
Both the extension id and every opcode changed, so a project saved before this
loses its Glow ML blocks entirely; its stored pool
(`extensionStorage.glowMl.labels`) and its training asset (owner `glowMl`) are
not read either. No migration was written because the opcode change breaks such
a project regardless of what the storage does. This is fine while the extension
is unreleased; once it ships, opcodes and the extension id are frozen.

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
a free-text field. The dropdowns cap you at ten categories and teach that a category is
a number, so the numbered variants are gone and the free-text ones are the only
way in:

| removed | kept instead |
| --- | --- |
| `addExample1/2/3` — `train label 1`, `2`, `3` | `train` — `train category [▾]` |
| `getCountByLabel1..10` — `counts of label 1..10` | `getCountByCategory` — `count of category [▾]` |
| `trainAny`, `whenReceivedAny`, `resetAny` — the free-text variants | the dropdown versions |

### The category pool

Upstream's dropdowns were a fixed 1..10. They are now driven by a pool of category
names that works roughly like Scratch's broadcast messages, with one deliberate
difference: a category is **never** dropped just because no block uses it any more.

- The pool starts as `category A`, `category B` (`DEFAULT_CATEGORIES`).
- It lives in `runtime.extensionStorage.glowML.categories`, so it is written into
  `project.json` and comes back with the project. It is read through a getter
  rather than cached, because the runtime replaces that object wholesale when a
  project loads.
- The getter also unions in anything present in `this.counts`, so a dropdown can
  never hide a category that actually has training behind it.
- Deleting the last category brings the defaults back, so no dropdown is ever
  empty.

New categories are made with a **palette button**, the way `Make a Variable` works.
Scratch puts `new message` inside the dropdown itself, but that is
scratch-blocks' own `FieldVariable` machinery: an extension menu is a plain
`field_dropdown` and there is no hook on selection anywhere in the extension
API. (`extensionInfo.customFieldTypes` could in principle do it, but it means
shipping a scratch-blocks `Field` subclass from the extension — too fragile to
be worth it here.) All five category menus are *dynamic* (`items: 'getSomeMenu'`,
resolved by scratch-blocks every time the dropdown opens, like upstream's
`mediadevices` menu), so a new category appears everywhere immediately without a
`refreshBlocks()`.

Menu order matters: an argument with no `defaultValue` takes the **first** item
(`runtime.js:1688`). So `reset` and `counts of` lead with `all`, `when received`
leads with `any` — and `delete category` puts `all` *last*, so a block dragged
straight out of the palette does not default to wiping everything.

### Failing loudly

Upstream ignores the error argument of the `featureExtractor` callback and
starts the classify interval regardless. When the model does not load, that
turns one failure into an exception every interval forever, and the video
pipeline never settles — the symptom is a frozen webcam preview, counts that
never move, and hundreds of identical console errors.

`glow-ml.js` now tracks `modelReady` / `modelBroken`:

- the `featureExtractor` callback checks its error argument, and
  `featureExtractor.ready` is watched as well, because the callback has been
  observed firing before a later stage of the load rejects
- `reportBrokenModel()` says so once, clears the classify interval and stops
  everything that calls `infer()`
- `train` and `classify` check readiness first and wrap `infer()`, so a model
  that breaks later (a lost WebGL context, say) also reports once instead of
  per frame
- when the vendored models are in use, `diagnoseModelFiles()` then fetches every
  shard the manifests name and checks its size, so the alert says *which* file is
  missing or wrong instead of `byte length of Float32Array should be a multiple
  of 4`, which tfjs throws many frames away from the file that caused it

### Other behaviour changes

- `count of category [all]` returns the sum over all categories, and every count
  reporter returns 0 instead of throwing when nothing has been trained yet
  (`this.counts` is null until the first training or upload).
- `getTopConfidenceCategory` compared each confidence against `topConfidence` but
  never advanced it, so classification returned the *last* category with a non-zero
  confidence rather than the best one. One line, fixed here rather than left in
  place, since every classify call depends on it.
- Every category menu and the `categories and counts` reporter are sorted the same
  way (`sortCategories`, numeric and case-insensitive, so `category 10` follows
  `category 2`). The special `all` / `any` items keep their fixed position.
- `reset category` only asks for confirmation when the target is `all`. Asking
  every time trained people to click through it, which is the opposite of what
  a confirmation is for.
- `set video transparency to [ ]` took its text from scratch-vm's videoSensing
  translation strings rather than this extension's `Message` table. It now uses
  the table like every other block, and its `blockType` is stated rather than
  relying on the default.

Added:

- `confidence` — how sure the classifier is about the category it is reporting,
  captured from `result.confidencesByLabel` in `classify()`. Rounded to two
  decimals, because a k-nearest-neighbour vote share otherwise reads as
  `0.6666666666666666` on a stage monitor.
- `categories and counts` — one reporter, `category:count` pairs separated by two
  spaces, e.g. `category A:12  category B:0  cat:3`. Scratch 3 has no list-valued
  reporter (`BlockType` offers only `REPORTER` and `BOOLEAN` for values, and no
  argument type picks a list), and two parallel comma-separated reporters turned
  out to be hard to read against each other. Categories with nothing trained yet are
  included, so it doubles as a view of the pool.
- `delete category [▾]` — where `reset` forgets what a category learned but keeps the
  category, `delete` also takes it out of the pool. `all` is behind a confirm.

Blocks not mentioned above are upstream's, unchanged.

### Look

Stage monitors for extension blocks are labelled from the block's raw text, so
`count of category [CATEGORY]` shows up on the stage with the placeholder
intact. An extension cannot fix that itself: `Runtime.getLabelForOpcode`
(`runtime.js:3317`) returns no `labelFn`. A `src/lib/monitor-adapter.js` edit
filling the placeholder in from the monitor's own `params` was tried and
reverted in 17e1615 — the monitor keeps the text it was created with, so it
goes stale as soon as the dropdown changes, which is worse than a visible
placeholder.

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
- **Serving the vendored models needs a dev server restart.**
  `copy-webpack-plugin` copies `src/extensions/**` at build start; files added
  while `npm start` is running are not always picked up, which shows as a 404
  for a weight shard that is plainly there on disk.
- **A block pressed while the model is still loading does nothing, silently.**
  `checkModelReady()` returns false and `train` just returns. Better than the
  exception it used to throw, but there is no feedback.
- **A failed ml5 load leaves the extension manager waiting.** `loadExtensionURL`
  resolves only when `Scratch.extensions.register` is called, and there is no
  way to reject it from inside the extension, so the failure path just logs and
  alerts. Self-hosting ml5 would make this far less likely.
- **Storing training data in the project needs the forked VM.** See "Training
  data in the project" below. Against upstream TurboWarp's VM the extension
  logs a warning once and falls back to the download and upload blocks.
- **Classroom readiness: to review.** Not stress-tested. The upload dialog is
  still built with nested `<html><body>` inside `innerHTML`, as upstream has it.


## Going fully offline

Loading `ml5.min.js` from our own origin is only half of it. `featureExtractor`
downloads **two** models of its own. Both were observed in a headless browser
with `fetch` instrumented:

| | default URL | option that overrides it |
| --- | --- | --- |
| tfjs LayersModel | `storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json` | `mobilenetURL` |
| tfjs GraphModel | `tfhub.dev/google/imagenet/mobilenet_v1_025_224/classification/1/model.json?tfjs-format=file` | `graphModelURL` |

Both are ordinary constructor options — `this.mobilenetURL = e.mobilenetURL || …`
— so **no patching of ml5 is needed**. Passing both was verified to send every
request to the given URLs and none to the internet.

`glow-ml.js` passes them, using the vendored copies when both
`static/extensions/glow-ml/mobilenet/model.json` and
`static/extensions/glow-ml/mobilenet-graph/model.json` parse as tfjs manifests,
and otherwise warning and letting ml5 use its remote defaults.

**A model.json on its own is not a model.** Each one lists its weights in a
`weightsManifest`, and tfjs fetches those shards relative to the model.json's
own URL. There are 56 of them:

| | shards | bytes |
| --- | --- | --- |
| `mobilenet/` | `group1-shard1of1` … `group55-shard1of1` (no extension) | 1.81 MB |
| `mobilenet-graph/` | `group1-shard1of1.bin` | 1.78 MB |

`node scripts/glow-fetch-mobilenet.mjs` reads the committed manifests and
fetches exactly those files next to them. It checks each download against the
size the manifest implies and refuses to write a mismatch, because a
wrong-sized shard does not fail at download time — it fails much later, inside
tfjs, as `byte length of Float32Array should be a multiple of 4`.

The existing `src/extensions/**` copy rule ships whatever is in the directory,
so no build change is needed. Two things to keep in mind:

- The graph model must be saved as plain `model.json`. A local `graphModelURL`
  does not contain `https://tfhub.dev/`, so ml5 loads it with
  `fromTFHub: false` and expects that name — not `model.json?tfjs-format=file`,
  which is what a naive `curl -O` of the tfhub URL leaves behind.
- Checking for the files with a HEAD request is not enough.
  `webpack-dev-server`'s `historyApiFallback` answers some misses with
  `index.html` and a 200, and a plain 404 body is still bytes that tfjs will
  try to decode. `isModelManifest()` therefore fetches and insists the response
  parses with a `weightsManifest` array.

Careful: `ml5.tf` is a *different* object from the tfjs namespace the bundle
uses internally — patching `ml5.tf.loadLayersModel` has no effect, as a probe
confirmed. The options are the supported route.

## No camera

`VideoProvider._setupVideo()` catches `getUserMedia` failures, calls its own
`onError` and **resolves `undefined`** rather than rejecting, so
`enableVideo().then(...)` still runs and `provider.video` is `null`. There is
nothing to `.catch()`.

The extension therefore ended up with `this.input === null`, ml5 read `.elt` off
it on the first `train`, threw, and the catch-all reported it as
"The MobileNet model could not be loaded" — which was doubly misleading, since
the console right above it said `[featureExtractor] Model Loaded!`.

`checkInputReady()` now runs before `infer()` and says what is actually wrong,
naming the block and pointing at the way out:

> `"train category [...]"` FAILED: there is no picture to learn from! Allow the
> camera in your browser, or use "Learn/Classify stage image" to learn from the
> stage instead.

The stage suggestion is not a consolation prize: `setInput` accepts `stage`, so
the whole extension works without a camera at all. `classify()` runs on a timer
and stays silent when there is no input — `train` is where a person finds out.

## Error paths

`hasWorkingCamera()` is the single source of truth. `VideoProvider.videoReady`
covers a camera that never started; it does **not** notice a permission revoked
mid-session, because the track ends while the video element keeps its last
dimensions — so the track's `readyState` is checked too. `usingStageInput()`
short-circuits all of it, because `Learn/Classify [stage] image` needs no camera
at all and the whole extension works without one.

| block | with no working camera |
| --- | --- |
| `train category [▾]` | refuses, names itself, points at the stage alternative |
| `turn classification [on]` | still starts the timer, but says it will see nothing |
| `classify once every [N] seconds` | same, since it restarts the same timer |
| `turn video [on]` | reports after `enableVideo()` resolves — it resolves either way |
| `Learn/Classify [webcam] image` | reports at the moment of switching, not at the next `train` |
| `switch webcam to [▾]` | reports; with no permission the menu holds only an empty `default` and picking it did nothing at all |
| `when received category`, all reporters | silent by design — a hat runs every frame and a reporter has a neutral value |
| `reset`, `delete category`, `download`, `upload`, `set video transparency` | no camera needed |

The block stores a camera's `deviceId`, which is 64 hex characters, so
`switch webcam to [▾]` looks the name back up in `this.devices` through
`deviceName()` before naming itself in a message — otherwise the bubble reads
`"switch webcam to [6a11be62…]"`. The name is missing in both directions: with
no permission `enumerateDevices()` returns devices with empty labels, and a
project saved on another machine names a camera this one has never seen. Both
fall back to `Message.unnamed_camera` rather than showing the id.

`classify()` runs on a timer and stays silent, but it checks the camera rather
than just `this.input` — a revoked permission leaves the video element in place
and dead, and the old truthiness check let it through to ml5, which threw.

`train`'s catch does the same distinction: if the camera has died between the
check and `infer()`, that is reported as a camera problem, not as a broken
model. That misattribution is what made a refused camera say
"The MobileNet model could not be loaded" directly under a console line reading
`[featureExtractor] Model Loaded!`.

## The hat is an event, not a sensor

`when received category` is fired by `classify()` through `runtime.startHats`,
the same way `broadcast` fires `when I receive`:

```js
isEdgeActivated: false,
shouldRestartExistingThreads: true,
```

Both differ from the extension API's defaults, and upstream ML2Scratch took the
defaults. `isEdgeActivated` defaults to **true** for an extension hat
(`runtime.js:1423`) and `shouldRestartExistingThreads` has no default, so the
block was configured exactly like stock `when [loudness] > 10`: a **sensor**
that the runtime evaluates once a frame and that never restarts a script
already running under it.

That is the wrong shape for this block, and it shows in an ordinary classroom
gesture. Take a script running under the hat and drag its body out of the hat.
The thread does not stop — a thread keeps running wherever it is, whatever the
editor does to the blocks around it. What normally rescues you is the next
event: `_restartThread` builds a new thread on the script's **top block**
(`runtime.js`), so on the next broadcast the thread goes back to the hat, finds
nothing under it any more, and ends. With `restartExistingThreads: false` that
never happens: the detached blocks run forever, clicking them starts a *second*
thread instead of stopping the first (`toggleScript` matches on the top block a
thread *started* with, which is still the hat), and `startHats` then refuses to
fire the hat at all because a thread with that top block is still alive. The
hat goes silent until the Stop button. Stock `when [timer] > 0` behaves exactly
the same way — glow-ets/scratch-gui#23 — which is why the fix is here and not
there.

**Two `startHats` calls, each naming a dropdown value**, not one call with no
filter:

```js
this.runtime.startHats(RECEIVED_HAT, {[RECEIVED_HAT_FIELD]: String(category)});
this.runtime.startHats(RECEIVED_HAT, {[RECEIVED_HAT_FIELD]: ANY});
```

They select disjoint sets of scripts, so nothing is started twice, and a script
waiting on a *different* category is left alone. One unfiltered call would
restart **every** `when received` script on every classification and then retire
the ones whose category did not match — killing them mid-run. The field is
called `received_menu`, not `CATEGORY`: a dropdown argument's field is named
after its menu (`runtime.js`, `_buildMenuForScratchBlocks`). Both sides are
compared upper-cased by the VM, so two categories differing only in case would
trigger each other.

The consequence to know about: while a category keeps being recognised, the
script under its hat is **restarted on every classification**, exactly as it
would be under a `forever [broadcast]`. A script that takes longer than the
classification interval never reaches its end. `classify once every [N]
seconds` is the knob.

## Known upstream problems

- glow-ets/scratch-gui#23 — a script dragged out of its hat while running
  cannot be stopped by clicking it, and blocks the hat from ever firing again.
  This no longer bites us, since the hat above restarts; it still bites stock
  `when [timer] > 0`.
- glow-ets/scratch-gui#24 — a glow for a deleted block throws inside
  `runtime._step()`, which stops the stage being repainted. Tracked with its own
  branch and evidence; the trigger is not yet pinned down.

## Training feedback instead of a warning

Upstream alerted once per session on the first `train`: "the first training will
take a while, so do not click again and again". The delay is real but hardware
dependent — it is the *first* `featureExtractor.infer()` call, not a download.
The models are fetched when the extension loads; tfjs only compiles and uploads
the WebGL shaders on the first forward pass. That can take a second on weak
hardware and be invisible on fast hardware, which is why the alert so often
looked gratuitous.

The alert was also the only guard. Unlike `reset`, `download` and `upload`,
`train` had no `actionRepeated()` check, so a pupil who did not understand the
block could fill the training set with whatever the camera happened to see.

It is replaced by feedback the block gives itself:

- `train` returns a promise, which puts the thread in `STATUS_PROMISE_WAIT`
  (`scratch-vm/src/engine/execute.js`, `handlePromise`), so the block keeps its
  yellow glow until the work finishes — the same mechanism the timed blocks use.
- The work starts after the next paint, so the glow is actually on screen before
  `infer()` blocks the thread. `afterPaint` races a `requestAnimationFrame` with
  a 250 ms timeout, because rAF does not fire in a background tab and a pupil
  who switches tabs must not be left with a block glowing on a promise that
  never settles.
- A click arriving while `this.training` is set is dropped.
- Every path resolves the promise, including the one where `infer()` throws, so
  the glow always clears.

## Storing the training data

Two routes, and they are not equivalent.

**`runtime.extensionStorage.glowML`** — what the category pool already uses. Any
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

### Can an addon do it instead of forking scratch-vm?

Mechanically, yes. `addon.tab.traps.vm` (`src/addons/api.js:200`) hands an addon
the live `VirtualMachine` off the Redux store, so it can wrap methods at
runtime. No addon in the tree does anything with assets or serialization today,
so there is no precedent to copy, but the hook points are:

- **Save.** Wrap `vm.serializeAssets()` and append a
  `{fileName, fileContent}` entry. Both `saveProjectSb3` (`virtual-machine.js:552`)
  and `saveProjectSb3DontZip` (`:619`) go through it, so one wrap covers
  exported `.sb3` files *and* restore points.
- **Manifest.** Nothing in `project.json` would point at the new entry, and
  `sb3.serialize` has no hook. The way around it is to split: keep the pointer
  (filename, hash, example count) in `runtime.extensionStorage.glowML`, which is
  already supported and tiny, and put only the bulk in the zip entry.
- **Load.** Wrap `vm.loadProject(input)` and pull the entry out of the zip with
  JSZip before delegating. This is the awkward half: it means opening the
  archive a second time.
- **Restore points.** These already work generically. `createRestorePoint`
  treats every key of `saveProjectSb3DontZip()` other than `project.json` as an
  asset and stores it by id, deduplicated (`checkMissingAssets`); the export
  path re-zips whatever ids the manifest lists (`zip.file(asset.md5ext, …)`).
  An extra entry rides along for free.

So an addon avoids the fork at the cost of monkey-patching three VM methods and
parsing the project archive twice. Worth weighing against a `glow-ml-manager.js`
in the scratch-vm fork, which is more code but no patching, and which is what
`tw-font-manager.js` does.

### What MIME type?

Inside the `.sb3` this barely matters: the zip entry is named
`${assetId}.${dataFormat}` and `dataFormat` is just the extension. A
scratch-storage `AssetType` also carries a `contentType`, but that is used when
fetching assets from a web store, which we do not do.

The data is JSON, so `application/json` with `dataFormat: 'json'` is the honest
answer. A generic `data` / `application/octet-stream` type would be worse, not
for any sandbox reason but because it throws away the one bit of information
that lets a loader refuse the wrong thing early.

The security question is not really the MIME type. Loading a project means
deserializing bytes a stranger produced, and there is no vetting layer for asset
payloads: TurboWarp's `SecurityManager` (`src/containers/tw-security-manager.jsx`)
gates *extensions and network access* — `canFetch`, `canOpenWindow`,
`canDownload`, `getSandboxMode`, `canLoadExtensionFromProject` — which is real
protection vanilla Scratch lacks, but none of it inspects a costume, a sound or
our blob. So the vetting has to be ours, at the point we parse it:

- validate the shape before handing anything to `knnClassifier.load()` — categories
  are strings, vectors are fixed-length arrays of finite numbers
- cap the total size and the example count before allocating, so a crafted file
  cannot exhaust memory
- build the parsed object with `Object.create(null)`, or reject `__proto__` and
  `constructor` as category names, so category names cannot pollute a prototype

None of that is specific to being an asset; it applies just as much to the
`upload learning data` block we already ship, which today calls `JSON.parse`
and passes the result straight to ml5.

## Training data in the project

Implemented against `runtime.glowAssetManager`, the generic asset store added in
glow-ets/scratch-vm for glow-ets/scratch-gui#22. Training data is stored under
owner `glowML`, name `training`, format `json` — a real entry in the `.sb3` zip
rather than a blob inside `project.json`, so TurboWarp's restore points keep one
shared copy instead of duplicating it in every snapshot.

- `serializeTrainingData()` repeats the serialising half of ml5's `save()`,
  which otherwise serialises and downloads in one step. The output is
  byte-identical in shape to what the download block produces, so a file saved
  by one can be loaded by the other. It reads `knnClassifier.mapStringToIndex`,
  which is ml5 internals — acceptable only because ml5 is vendored at a pinned
  0.12.2 and cannot drift underneath us.
- Writes are debounced by a second (`scheduleSave`), because a pupil clicking
  train repeatedly would otherwise re-serialise a megabyte of feature vectors on
  every click. Hooked into train, reset, delete category and upload.
- `runtime.emitProjectChanged()` is called after a successful write, or the
  editor has no idea there is anything new to save.
- `loadFromProject()` runs on `PROJECT_LOADED` and once at construction, since
  the extension can be added to an already-open project. A project holding
  nothing clears the classifier rather than leaving the previous project's
  training in place.
- Over the manager's ceiling, `set()` throws: the data stays usable for the
  session, the user is told once, and the project simply saves without it.

### Limits, and why refusing beats rotating

`forever [train category A]` was able to run to about 1550 examples, at which point
each save built an 11 MB JSON string on the main thread only to be told it could
not be stored — one console message showed a single save blocking for
**20 seconds**. Training carried on regardless, and Chrome eventually gave up.
Three things now stop that:

- `MAX_EXAMPLES_PER_CATEGORY` (200) and `MAX_EXAMPLES_TOTAL` (500), checked in
  `checkExampleLimits()` *before* `infer()` runs, so a runaway loop costs
  essentially nothing once it hits the cap. 500 examples is about 3.4 MB, well
  inside the 8 MB ceiling with room for other extensions. A MobileNet feature
  vector is 1024 floats and serialises to roughly 7 KB, which is where those
  numbers come from; adjust them together if the format changes.
- `warnAboutLimit` keeps a **Set** of everything already reported. It first kept
  only the last message, which looked right with one script but ping-ponged
  endlessly with two: `forever [train category A]` hits the per-category cap while
  `forever [train category C]` hits the total cap, the two messages differ, so each
  one looked new on every frame and both alerted forever.
- Only the **first** problem opens a modal. Everything after it — including
  repeats of the same problem — goes to a speech bubble via `sayOnTarget`, the
  `runtime.emit('SAY', …)` pattern glow-midi uses for a missing device. A second
  modal is not a warning any more, it is an obstacle: the scripts keep running
  behind it and the pupil cannot reach the stop button.
- Bubbles are throttled to one per 200 ms. A click always gets through; a
  `forever` loop is capped, since the bubble only ever shows the last message
  anyway. 20000 calls produce one bubble.
- `sayOnTarget` picks a target that can actually show the bubble:
  `scratch3_looks._updateBubble` **removes** a bubble whose target is hidden
  (`if (!target.visible || text === '')`), so it tries the sprite that ran the
  block, then the editing target, then the stage — which is visible by default
  and takes bubbles fine.
- Bubbles **expire**. `BUBBLE_BASE_MS` (4 s) plus `BUBBLE_MS_PER_CHAR` (90 ms),
  capped at 30 s, is deliberately slow: for every problem after the first the
  bubble is the only place the message is shown, so it is sized for a pupil who
  reads slowly rather than for one who skims. A permanent bubble covers the
  sprite and outlives the problem it describes — fix the camera and you are
  still staring at the complaint about it. Clearing is the same `SAY` event with
  an empty string, which is how `looks_sayforsecs` does it.
- The extension only ever clears **its own** bubble. `emitSay` records the
  target it put a message on, and a `runtime.on('SAY', …)` listener drops that
  ownership the moment somebody else's `say` block writes to the same sprite, so
  the timer never wipes a message the project put there. `emittingSay` is what
  tells our own emit apart from theirs. A newer Glow message restarts the clock
  rather than stacking timers.
- `reportProblem` is now the single route for every background problem: the
  caps, the missing camera, a model that failed to load, and training data too
  big to save. The alerts that remain are the ones a person just asked for — the
  upload dialog, a duplicate category name.
- Messages name the block as it reads in the palette and the category that stopped,
  e.g. `"train category [category C]" FAILED: a project can hold at most 500
  training examples in total! Currently category A:200  category B:200
  category C:100.` The
  block text comes from `Message.train`, so it is always the real wording in the
  current language, and the field keeps its brackets or a category called
  `category A` would render as `train category category A`.
- `saveRefusedAtExamples` remembers the example count at which a save was
  refused and skips serialising until the data shrinks below it. This is what
  removes the repeated 20-second blocks even if the caps are ever raised.

Refusing rather than rotating is deliberate. Rotation would let the same forever
loop run at full cost indefinitely, and would silently discard a pupil's earlier
examples. Refusing makes the loop cheap and the situation legible.

`updateCounts()` no longer logs on every training, which a loop turned into
thousands of console lines.

**If the VM has no `glowAssetManager`** — which is the case against upstream
`TurboWarp/scratch-vm`, what `package.json` still points at — the extension logs
one warning and everything else works as before.

### Pointing scratch-gui at the forked VM

`scratch-vm`'s `main` is `./src/index.js`, so scratch-gui builds it from source
and edits show up on the next build. `webpack.config.js` already sets
`resolve.symlinks: false`, which is what makes the linked copy resolve cleanly.

For local work, link the two checkouts:

```
cd ../scratch-vm && npm ci && npm link
cd ../scratch-gui && npm link scratch-vm
npm start
```

`npm link` survives until the next `npm install` in scratch-gui, which silently
replaces the link with the published dependency — if the extension starts
warning that the VM has no `glowAssetManager` again, that is why. `ls -l
node_modules/scratch-vm` says whether the link is still there.

To make it permanent instead, point the dependency at the fork:

```json
"scratch-vm": "github:glow-ets/scratch-vm#glow-assets-feat22"
```

That is also what CI and the GitHub Pages build would need, since neither knows
about a local link. It has not been done yet: the specs say scratch-gui links to
the original TurboWarp dependencies rather than our forks, so switching is a
deliberate decision, not a side effect of this work.
