# Glow Lab Changelog

## 0.2.0 - Dev workflow setup

### Feature audit

- Added `glow-feature-audit.md`: maps each spec requirement to extension-only vs GUI-patch
- ~85% of planned features can be implemented purely through extensions
- Only branding CSS, AVIF support, cache-size warnings, and stress-tested markers need GUI patches

### Smoke tests

- Added `test/smoke/glow-smoke.test.js` with three headless browser tests:
  - Build output exists and GUI loads without console errors
  - Glow Lab extension appears in the extension library
  - Glow Lab extension can be loaded and its block category appears
- Added `npm run test:smoke:glow` script

### CI improvements

- Updated `.github/workflows/node.js.yml`:
  - Added lint step before unit tests
  - Added production build with artifact upload
  - Added glow smoke tests after build
- Added `.github/workflows/deploy-gh-pages.yml`:
  - Deploys to GitHub Pages on push to `develop` branch
  - Uses modern `actions/deploy-pages@v4` (no gh-pages branch needed)
  - Concurrency control to avoid overlapping deploys

## 0.1.0 - Repo setup

Based on TurboWarp/scratch-gui, forked at commit `457e640` (Update translations, the last upstream TurboWarp commit before Glow Lab modifications).

### Upstream modules used (not cloned)

We use the original TurboWarp modules as npm dependencies without cloning them:

- `scratch-vm`: github:TurboWarp/scratch-vm#develop
- `scratch-blocks`: github:TurboWarp/scratch-blocks#develop-builds
- `scratch-paint`: github:TurboWarp/scratch-paint#develop
- `scratch-render`: github:TurboWarp/scratch-render#develop
- `scratch-audio`: github:TurboWarp/scratch-audio#develop
- `@turbowarp/scratch-l10n`
- `@turbowarp/scratch-storage`
- `@turbowarp/scratch-svg-renderer`

### Changes

- Renamed branding from TurboWarp to Glow Lab (provisional)
- Added visible version and build commit hash in the menu bar
- Added `glow-lab` extension (initial, placeholder blocks)
- Renamed package from `scratch-gui` to `glow-lab`
- Updated web manifest for Glow Lab branding
- Kept original TurboWarp build process intact
- No tests added (per milestone spec)
- No demo added (per milestone spec)
