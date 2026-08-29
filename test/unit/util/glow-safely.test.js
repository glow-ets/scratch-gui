import glowSafely from '../../../src/lib/glow-safely.js';
import log from '../../../src/lib/log.js';

jest.mock('../../../src/lib/log.js', () => ({warn: jest.fn()}));

// scratch-blocks throws a bare string, not an Error, for an id the workspace
// does not know. glow-ets/scratch-gui#24
const missingBlock = () => {
    throw 'Tried to glow stack on block that does not exist.';
};

describe('glowSafely', () => {
    beforeEach(() => log.warn.mockClear());

    test('runs the glow when the block is there', () => {
        const glow = jest.fn();
        glowSafely('hat', glow);
        expect(glow).toHaveBeenCalledTimes(1);
        expect(log.warn).not.toHaveBeenCalled();
    });

    test('swallows the throw when the block is gone', () => {
        expect(() => glowSafely('gone', missingBlock)).not.toThrow();
    });

    test('and says which block it was', () => {
        glowSafely('gone', missingBlock);
        expect(log.warn).toHaveBeenCalledTimes(1);
        expect(log.warn.mock.calls[0][0]).toContain('gone');
    });

    test('so the caller can carry on', () => {
        // This is the whole point: these handlers run inside runtime._step(),
        // and a throw here skips renderer.draw() for that frame and every
        // frame after it.
        const step = () => {
            glowSafely('gone', missingBlock);
            return 'drew the frame';
        };
        expect(step()).toBe('drew the frame');
    });

    test('an Error is caught just the same', () => {
        expect(() => glowSafely('gone', () => {
            throw new Error('something else');
        })).not.toThrow();
    });
});
