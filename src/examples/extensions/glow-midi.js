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
//   - Replaced alert() popups with MIDI status reporter + no-device say bubble
//   - Added MIDIAccess.onstatechange for hot-plug device monitoring
//   - Added Italian translations via translation_map
//   - Replaced scratch-vm Timer with Date.now()-based timer (functionally identical)
//
// See glow-midi-README.md for full reconstruction details.

(function (Scratch) {
    'use strict';

    /* ================================================================ */
    /* Localized status messages                                         */
    /* ================================================================ */

    var STATUS_MESSAGES = {
        en: {
            noDevices: 'No MIDI devices \u2014 connect a MIDI device',
            onlyVirtual: 'Only virtual ports \u2014 connect a MIDI device',
            permissionDenied: 'MIDI: permission denied \u2014 allow MIDI in browser settings',
            notSupported: 'MIDI: not supported by this browser',
            securityError: 'MIDI: requires HTTPS \u2014 use Chrome or a secure connection',
            noDeviceWarning: 'No MIDI device connected!',
            onlyVirtualWarning: 'Only virtual MIDI ports, no real device connected!',
            inLabel: 'In',
            outLabel: 'Out',
            none: 'none',
            virtual: 'virtual',
            // Block text
            block_status: 'status',
            block_noteNum: 'NoteNum',
            block_velocity: 'Velocity',
            block_pb: 'PB',
            block_pc: 'PC',
            block_ticks: 'Ticks',
            block_cc: 'CC [ccnum]',
            block_midiEvent: 'MIDI EVENT',
            block_keyOn: 'Key ON',
            block_keyOff: 'Key OFF',
            block_pBend: 'P.Bend',
            block_prgChg: 'PrgChg',
            block_ctrlChg: 'CtrlChg',
            block_keyOnNum: 'KEY ON [ckeynum]',
            block_keyOffNum: 'KEY OFF [ckeynum]',
            block_event: 'EVENT [n_event]',
            block_noteOnOut: 'NOTE ON [channelnum] [notenum] [velo]',
            block_noteOnDur: 'NOTE ON [channelnum] [notenum] [velo] [duration]',
            block_noteOffOut: 'NOTE OFF [channelnum] [notenum] [velo]',
            block_prgChgOut: 'PrgChg [channelnum] [pnumber]',
            block_outDev: 'Out Dev No. [outdev]',
            block_beat: 'BEAT [tempo]',
            block_rest: 'Rest [rticks] ticks',
            // Menu items
            menu_keyOn: 'key-on',
            menu_keyOff: 'key-off',
            menu_ccChg: 'cc-chg',
            menu_pBend: 'p-bend',
            menu_pgChg: 'pg-chg'
        },
        it: {
            noDevices: 'Nessun dispositivo MIDI \u2014 collegare un dispositivo MIDI',
            onlyVirtual: 'Solo porte virtuali \u2014 collegare un dispositivo MIDI',
            permissionDenied: 'MIDI: permesso negato \u2014 consenti MIDI nelle impostazioni del browser',
            notSupported: 'MIDI: non supportato da questo browser',
            securityError: 'MIDI: richiede HTTPS \u2014 usa Chrome o una connessione sicura',
            noDeviceWarning: 'Nessun dispositivo MIDI collegato!',
            onlyVirtualWarning: 'Solo porte MIDI virtuali, nessun dispositivo reale!',
            inLabel: 'Ingr',
            outLabel: 'Usc',
            none: 'nessuno',
            virtual: 'virtuale',
            // Block text
            block_status: 'stato',
            block_noteNum: 'NumNota',
            block_velocity: 'Velocit\u00e0',
            block_pb: 'PB',
            block_pc: 'PC',
            block_ticks: 'Tick',
            block_cc: 'CC [ccnum]',
            block_midiEvent: 'EVENTO MIDI',
            block_keyOn: 'Nota ON',
            block_keyOff: 'Nota OFF',
            block_pBend: 'P.Bend',
            block_prgChg: 'CambioProg',
            block_ctrlChg: 'CambioCtrl',
            block_keyOnNum: 'NOTA ON [ckeynum]',
            block_keyOffNum: 'NOTA OFF [ckeynum]',
            block_event: 'EVENTO [n_event]',
            block_noteOnOut: 'NOTA ON [channelnum] [notenum] [velo]',
            block_noteOnDur: 'NOTA ON [channelnum] [notenum] [velo] [duration]',
            block_noteOffOut: 'NOTA OFF [channelnum] [notenum] [velo]',
            block_prgChgOut: 'CambioProg [channelnum] [pnumber]',
            block_outDev: 'Dispositivo uscita [outdev]',
            block_beat: 'BATTITO [tempo]',
            block_rest: 'Pausa [rticks] tick',
            // Menu items
            menu_keyOn: 'nota-on',
            menu_keyOff: 'nota-off',
            menu_ccChg: 'cambio-cc',
            menu_pBend: 'p-bend',
            menu_pgChg: 'cambio-prog'
        }
    };

    function _msg (key) {
        var lang = 'en';
        // TurboWarp stores the selected language in localStorage
        try {
            var stored = localStorage.getItem('tw:language');
            if (stored) lang = stored.substring(0, 2);
        } catch (e) { /* ignore */ }
        if (lang === 'en') {
            // Fallback to document / navigator
            lang = (document.documentElement.lang || navigator.language || 'en').substring(0, 2);
        }
        var msgs = STATUS_MESSAGES[lang] || STATUS_MESSAGES.en;
        return msgs[key] || STATUS_MESSAGES.en[key] || key;
    }

    // Detect Linux ALSA virtual loopback ports (e.g. "Midi Through Port-0")
    function _isVirtualPort (port) {
        var name = (port.name || '').toLowerCase();
        return name.indexOf('midi through') !== -1 || name.indexOf('virtual') !== -1;
    }

    function _hasRealOutputs () {
        if (!mOutputs || mOutputs.length === 0) return false;
        for (var i = 0; i < mOutputs.length; i++) {
            if (!_isVirtualPort(mOutputs[i])) return true;
        }
        return false;
    }

    function _allPortsVirtual () {
        if (!mInputs && !mOutputs) return false;
        var total = (mInputs ? mInputs.length : 0) + (mOutputs ? mOutputs.length : 0);
        if (total === 0) return false;
        var i;
        if (mInputs) {
            for (i = 0; i < mInputs.length; i++) {
                if (!_isVirtualPort(mInputs[i])) return false;
            }
        }
        if (mOutputs) {
            for (i = 0; i < mOutputs.length; i++) {
                if (!_isVirtualPort(mOutputs[i])) return false;
            }
        }
        return true;
    }

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

    // Status tracking
    var _midiStatusError = null; // null = OK, 'permissionDenied' or 'notSupported'

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

    function success (midiAccess) {
        mMIDI = midiAccess;
        _midiStatusError = null;

        for (var i = 0; i < 0x80; i++) {
            mCtlbuf[i] = 0;
            mNoteOn[i] = false;
            mNoteOff[i] = false;
        }

        if (typeof mMIDI.inputs === 'function') {
            mInputs = mMIDI.inputs();
            mOutputs = mMIDI.outputs();
        } else {
            var inputIterator = mMIDI.inputs.values();
            mInputs = [];
            for (var o = inputIterator.next(); !o.done; o = inputIterator.next()) {
                mInputs.push(o.value);
            }
            var outputIterator = mMIDI.outputs.values();
            mOutputs = [];
            for (var p = outputIterator.next(); !p.done; p = outputIterator.next()) {
                mOutputs.push(p.value);
            }
        }

        for (var j = 0; j < mInputs.length; j++) {
            mInputs[j].onmidimessage = m_midiin;
        }

        console.log('Glow MIDI: ' + _buildStatusString());

        // Monitor device hot-plug / unplug
        mMIDI.onstatechange = function () {
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

            for (var k = 0; k < mInputs.length; k++) {
                mInputs[k].onmidimessage = m_midiin;
            }

            if (mOutDev >= mOutputs.length) {
                mOutDev = 0;
            }

            console.log('Glow MIDI: devices changed. ' + _buildStatusString());
        };
    }

    function failure (error) {
        var eName = error ? error.name : '';
        if (eName === 'NotAllowedError') {
            _midiStatusError = 'permissionDenied';
            console.error('Glow MIDI: permission denied.', error);
        } else if (eName === 'SecurityError') {
            // Firefox rejects with SecurityError on non-secure (HTTP) origins
            _midiStatusError = 'securityError';
            console.error('Glow MIDI: security error (HTTPS required).', error);
        } else if (eName === 'AbortError') {
            // User dismissed the permission prompt
            _midiStatusError = 'permissionDenied';
            console.error('Glow MIDI: user dismissed permission prompt.', error);
        } else {
            _midiStatusError = 'notSupported';
            console.error('Glow MIDI: Web MIDI not available.', error);
        }
    }

    function _buildStatusString () {
        if (_midiStatusError) {
            return _msg(_midiStatusError);
        }
        var ins = mInputs ? mInputs.length : 0;
        var outs = mOutputs ? mOutputs.length : 0;
        if (ins === 0 && outs === 0) {
            return _msg('noDevices');
        }
        if (_allPortsVirtual()) {
            return _msg('onlyVirtual');
        }
        var inNames = [];
        var outNames = [];
        var i;
        if (mInputs) {
            for (i = 0; i < mInputs.length; i++) {
                var inName = mInputs[i].name;
                if (_isVirtualPort(mInputs[i])) inName += ' (' + _msg('virtual') + ')';
                inNames.push(inName);
            }
        }
        if (mOutputs) {
            for (i = 0; i < mOutputs.length; i++) {
                var outName = mOutputs[i].name;
                if (_isVirtualPort(mOutputs[i])) outName += ' (' + _msg('virtual') + ')';
                outNames.push(outName);
            }
        }
        var inStr = inNames.length > 0 ? inNames.join(', ') : _msg('none');
        var outStr = outNames.length > 0 ? outNames.join(', ') : _msg('none');
        return _msg('inLabel') + ': ' + inStr + ' | ' + _msg('outLabel') + ': ' + outStr;
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

            if (typeof navigator.requestMIDIAccess === 'function') {
                navigator.requestMIDIAccess({sysex: false}).then(success, failure);
            } else {
                _midiStatusError = 'notSupported';
                console.error('Glow MIDI: navigator.requestMIDIAccess not available.');
            }
        }

        getInfo () {
            return {
                id: 'glowMidi',
                name: 'Glow MIDI',
                color1: '#e61f5a',
                color2: '#c4174d',
                color3: '#9e1240',
                blocks: [
                    // --- Status ---
                    {
                        opcode: 's_MidiStatus',
                        text: _msg('block_status'),
                        blockType: Scratch.BlockType.REPORTER
                    },

                    '---',

                    // --- Reporters ---
                    {
                        opcode: 's_Note',
                        text: _msg('block_noteNum'),
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_Vel',
                        text: _msg('block_velocity'),
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_PBend',
                        text: _msg('block_pb'),
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_PChange',
                        text: _msg('block_pc'),
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_Ticks',
                        text: _msg('block_ticks'),
                        blockType: Scratch.BlockType.REPORTER
                    },
                    {
                        opcode: 's_Ccin',
                        text: _msg('block_cc'),
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
                        text: _msg('block_midiEvent'),
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getkeyon',
                        text: _msg('block_keyOn'),
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getkeyoff',
                        text: _msg('block_keyOff'),
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_PBevent',
                        text: _msg('block_pBend'),
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_PCevent',
                        text: _msg('block_prgChg'),
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getcc',
                        text: _msg('block_ctrlChg'),
                        blockType: Scratch.BlockType.HAT
                    },
                    {
                        opcode: 's_Getkeyonnum',
                        text: _msg('block_keyOnNum'),
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
                        text: _msg('block_keyOffNum'),
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
                        text: _msg('block_event'),
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
                        text: _msg('block_noteOnOut'),
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
                        text: _msg('block_noteOnDur'),
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
                        text: _msg('block_noteOffOut'),
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
                        text: _msg('block_prgChgOut'),
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
                        text: _msg('block_outDev'),
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
                        text: _msg('block_beat'),
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
                        text: _msg('block_rest'),
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
                            {text: _msg('menu_keyOn'), value: EventList.KEY_ON},
                            {text: _msg('menu_keyOff'), value: EventList.KEY_OF},
                            {text: _msg('menu_ccChg'), value: EventList.CC_CHG},
                            {text: _msg('menu_pBend'), value: EventList.P_BEND},
                            {text: _msg('menu_pgChg'), value: EventList.PG_CHG}
                        ]
                    }
                }
            };
        }

        /* ---- Status ---- */

        s_MidiStatus () {
            return _buildStatusString();
        }

        /* ---- No-device warning helper ---- */

        _warnNoDevice (util) {
            var msg;
            if (!mOutputs || mOutputs.length === 0) {
                msg = _msg('noDeviceWarning');
            } else {
                msg = _msg('onlyVirtualWarning');
            }
            console.warn('Glow MIDI: ' + msg);
            if (util && util.target && !util.target.isStage) {
                var target = util.target;
                // Approach 1: direct setSay on target (bypasses event system,
                // works even in TurboWarp compiled mode)
                if (typeof target.setSay === 'function') {
                    target.setSay('say', msg);
                }
                // Approach 2: emit SAY event (standard scratch-vm fallback)
                if (this.runtime && this.runtime.emit) {
                    this.runtime.emit('SAY', target, 'say', msg);
                }
            }
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

        s_Noteon_out (args, util) {
            if (!_hasRealOutputs()) { this._warnNoDevice(util); return; }
            var chnum = (args.channelnum & 0x0F) - 1;
            m_midiout(0x90 + chnum, args.notenum & 0x7F, args.velo & 0x7F);
        }

        s_Noteon_out_duration (args, util) {
            if (!_hasRealOutputs()) { this._warnNoDevice(util); return; }
            var chnum = (args.channelnum & 0x0F) - 1;
            var irticks = args.duration;
            if (irticks < 10) irticks = 10;
            var waittime = irticks / mResolution * 60 / mTempo * 1000;
            setTimeout(function () {
                m_midiout(0x80 + chnum, args.notenum & 0x7F, 0x40);
            }, waittime);
            m_midiout(0x90 + chnum, args.notenum & 0x7F, args.velo & 0x7F);
        }

        s_Noteoff_out (args, util) {
            if (!_hasRealOutputs()) { this._warnNoDevice(util); return; }
            var chnum = (args.channelnum & 0x0F) - 1;
            m_midiout(0x80 + chnum, args.notenum & 0x7F, args.velo & 0x7F);
        }

        s_ProgramChange (args, util) {
            if (!_hasRealOutputs()) { this._warnNoDevice(util); return; }
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
