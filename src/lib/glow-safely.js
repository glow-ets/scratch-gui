import log from './log.js';

/**
 * Glow: run a scratch-blocks glow call, tolerating a block the workspace no
 * longer has. glow-ets/scratch-gui#24
 *
 * scratch-blocks throws when asked to glow, un-glow or report on a block id it
 * does not know, and the VM can ask for exactly that: a glow is requested for a
 * block id captured on an earlier frame, and the editor may have deleted that
 * block since. Runtime.quietGlow (called from the VM's blocks.js when a
 * top-level block is deleted) covers the common case, but an id in
 * _scriptGlowsPreviousFrame that is no longer top-level when it is deleted
 * slips past it.
 *
 * Letting the throw through is far worse than a stale highlight. The glow
 * handlers run synchronously inside runtime._step(), so the exception unwinds
 * through _updateGlows() and skips the rest of the step, including
 * renderer.draw() - the stage simply stops being repainted. It also skips the
 * reassignment of _scriptGlowsPreviousFrame, so the same dead id is retried on
 * the next frame; and the step loop is a setInterval, which happily keeps
 * calling a callback that keeps throwing. The editor never recovers.
 *
 * This is defence in depth, not a root-cause fix. The VM cannot know what the
 * editor currently has on screen, and the cost of being wrong should be a
 * missing highlight rather than a dead editor.
 * @param {string} id - the block scratch-blocks may or may not have
 * @param {Function} glow - the scratch-blocks call to attempt
 */
const glowSafely = (id, glow) => {
    try {
        glow();
    } catch (e) {
        // scratch-blocks throws a bare string here, not an Error.
        log.warn(`ignoring a glow for block ${id}, which the workspace does not have`, e);
    }
};

export default glowSafely;
