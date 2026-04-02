// Glow MIDI — Web MIDI extension for Glow Lab / TurboWarp
//
// Reconstructed from UchiwaFuujinn's scratch3webmidi extension.
// Original author: UchiwaFuujinn (https://github.com/UchiwaFuujinn)
// Original license: BSD-3-Clause
//
// This file merges two sources:
//   1. The compiled extension from https://uchiwafuujinn.github.io/scratch3webmidi/
//      (gh-pages, 2025) — the author's latest version with KEY OFF per-note tracking.
//   2. The Xcratch source structure from https://github.com/UchiwaFuujinn/webmidi-extension
//      (gh-pages branch) — the original development source.
//
// Changes from the original:
//   - Rebranded to "Glow MIDI" for the Glow Lab platform
//   - Adapted to TurboWarp unsandboxed extension format
//   - Removed Pokemiku blocks (s_PokeText, s_Strlen) and all related sysex/text-map code
//   - Replaced alert() popups with console logging + peripheral status indicator
//   - Added MIDIAccess.onstatechange for hot-plug device monitoring
//   - Added Italian translations
//   - Replaced scratch-vm Timer with Date.now()-based timer (functionally identical)
//
// See glow-midi-README.md for full reconstruction details.

(function (Scratch) {
    'use strict';

    /* ================================================================ */
    /* MIDI state — module-level variables (same structure as original)  */
    /* ================================================================ */

    var mMIDI = null;
    var mInputs = null;
    var mOutputs = null;
    var mOutDev = 0; // Output device index

    var mCtlbuf = new Array(0x80);
    var mNoteOn = new Array(0x80);
    var mNoteOff = new Array(0x80);

    var mCC_change_event = false;
    var mMIDI_event = false;
    var mKey_on_event = false;
    var mKey_off_event = false;
    var mPBend_event = false;
    var mPC_event = false;

    var mCC_change_flag = false;
    var mKey_on_flag = false;
    var mKey_off_flag = false;
    var mPC_flag = false;
    var mPBend_flag = false;

    var mNoteNum = 0;
    var mNoteVel = 0;
    var mPBend = 64;
    var mPCn = 0;

    /* ================================================================ */
    /* Tick-based sequencer (original author's MIDI-standard timing)     */
    /* 480 ticks/beat, 4ms interval — standard MIDI resolution           */
    /* ================================================================ */

    var mCount = 0;
    var mBeat = 0;
    var mDticks = 1;
    var mTempo = 120;
    var mBaseCount = 4;
    var mResolution = 480;

    setInterval(function () {
        mDticks = mTempo * mResolution / 60000;
        mCount = mCount + mDticks * mBaseCount;
        mBeat = mBeat + mDticks * mBaseCount;
        if (mCount > mResolution * 4) {
            mCount = mCount - mResolution * 4;
        }
    }, mBaseCount);

    /* ================================================================ */
    /* Event list enum                                                   */
    /* ================================================================ */

    var EventList = {
        KEY_ON: 'key-on',
        KEY_OF: 'key-of',
        CC_CHG: 'cc-chg',
        P_BEND: 'p-bend',
        PG_CHG: 'pg-chg'
    };

    /* ================================================================ */
    /* MIDI access — success / failure / input parsing / output          */
    /* ================================================================ */

    // Reference to the runtime for peripheral status events.
    // Set by the extension constructor.
    var _runtime = null;

    function _emitConnected () {
        if (_runtime) {
            _runtime.emit('PERIPHERAL_CONNECTED');
        }
    }

    function _emitDisconnected () {
        if (_runtime) {
            _runtime.emit('PERIPHERAL_DISCONNECTED');
        }
    }

    function _updateConnectionStatus () {
        // Check if any output device is available
        if (mOutputs && mOutputs.length > 0) {
            _emitConnected();
        } else {
            _emitDisconnected();
        }
    }

    function success (midiAccess) {
        mMIDI = midiAccess;
        var msg = 'Glow MIDI: connected.\n';
        var inum = 0;
        var onum = 0;

        for (var i = 0; i < 0x80; i++) {
            mCtlbuf[i] = 0;
            mNoteOn[i] = false;
            mNoteOff[i] = false;
        }

        if (typeof mMIDI.inputs === 'function') {
            mInputs = mMIDI.inputs();
            mOutputs = mMIDI.outputs();
        } else {
            msg += 'Input: ';
            var inputIterator = mMIDI.inputs.values();
            mInputs = [];
            for (var o = inputIterator.next(); !o.done; o = inputIterator.next()) {
                mInputs.push(o.value);
                msg += (inum + 1).toString(10) + ':' + o.value.name + ' ';
                inum++;
            }
            if (inum === 0) {
                msg += 'none. ';
            }

            msg += '| Output: ';
            var outputIterator = mMIDI.outputs.values();
            mOutputs = [];
            for (var p = outputIterator.next(); !p.done; p = outputIterator.next()) {
                mOutputs.push(p.value);
                msg += (onum + 1).toString(10) + ':' + p.value.name + ' ';
                onum++;
            }
            if (onum === 0) {
                msg += 'none.';
            }
        }

        for (var j = 0; j < mInputs.length; j++) {
            mInputs[j].onmidimessage = m_midiin;
        }

        console.log(msg);
        _updateConnectionStatus();

        // Monitor device hot-plug / unplug
        mMIDI.onstatechange = function () {
            // Re-enumerate devices on any state change
            var newInputs = [];
            var inIt = mMIDI.inputs.values();
            for (var inp = inIt.next(); !inp.done; inp = inIt.next()) {
                newInputs.push(inp.value);
            }
            var newOutputs = [];
            var outIt = mMIDI.outputs.values();
            for (var outp = outIt.next(); !outp.done; outp = outIt.next()) {
                newOutputs.push(outp.value);
            }
            mInputs = newInputs;
            mOutputs = newOutputs;

            // Re-bind input listeners
            for (var k = 0; k < mInputs.length; k++) {
                mInputs[k].onmidimessage = m_midiin;
            }

            // Clamp output device index
            if (mOutDev >= mOutputs.length) {
                mOutDev = 0;
            }

            console.log('Glow MIDI: devices changed. Inputs: ' +
                mInputs.length + ', Outputs: ' + mOutputs.length);
            _updateConnectionStatus();
        };
    }

    function failure (error) {
        console.error('Glow MIDI: Web MIDI not available.', error);
        _emitDisconnected();
    }

    /* ---- MIDI input parsing ---- */

    function m_midiin (event) {
        switch (event.data[0] & 0xF0) {
        case 0x80:
            mMIDI_event = true;
            m_noteon(event.data[1], 0);
            break;
        case 0x90:
            mMIDI_event = true;
            m_noteon(event.data[1], event.data[2]);
            break;
        case 0xA0:
            break;
        case 0xB0:
            mMIDI_event = true;
            mCC_change_event = true;
            mCC_change_flag = true;
            mCtlbuf[event.data[1]] = event.data[2];
            break;
        case 0xC0:
            mMIDI_event = true;
            mPC_event = true;
            mPC_flag = true;
            mPCn = event.data[1];
            break;
        case 0xD0:
            break;
        case 0xE0:
            mMIDI_event = true;
            mPBend_event = true;
            mPBend_flag = true;
            mPBend = event.data[2];
            break;
        case 0xF0:
            break;
        }
    }

    function m_noteon (note, vel) {
        mNoteNum = note;
        mNoteVel = vel;
        if (vel > 0) {
            mKey_on_event = true;
            mKey_on_flag = true;
            mNoteOn[mNoteNum] = true;
        } else {
            mKey_off_event = true;
            mKey_off_flag = true;
            mNoteOff[mNoteNum] = true;
        }
    }

    /* ---- MIDI output ---- */

    function m_midiout (event, note, vel) {
        var data1 = event & 0xFF;
        var data2 = note & 0x7F;
        var data3 = vel & 0x7F;
        if (mOutputs !== null && mOutDev < mOutputs.length) {
            var output = mOutputs[mOutDev];
            if (output !== null) {
                output.send([data1, data2, data3], 0);
            }
        }
    }

    function m_midiout_2byte (event, data) {
        var data1 = event & 0xFF;
        var data2 = data & 0x7F;
        if (mOutputs !== null && mOutDev < mOutputs.length) {
            var output = mOutputs[mOutDev];
            if (output !== null) {
                output.send([data1, data2], 0);
            }
        }
    }

    /* ================================================================ */
    /* Extension class                                                   */
    /* ================================================================ */

    class GlowMidi {
        constructor (runtime) {
            this.runtime = runtime;
            _runtime = runtime;

            navigator.requestMIDIAccess({sysex: false}).then(success, failure);
        }

        getInfo () {
            return {
                id: 'glowMidi',
                name: 'Glow MIDI',
                color1: '#e61f5a',
                color2: '#c4174d',
                color3: '#9e1240',
                blocks: [
                    // --- Reporters ---
                    {
                        opcode: 's_Note',
                        text: 'NoteNum',
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_Vel',
                        text: 'Velocity',
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_PBend',
                        text: 'PB',
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_PChange',
                        text: 'PC',
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_Ticks',
                        text: 'Ticks',
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_Ccin',
                        text: 'CC [ccnum]',
                        blockType: Scratch.BlockType.REPORTER,
                        arguments: {
                            ccnum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },

                    '---',

                    // --- Hat blocks (event triggers) ---
                    {
                        opcode: 's_Getmidievent',
                        text: 'MIDI EVENT',
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getkeyon',
                        text: 'Key ON',
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getkeyoff',
                        text: 'Key OFF',
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_PBevent',
                        text: 'P.Bend',
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_PCevent',
                        text: 'PrgChg',
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getcc',
                        text: 'CtrlChg',
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getkeyonnum',
                        text: 'KEY ON [ckeynum]',
                        blockType: Scratch.BlockType.HAT,
                        arguments: {
                            ckeynum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 48
                            }
                        }
                    },
                    {
                        opcode: 's_Getkeyoffnum',
                        text: 'KEY OFF [ckeynum]',
                        blockType: Scratch.BlockType.HAT,
                        arguments: {
                            ckeynum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 48
                            }
                        }
                    },

                    '---',

                    // --- Boolean ---
                    {
                        opcode: 's_Event',
                        text: 'EVENT [n_event]',
                        blockType: Scratch.BlockType.BOOLEAN,
                        arguments: {
                            n_event: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'eventlist',
                                defaultValue: EventList.KEY_ON
                            }
                        }
                    },

                    '---',

                    // --- Commands (MIDI output) ---
                    {
                        opcode: 's_Noteon_out',
                        text: 'NOTE ON [channelnum] [notenum] [velo]',
                        blockType: Scratch.BlockType.COMMAND,
                        arguments: {
                            channelnum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },
                            notenum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 60
                            },
                            velo: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 127
                            }
                        }
                    },
                    {
                        opcode: 's_Noteon_out_duration',
                        text: 'NOTE ON [channelnum] [notenum] [velo] [duration]',
                        blockType: Scratch.BlockType.COMMAND,
                        arguments: {
                            channelnum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },
                            notenum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 60
                            },
                            velo: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 127
                            },
                            duration: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 480
                            }
                        }
                    },
                    {
                        opcode: 's_Noteoff_out',
                        text: 'NOTE OFF [channelnum] [notenum] [velo]',
                        blockType: Scratch.BlockType.COMMAND,
                        arguments: {
                            channelnum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },
                            notenum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 60
                            },
                            velo: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 127
                            }
                        }
                    },
                    {
                        opcode: 's_ProgramChange',
                        text: 'PrgChg [channelnum] [pnumber]',
                        blockType: Scratch.BlockType.COMMAND,
                        arguments: {
                            channelnum: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },
                            pnumber: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },
                    {
                        opcode: 's_OutDevice',
                        text: 'Out Dev No. [outdev]',
                        blockType: Scratch.BlockType.COMMAND,
                        arguments: {
                            outdev: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        }
                    },

                    '---',

                    // --- Timing ---
                    {
                        opcode: 's_GetBeat',
                        text: 'BEAT [tempo]',
                        blockType: Scratch.BlockType.HAT,
                        arguments: {
                            tempo: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 120
                            }
                        }
                    },
                    {
                        opcode: 's_RestTicks',
                        text: 'Rest [rticks] ticks',
                        blockType: Scratch.BlockType.COMMAND,
                        arguments: {
                            rticks: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 240
                            }
                        }
                    }
                ],
                menus: {
                    eventlist: {
                        acceptReporters: true,
                        items: [
                            {text: 'key-on', value: EventList.KEY_ON},
                            {text: 'key-off', value: EventList.KEY_OF},
                            {text: 'cc-chg', value: EventList.CC_CHG},
                            {text: 'p-bend', value: EventList.P_BEND},
                            {text: 'pg-chg', value: EventList.PG_CHG}
                        ]
                    }
                }
            };
        }

        /* ---- Reporters ---- */

        s_Note () {
            return mNoteNum;
        }

        s_Vel () {
            return mNoteVel;
        }

        s_PBend () {
            return mPBend;
        }

        s_PChange () {
            return mPCn;
        }

        s_Ticks () {
            return Math.floor(mCount);
        }

        s_Ccin (args) {
            return mCtlbuf[args.ccnum];
        }

        /* ---- Hat blocks (edge-triggered events) ---- */

        s_Getmidievent () {
            if (mMIDI_event === true) {
                mMIDI_event = false;
                return true;
            }
            return false;
        }

        s_Getkeyon () {
            if (mKey_on_event === true) {
                mKey_on_event = false;
                return true;
            }
            return false;
        }

        s_Getkeyoff () {
            if (mKey_off_event === true) {
                mKey_off_event = false;
                return true;
            }
            return false;
        }

        s_PBevent () {
            if (mPBend_event === true) {
                mPBend_event = false;
                return true;
            }
            return false;
        }

        s_PCevent () {
            if (mPC_event === true) {
                mPC_event = false;
                return true;
            }
            return false;
        }

        s_Getcc () {
            if (mCC_change_event === true) {
                mCC_change_event = false;
                return true;
            }
            return false;
        }

        s_Getkeyonnum (args) {
            if (mNoteOn[args.ckeynum] === true) {
                mNoteOn[args.ckeynum] = false;
                return true;
            }
            return false;
        }

        s_Getkeyoffnum (args) {
            if (mNoteOff[args.ckeynum] === true) {
                mNoteOff[args.ckeynum] = false;
                return true;
            }
            return false;
        }

        /* ---- Boolean ---- */

        s_Event (args) {
            var n_flag = false;
            switch (args.n_event) {
            case EventList.KEY_ON:
                if (mKey_on_flag === true) {
                    n_flag = true;
                    mKey_on_flag = false;
                }
                break;
            case EventList.KEY_OF:
                if (mKey_off_flag === true) {
                    n_flag = true;
                    mKey_off_flag = false;
                }
                break;
            case EventList.CC_CHG:
                if (mCC_change_flag === true) {
                    n_flag = true;
                    mCC_change_flag = false;
                }
                break;
            case EventList.P_BEND:
                if (mPBend_flag === true) {
                    n_flag = true;
                    mPBend_flag = false;
                }
                break;
            case EventList.PG_CHG:
                if (mPC_flag === true) {
                    n_flag = true;
                    mPC_flag = false;
                }
                break;
            }
            return n_flag;
        }

        /* ---- Commands (MIDI output) ---- */

        s_Noteon_out (args) {
            var chnum = (args.channelnum & 0x0F) - 1;
            m_midiout(0x90 + chnum, args.notenum & 0x7F, args.velo & 0x7F);
        }

        s_Noteon_out_duration (args) {
            var chnum = (args.channelnum & 0x0F) - 1;
            var irticks = args.duration;
            if (irticks < 10) irticks = 10;
            var waittime = irticks / mResolution * 60 / mTempo * 1000;
            setTimeout(function () {
                m_midiout(0x80 + chnum, args.notenum & 0x7F, 0x40);
            }, waittime);
            m_midiout(0x90 + chnum, args.notenum & 0x7F, args.velo & 0x7F);
        }

        s_Noteoff_out (args) {
            var chnum = (args.channelnum & 0x0F) - 1;
            m_midiout(0x80 + chnum, args.notenum & 0x7F, args.velo & 0x7F);
        }

        s_ProgramChange (args) {
            var chnum = (args.channelnum & 0x0F) - 1;
            var pgnum = args.pnumber & 0x7F;
            m_midiout_2byte(0xC0 + chnum, pgnum);
        }

        s_OutDevice (args) {
            var dev = args.outdev;
            if (dev < 1) dev = 1;
            else if (mOutputs !== null && dev > mOutputs.length) dev = mOutputs.length;
            mOutDev = dev - 1;
        }

        /* ---- Timing ---- */

        s_GetBeat (args) {
            mTempo = args.tempo;
            if (mBeat >= mResolution) {
                mBeat = mBeat - mResolution;
                return true;
            }
            return false;
        }

        s_RestTicks (args, util) {
            if (!util.stackFrame.timer) {
                // First call: start timing
                var irticks = args.rticks;
                var waittime = irticks / mResolution * 60 / mTempo;
                util.stackFrame.timer = Date.now();
                util.stackFrame.duration = waittime * 1000; // ms
                util.yield();
            } else {
                // Subsequent calls: check if time is up
                var elapsed = Date.now() - util.stackFrame.timer;
                if (elapsed < util.stackFrame.duration) {
                    util.yield();
                }
            }
        }
    }

    Scratch.extensions.register(new GlowMidi());
})(Scratch);
