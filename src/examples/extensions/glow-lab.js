// Glow Lab extension
// Initial placeholder extension for the Glow Lab platform.

(function (Scratch) {
    'use strict';

    class GlowLab {
        getInfo () {
            return {
                id: 'glowLab',
                name: 'Glow Lab',
                color1: '#FF8C00',
                color2: '#FFB800',
                color3: '#E67E00',
                blocks: [
                    {
                        opcode: 'glowSay',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'glow say [TEXT]',
                        arguments: {
                            TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Hello from Glow Lab!'
                            }
                        }
                    },
                    {
                        opcode: 'glowVersion',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'glow lab version'
                    },
                    {
                        opcode: 'glowTimestamp',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'current timestamp'
                    }
                ]
            };
        }

        glowSay (args, util) {
            const target = util.target;
            if (target && target.setCustomState) {
                // Log to console for debugging
                console.log('[Glow Lab]', args.TEXT);
            }
            // Use runtime to show bubble if available
            if (util.runtime && util.runtime.emit) {
                util.runtime.emit('SAY', target, 'say', String(args.TEXT));
            }
        }

        glowVersion () {
            return '0.1.0';
        }

        glowTimestamp () {
            return Date.now();
        }
    }

    Scratch.extensions.register(new GlowLab());
})(Scratch);
