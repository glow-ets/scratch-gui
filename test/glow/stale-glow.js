/**
 * glow-ets/scratch-gui#24 - a glow for a deleted block throws inside
 * runtime._step() and freezes the stage.
 *
 * This is a NEGATIVE result kept as evidence: it drives the real
 * Runtime._updateGlows, Runtime.quietGlow and Blocks.getTopLevelScript through
 * the sequence that looked like the obvious cause - detach a running block,
 * drop it back, delete the script - and shows the VM turning every glow off
 * cleanly while the block still exists. So that hypothesis is wrong, and the
 * real trigger for #24 is still open.
 *
 * Run it against a candidate sequence before claiming one:
 *
 *     node test/glow/stale-glow.js
 */
const {readVmSource, method, check, done} = require('./lift');

const runtimeSrc = readVmSource('engine/runtime.js');
const blocksSrc = readVmSource('engine/blocks.js');

const Runtime = new Function(`return class Runtime {
    constructor () { this._scriptGlowsPreviousFrame = []; this.threads = []; this.emitted = []; }
    emit (name, data) { this.emitted.push([name, data.id]); }
    static get SCRIPT_GLOW_ON () { return 'SCRIPT_GLOW_ON'; }
    static get SCRIPT_GLOW_OFF () { return 'SCRIPT_GLOW_OFF'; }
${method(runtimeSrc, '_updateGlows')}
${method(runtimeSrc, 'quietGlow')}
${method(runtimeSrc, 'glowScript')}
};`)();

const Blocks = new Function(`return class Blocks {
    constructor () { this._blocks = {}; this._scripts = []; }
    resetCache () {}
    emitProjectChanged () {}
${method(blocksSrc, 'getTopLevelScript')}
${method(blocksSrc, '_addScript')}
${method(blocksSrc, '_deleteScript')}
${method(blocksSrc, 'deleteBlock')}
};`)();

const runtime = new Runtime();
const blocks = new Blocks();
runtime.flyoutBlocks = new Blocks();

const target = {blocks};
runtime._editingTarget = target;

// A hat with one long-running block under it, and a thread stopped inside that
// block - which is what keeps a script glowing frame after frame.
blocks._blocks.hat = {id: 'hat', parent: null, next: 'forever', inputs: {}, topLevel: true};
blocks._blocks.forever = {id: 'forever', parent: 'hat', next: null, inputs: {}, topLevel: false};
blocks._scripts.push('hat');
runtime.threads.push({
    target,
    blockGlowInFrame: 'forever',
    requestScriptGlowInFrame: true,
    stackClick: false
});

/**
 * One pass of _updateGlows, reporting any glow aimed at a block that is gone.
 * Those are the ones scratch-blocks throws on.
 * @param {string} label - what just happened in the editor
 * @returns {Array} the glows aimed at blocks that no longer exist
 */
const frame = label => {
    runtime.emitted = [];
    runtime._updateGlows();
    const events = runtime.emitted.map(([name, id]) =>
        `${name}(${id})${blocks._blocks[id] ? '' : ' <-- BLOCK IS GONE'}`);
    process.stdout.write(`     ${label.padEnd(42)} ${events.join(', ') || '-'}\n`);
    return runtime.emitted.filter(([, id]) => !blocks._blocks[id]);
};

let stale = [];
stale = stale.concat(frame('running under the hat'));

// The pupil drags the running block out. scratch-blocks reports a move with no
// new parent, so the VM makes it a script of its own.
blocks._blocks.hat.next = null;
blocks._blocks.forever.parent = null;
blocks._addScript('forever');
stale = stale.concat(frame('dragged out, still running'));

// ...and drops it back under the hat.
blocks._deleteScript('forever');
blocks._blocks.forever.parent = 'hat';
blocks._blocks.hat.next = 'forever';
stale = stale.concat(frame('dropped back under the hat'));

// Then deletes the whole script. blocks.js calls quietGlow for the deleted
// top-level block, which is the hat.
runtime.quietGlow('hat');
blocks.deleteBlock('hat');
runtime.threads.length = 0;
stale = stale.concat(frame('script deleted'));
stale = stale.concat(frame('next frame'));

check('this sequence produces no glow for a deleted block', stale, []);
process.stdout.write(
    '\nSo detach / re-attach / delete is NOT the cause of #24: every glow is turned\n' +
    'off while its block is still there. Whatever leaves a dead id in\n' +
    '_scriptGlowsPreviousFrame is something else.\n'
);
done();
