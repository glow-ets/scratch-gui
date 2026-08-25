# Glow notes on the vendored ML2Scratch

Upstream: [champierre/ml2scratch](https://github.com/champierre/ml2scratch),
imported at commit `1747c6a793`. Tracked by glow-ets/scratch-gui#21.

## What upstream ships

ML2Scratch has exactly four source files; all four were imported and are
byte-identical to upstream apart from the renamings listed below:

| upstream path | here |
| --- | --- |
| `scratch-vm/src/extensions/scratch3_ml2scratch/index.js` | `glow-ml2scratch.js` |
| `scratch-gui/src/lib/libraries/extensions/ml2scratch/index.jsx` | `index.jsx` (unused, see below) |
| `.../ml2scratch.png` | `src/lib/libraries/extensions/glow-ml2scratch/glow-ml2scratch.png` |
| `.../ml2scratch-small.png` | `src/lib/libraries/extensions/glow-ml2scratch/glow-ml2scratch-small.png` |

`LICENSE` and `README.en.md` are upstream's, copied verbatim.

## How it is wired into Glow

Upstream's `install.sh` patches `node_modules/scratch-vm` to register
ML2Scratch as a VM built-in extension. Glow does not do that: we depend on
unmodified `TurboWarp/scratch-vm`, and the specs put `src/extensions` ahead of
scratch-vm internals.

Instead `glow-ml2scratch.js` is served from our own origin
(`webpack.config.js` copies `src/extensions/**` to `static/extensions/**`) and
`src/lib/libraries/extensions/index.jsx` points at it. Glow's security manager
(`src/containers/tw-security-manager.jsx`) trusts same-origin extensions, so it
loads *unsandboxed* — which ML2Scratch needs, since it touches `document`
and pokes at `runtime.ioDevices.video.provider` internals. This is the same
mechanism `glow-lab` and `glow-midi` already use.

## What was changed in `glow-ml2scratch.js`

The ML2Scratch class body is untouched. Only the module plumbing at the top and
bottom of the file was replaced:

- `ArgumentType`, `BlockType`, `Cast` now come from the global `Scratch` API
  instead of `require('../../extension-support/...')`; `log` is `console`.
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

Renamings applied throughout: `Scratch3ML2ScratchBlocks` -> `GlowML2ScratchBlocks`,
extension id `ml2scratch` -> `glowMl2scratch`, name `ML2Scratch` ->
`GlowML2Scratch`.

## `index.jsx` is currently unused

It is upstream's [Xcratch](https://xcratch.github.io/) library entry. Glow's
extension library is a single `src/lib/libraries/extensions/index.jsx` list, so
that file is kept only as a record of the import. Its `extensionURL` still
points at champierre's hosted module — do not wire it up as-is.

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
- **Classroom readiness: to review.** Not stress-tested. Known rough edges from
  upstream: the upload dialog is built with nested `<html><body>` in
  `innerHTML`, its close button is labelled in Japanese, training data is not
  saved in the project, and there is no Italian translation.
