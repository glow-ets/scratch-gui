# Glow Lab Changelog

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
