/**
 * glow-ets/scratch-gui#23 - a running script detached from its hat cannot be
 * stopped by clicking it.
 *
 * Replays the six steps of the report against the real Runtime.toggleScript and
 * Runtime.startHats, with nothing of ours in the picture. The hat metadata used
 * here is stock `event_whengreaterthan`'s, which is also Glow ML's.
 *
 *     node test/glow/detached-script.js
 */
const {readVmSource, method, check, done} = require('./lift');

const src = readVmSource('engine/runtime.js');
const Thread = {STATUS_DONE: 4, STATUS_RUNNING: 0};

// startHats evaluates the hat predicate on each thread it starts; here it
// always says yes, which is what "a category was just recognised" looks like.
const execute = () => {};
const compilerExecute = () => {};
compilerExecute.saveGlobalState = () => {};
compilerExecute.restoreGlobalState = () => {};

const Runtime = new Function('Thread', 'execute', 'compilerExecute', `return class Runtime {
    constructor (hats) { this.threads = []; this._hats = hats; this.log = []; }
    getIsEdgeActivatedHat (opcode) {
        return Boolean(this._hats[opcode] && this._hats[opcode].edgeActivated);
    }
    _stopThread (thread) {
        thread.status = Thread.STATUS_DONE;
        this.threads.splice(this.threads.indexOf(thread), 1);
        this.log.push(\`stopped the thread whose top block is \${thread.topBlock}\`);
    }
    _pushThread (topBlockId, target, opts) {
        const thread = {topBlock: topBlockId, target, status: Thread.STATUS_RUNNING,
            stackClick: Boolean(opts && opts.stackClick), goToNextBlock: () => {}};
        this.threads.push(thread);
        this.log.push(\`started a thread on \${topBlockId}\${thread.stackClick ? ' (stack click)' : ''}\`);
        return thread;
    }
    allScriptsByOpcodeDo (opcode, f) {
        for (const script of this.scripts) {
            if (script.opcode === opcode) f({blockId: script.blockId, fieldsOfInputs: {}}, this._editingTarget);
        }
    }
${method(src, 'toggleScript')}
${method(src, 'startHats')}
};`)(Thread, execute, compilerExecute);

const runtime = new Runtime({glow_whenReceived: {edgeActivated: true, restartExistingThreads: false}});

const blocks = {
    _blocks: {
        hat: {id: 'hat', opcode: 'glow_whenReceived', parent: null, next: 'forever'},
        forever: {id: 'forever', opcode: 'control_forever', parent: 'hat', next: null}
    },
    getBlock (id) {
        return this._blocks[id];
    },
    getOpcode (block) {
        return block && block.opcode;
    }
};
const target = {blocks, id: 'sprite'};
runtime._editingTarget = target;
runtime.executableTargets = [target];
runtime.scripts = [{blockId: 'hat', opcode: 'glow_whenReceived'}];

const tops = () => runtime.threads.map(thread => `${thread.topBlock}${thread.stackClick ? '(click)' : ''}`);
const say = () => {
    runtime.log.forEach(line => process.stdout.write(`       ${line}\n`));
    runtime.log = [];
};

// 2. The hat fires and runs the forever inside it.
runtime.startHats('glow_whenReceived');
check('the hat starts one thread', tops(), ['hat']);
say();

// 3. It keeps firing, and does not start a second one.
runtime.startHats('glow_whenReceived');
check('and does not stack up another on the next tick', tops(), ['hat']);

// 4. The forever is dragged out of the hat while it is running.
blocks._blocks.hat.next = null;
blocks._blocks.forever.parent = null;
check('detaching the forever leaves the thread alone', tops(), ['hat']);

// 5. The detached forever is clicked, to stop it.
runtime.toggleScript('forever', {target, stackClick: true});
check('clicking it starts a SECOND thread instead of stopping the first',
    tops(), ['hat', 'forever(click)']);
say();
runtime.toggleScript('forever', {target, stackClick: true});
check('clicking again stops only that second one', tops(), ['hat']);
say();

// The first thread is unreachable, and blocks the hat for good.
runtime.startHats('glow_whenReceived');
check('and the hat can never fire again', tops(), ['hat']);
check('so the thread nobody can click is still running', runtime.threads.length, 1);

process.stdout.write(
    '\ntoggleScript matches a thread by the top block it STARTED with, which is\n' +
    'still the hat. The block the user clicks is the detached forever, so nothing\n' +
    'matches and a second thread is started instead. startHats then refuses to\n' +
    'fire the hat because a thread with that top block is running - the very one\n' +
    'no click can reach. Only the Stop button clears it.\n'
);
done();
