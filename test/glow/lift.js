/**
 * Helpers shared by the diagnostic harnesses in this directory. See README.md.
 *
 * These read scratch-vm's source as text and pull single methods out of it, so
 * that a demonstration runs the real code without having to stand up a whole
 * Runtime, Target and renderer. That makes the demonstrations short and exact,
 * at the cost of breaking loudly if upstream renames a method - which is fine,
 * since they are evidence attached to an issue rather than regression tests.
 */
const fs = require('fs');
const path = require('path');

/**
 * @returns {string} where scratch-vm's sources are
 */
const scratchVmDir = () => {
    try {
        return path.join(path.dirname(require.resolve('scratch-vm/package.json')), 'src');
    } catch (e) {
        // A sibling checkout, which is how the fork is usually developed.
        const sibling = path.join(__dirname, '..', '..', '..', 'scratch-vm', 'src');
        if (fs.existsSync(sibling)) {
            return sibling;
        }
        throw new Error('cannot find scratch-vm; npm install, or check out the fork alongside this one');
    }
};

/**
 * @param {string} relativePath - a path under scratch-vm/src
 * @returns {string} its contents
 */
const readVmSource = relativePath => fs.readFileSync(path.join(scratchVmDir(), relativePath), 'utf8');

/**
 * Cut one class method out of a source file, braces balanced.
 * @param {string} source - the whole file
 * @param {string} name - the method name, as declared
 * @param {number} [indent] - how deeply the method is indented
 * @returns {string} the method, ready to paste into a class body
 */
const method = (source, name, indent = 4) => {
    const start = source.search(new RegExp(`\\n {${indent}}${name} \\(`));
    if (start < 0) {
        throw new Error(`no method ${name} in this source`);
    }
    let depth = 0;
    for (let j = source.indexOf('{', start); j < source.length; j++) {
        if (source[j] === '{') {
            depth++;
        } else if (source[j] === '}' && --depth === 0) {
            return source.slice(start + 1, j + 1);
        }
    }
    throw new Error(`unbalanced braces in ${name}`);
};

/**
 * Print one check and remember whether it held.
 */
const results = [];

/**
 * @param {string} label - what is being checked
 * @param {*} actual - what happened
 * @param {*} expected - what should have happened
 */
const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push(ok);
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${label}\n`);
    if (!ok) {
        process.stdout.write(`       got  ${JSON.stringify(actual)}\n`);
        process.stdout.write(`       want ${JSON.stringify(expected)}\n`);
    }
};

/**
 * Exit with the right status once everything has run.
 */
const done = () => {
    const failed = results.filter(ok => !ok).length;
    process.stdout.write(failed ? `\n${failed} failed\n` : '\nall passed\n');
    process.exit(failed ? 1 : 0);
};

module.exports = {readVmSource, method, check, done};
