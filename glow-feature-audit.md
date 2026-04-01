
# Glow Lab Feature Audit: Extensions vs GUI Patches

This audit maps each spec requirement (from glow-specs.md) to whether it can be achieved purely through TurboWarp extensions or requires GUI-level patches.

## Summary

~85% of planned features can be implemented via extensions alone. Only a handful of
UI-level concerns (branding CSS, cache warnings, AVIF support, stress-tested markers)
require minimal GUI patches.

## Extension-Only Features

These can be implemented 100% as custom extension blocks with NO GUI patches:

| Feature | Approach |
|---|---|
| Battery detection warning | `navigator.getBattery()` API from extension block |
| Volume level checking | `AudioContext` / `MediaStream` analysis from extension |
| Browser permissions pre-check | `navigator.permissions.query()` from extension |
| CPU optimization ("attend 0") | Extension can set runtime framerate / throttle |
| Device connection feedback | Extension blocks for USB/BLE status reporting |
| Hardware state monitoring | Extension blocks polling device state |
| Custom educational blocks | Core extension feature |
| Language support (en + it) | Extensions support `translation_map` in `getInfo()` |

## Already Implemented (GUI-level)

These are already present in the TurboWarp/Glow Lab codebase:

| Feature | Status | Location |
|---|---|---|
| Autosave to browser cache | Done | `src/lib/tw-restore-point-api.js` (IndexedDB) |
| Reload opens cached project | Done | Restore point system |
| Version + commit hash display | Done | `src/components/menu-bar/menu-bar.jsx` |
| WebP/JFIF image support | Done | `src/lib/file-uploader.js` |
| Browser permissions UI | Partial | `src/components/tw-security-manager-modal/` |
| Connection modal (hardware) | Done | `src/components/connection-modal/` |
| No block restrictions | Done | TurboWarp default |
| Branding (name, logo) | Done | `src/lib/brand.js`, menu-bar, manifest |

## Requires GUI Patches (Minimal)

These need small, targeted modifications to existing GUI code:

| Feature | Patch needed | Complexity |
|---|---|---|
| Brand color (#e61f5a) in theme | Add CSS variable + theme integration | Low |
| Cache size warning UI | Extend restore point alerts (metadata already tracked) | Low |
| AVIF image format support | Add case to `src/lib/file-uploader.js` | Low |
| "Stress-tested" extension marker | Use existing `tags` array in extension index | Low |
| No-scratch-cat default assets | Replace default project sprites/costumes | Medium |

## New Spec Items (added 0.2 cycle)

These were added to glow-specs.md and need classification:

| Feature | Category | Details |
|---|---|---|
| Auto-match browser language | GUI | REQUIRES PATCH - `src/lib/detect-locale.js` reads localStorage/browser lang but Scratch doesn't always match. Need to fix locale detection logic. |
| Disable browser auto-translators | GUI | REQUIRES PATCH - Add `<meta name="google" content="notranslate">` + `translate="no"` attribute to HTML templates. Small patch to `src/playground/index.ejs`. |
| "Easy" mode (simplified UI) | GUI | REQUIRES PATCH - Config flag to hide menu items (Addons, Advanced, Send feedback, turbo/60fps, dark mode, etc). Needs menu-bar and settings changes. Medium effort. |
| Default/easy mode key combo switch | GUI | REQUIRES PATCH - Keyboard shortcut handler to toggle modes. Small patch. |
| "easy" label in version string | GUI | REQUIRES PATCH - Conditional in menu-bar version display. Trivial. |
| Absurdly large values / long strings | EXTENSION | Validation blocks can cap values. Also needs VM-level review. |
| Extra large image loading check | BOTH | Extension can check file size; GUI file-uploader already converts formats. May need size limit in uploader. |
| Large sound loading warnings | EXTENSION | Extension block can check audio duration/size and warn. |
| Hide brush/eraser tools (vector abuse) | GUI | REQUIRES PATCH - Hide or disable in scratch-paint integration. |
| Motion blocks on Stage: better UX | GUI | REQUIRES PATCH - Replace text warning with pictorial modal when clicking motion blocks while Stage is selected. |
| Sprite overcrowding limits | BOTH | Extension can monitor count; GUI could add soft limit with warning. |
| Better undo (multi-sprite history) | GUI | REQUIRES PATCH - Significant effort. Needs undo stack beyond single-sprite restore. |

## Architecture Notes

- **Extension capabilities**: blocks, menus, translation, runtime events, all Web APIs
- **Extension limitations**: cannot modify GUI chrome (menus, modals, toolbar, themes)
- **Recommended approach**: keep GUI patches in clearly marked `glow-*` files/sections;
  implement all educational/hardware logic in the `glow-lab` extension
- **Bus factor mitigation**: minimal GUI divergence from upstream TurboWarp means easier rebasing when upstream updates
