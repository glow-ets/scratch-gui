# Glow MIDI

A Web MIDI extension for the [Glow Lab](https://github.com/glow-ets/scratch-gui) platform,
enabling Scratch/TurboWarp projects to send and receive MIDI messages via the
browser's Web MIDI API.

## Credits and Origin

**Glow MIDI is a reconstruction and rebrand of the WebMidi Extension by
[UchiwaFuujinn](https://github.com/UchiwaFuujinn).**

The original extension was published under the BSD-3-Clause license. We gratefully
acknowledge UchiwaFuujinn's work, which made this extension possible.

### Original repositories

- **scratch3webmidi** (compiled extension):
  https://github.com/UchiwaFuujinn/scratch3webmidi
- **webmidi-extension** (Xcratch source, gh-pages branch):
  https://github.com/UchiwaFuujinn/webmidi-extension/tree/gh-pages

### Reconstruction process

The original author published two artifacts:

1. A **compiled extension** deployed on GitHub Pages at
   `uchiwafuujinn.github.io/scratch3webmidi/`. This was the most recent version
   (as of 2025), containing features not present in the source repo — notably
   per-note KEY OFF tracking (`mNoteOff[]` array and `s_Getkeyoffnum()` block).
   The JavaScript was reconstructed from the compiled webpack bundle.

2. An **Xcratch-format source repository** (`webmidi-extension`, gh-pages branch),
   approximately 4 years old. This provided the original file structure, build
   configuration, translations, and GUI entry metadata.

Glow MIDI merges both sources: the source repository's structure as reference,
and the compiled extension's logic as the definitive feature set, then adapts
the result to the TurboWarp unsandboxed extension format used by Glow Lab.

### What changed from the original

- **Rebranded** from "WebMidi Extension" / "Web MIDI for Scratch3" to "Glow MIDI"
- **Adapted** to TurboWarp unsandboxed extension format (`Scratch.extensions.register()`)
- **Removed** Pokemiku-specific blocks (`s_PokeText`, `s_Strlen`) and all related
  Japanese phoneme text-map / sysex code (per project requirements — the Pokemiku
  vocal synthesizer hardware is niche and unrelated to general MIDI use)
- **Removed** `alert()` popups on MIDI connection — replaced with `console.log()`
  messages and the Scratch peripheral status indicator (green/orange icon in the
  block palette)
- **Added** `MIDIAccess.onstatechange` listener for device hot-plug / unplug monitoring
- **Added** Italian translations for the extension description
- **Replaced** scratch-vm's internal `Timer` class with a `Date.now()`-based timer
  (functionally identical, required because unsandboxed extensions cannot `require()`
  scratch-vm internals)
- **Changed** `sysex: true` to `sysex: false` in `requestMIDIAccess()` (sysex was
  only needed for Pokemiku; disabling it avoids an extra browser permission prompt)

## Blocks (22 total)

### Reporters
- **NoteNum** — last received MIDI note number
- **Velocity** — last received note velocity
- **PB** — pitch bend value (0-127)
- **PC** — program change number
- **Ticks** — current tick position in a 4-beat cycle
- **CC [n]** — control change value for CC number n

### Hat Blocks (event triggers)
- **MIDI EVENT** — any MIDI message received
- **Key ON** / **Key OFF** — any note on/off
- **KEY ON [note]** / **KEY OFF [note]** — specific note on/off
- **P.Bend** — pitch bend received
- **PrgChg** — program change received
- **CtrlChg** — control change received
- **BEAT [tempo]** — fires once per beat at given BPM

### Boolean
- **EVENT [type]** — check if a specific event type occurred

### Commands
- **NOTE ON [ch] [note] [vel]** — send note on
- **NOTE ON [ch] [note] [vel] [duration]** — send note on with auto note-off
- **NOTE OFF [ch] [note] [vel]** — send note off
- **PrgChg [ch] [number]** — send program change
- **Out Dev No. [n]** — select MIDI output device
- **Rest [ticks] ticks** — pause execution for N ticks (tempo-aware)

## Browser Support

Web MIDI API support (as of March 2026):
- Chrome >= 43
- Edge >= 79
- Firefox >= 108
- Safari: not supported

## License

BSD-3-Clause (original license by UchiwaFuujinn, 2022)

See the LICENSE file in the original repository:
https://github.com/UchiwaFuujinn/webmidi-extension/blob/gh-pages/LICENSE
