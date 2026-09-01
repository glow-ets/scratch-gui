/**
 * Glow ML — the checks that stand between a classroom and a corrupt or hostile input.
 * glow-ets/scratch-gui#21
 *
 * These exercise the real shipped file. It is served as a plain script rather than
 * bundled, so it reads `Scratch` and `location` at module scope; both are guarded so
 * that requiring it here defines the class and the pure helpers without fetching ml5
 * or registering anything. The class itself needs a DOM and cannot be built here.
 */
import {
    validateCategoryName,
    vetTrainingData,
    sortCategories,
    formatBytes,
    MAX_CATEGORY_NAME_LENGTH,
    MAX_EXAMPLES_TOTAL,
    MAX_EXAMPLES_PER_CATEGORY
} from '../../../src/extensions/glow-ml/glow-ml.js';

// Written as escapes on purpose: these are exactly the characters that are invisible
// in an editor, which is half of why they are refused.
const ZERO_WIDTH_SPACE = '​';
const RIGHT_TO_LEFT_OVERRIDE = '‮';
const CONTROL = '';
const CAT_FACE = '\u{1F431}';
const WOMAN_ASTRONAUT = '\u{1F469}‍\u{1F680}';

describe('validateCategoryName', () => {
    test('accepts an ordinary name', () => {
        expect(validateCategoryName('cat').ok).toBe(true);
        expect(validateCategoryName('a-b_c 1').ok).toBe(true);
    });

    test('accepts other alphabets, so Italian is not a special case', () => {
        expect(validateCategoryName('città').ok).toBe(true);
        expect(validateCategoryName('Ελλάδα').ok).toBe(true);
        expect(validateCategoryName('猫').ok).toBe(true);
    });

    test('accepts emoji, including multi-part ones', () => {
        expect(validateCategoryName(CAT_FACE).ok).toBe(true);
        expect(validateCategoryName(`gatto ${CAT_FACE}`).ok).toBe(true);
        expect(validateCategoryName(WOMAN_ASTRONAUT).ok).toBe(true);
    });

    test('trims, and treats an empty answer as a cancel rather than an error', () => {
        expect(validateCategoryName('  spaced  ').name).toBe('spaced');
        expect(validateCategoryName('').reason).toBe('empty');
        expect(validateCategoryName('   ').reason).toBe('empty');
    });

    test('counts length in code points, so an emoji costs one', () => {
        expect(validateCategoryName('x'.repeat(MAX_CATEGORY_NAME_LENGTH)).ok).toBe(true);
        expect(validateCategoryName('x'.repeat(MAX_CATEGORY_NAME_LENGTH + 1)).reason).toBe('long');
        expect(validateCategoryName(CAT_FACE.repeat(MAX_CATEGORY_NAME_LENGTH)).ok).toBe(true);
        expect(validateCategoryName(CAT_FACE.repeat(MAX_CATEGORY_NAME_LENGTH + 1)).reason).toBe('long');
    });

    test('refuses characters that would garble the reporter or the alerts', () => {
        // ':' and a double space are the separators in 'categories and counts', so a
        // name containing them could forge a second entry.
        expect(validateCategoryName('a:b').reason).toBe('characters');
        expect(validateCategoryName('a\nb').reason).toBe('characters');
        expect(validateCategoryName('a\tb').reason).toBe('characters');
        expect(validateCategoryName(`a${CONTROL}b`).reason).toBe('characters');
        // Invisible: one makes a name that looks empty or looks like another one, the
        // other reverses the rendering of everything after it.
        expect(validateCategoryName(ZERO_WIDTH_SPACE).reason).toBe('characters');
        expect(validateCategoryName(`a${RIGHT_TO_LEFT_OVERRIDE}b`).reason).toBe('characters');
    });

    test('refuses the menu sentinels', () => {
        // A real category called 'all' would share a dropdown value with the item that
        // wipes every category.
        expect(validateCategoryName('all').reason).toBe('reserved');
        expect(validateCategoryName('any').reason).toBe('reserved');
    });

    test('refuses names that read back off Object.prototype', () => {
        // The extension indexes plain objects by these; 'count of [constructor]' used
        // to report a function, and 'when I recognize [__proto__]' fired for ever.
        expect(validateCategoryName('__proto__').reason).toBe('reserved');
        expect(validateCategoryName('constructor').reason).toBe('reserved');
        expect(validateCategoryName('prototype').reason).toBe('reserved');
        expect(validateCategoryName('toString').reason).toBe('reserved');
        expect(validateCategoryName('length').reason).toBe('reserved');
    });

    test('refuses anything that is not a string', () => {
        [null, undefined, 42, {}, [], true].forEach(value => {
            expect(validateCategoryName(value).ok).toBe(false);
        });
    });

    test('spots a duplicate the way the sort compares, ignoring case', () => {
        expect(validateCategoryName('CAT', ['cat']).reason).toBe('duplicate');
        expect(validateCategoryName('cat', ['cat']).reason).toBe('duplicate');
        expect(validateCategoryName('dog', ['cat']).ok).toBe(true);
    });

    test('composes, so one accented letter is not two different names', () => {
        const composed = 'café';
        const decomposed = 'café';
        expect(validateCategoryName(decomposed).name).toBe(composed);
        expect(validateCategoryName(decomposed, [composed]).reason).toBe('duplicate');
    });
});

describe('vetTrainingData', () => {
    const COLS = 4;
    const values = n => {
        const out = {};
        for (let i = 0; i < n; i++) {
            out[i] = i * 0.5;
        }
        return out;
    };
    const dataset = (rows, label = 'cat') => ({
        dataset: {0: {label, shape: [rows, COLS], dtype: 'float32'}},
        tensors: [values(rows * COLS)]
    });

    test('accepts what the download block writes', () => {
        expect(vetTrainingData(dataset(2)).ok).toBe(true);
        expect(vetTrainingData(dataset(7)).examples).toBe(7);
        expect(vetTrainingData({dataset: {}, tensors: []}).ok).toBe(true);
    });

    test('refuses anything that is not an object', () => {
        // ml5 treats a non-object as a URL and fetches it, so a one-line JSON file
        // could otherwise make the browser issue a cross-origin request.
        expect(vetTrainingData('https://example.com/x.json').ok).toBe(false);
        expect(vetTrainingData(null).ok).toBe(false);
        expect(vetTrainingData(42).ok).toBe(false);
        expect(vetTrainingData([]).ok).toBe(false);
        expect(vetTrainingData({}).ok).toBe(false);
    });

    test('refuses a dataset and tensors that disagree', () => {
        const extra = dataset(2);
        extra.tensors.push(values(COLS));
        expect(vetTrainingData(extra).ok).toBe(false);

        const wrongCount = dataset(2);
        wrongCount.tensors[0] = values(3);
        expect(vetTrainingData(wrongCount).ok).toBe(false);
    });

    test('refuses a shape that is not two whole non-negative numbers', () => {
        [[2], [2, 4, 6], [-1, COLS], [1.5, COLS], [2, 0], ['2', COLS], null].forEach(shape => {
            const bad = dataset(2);
            bad.dataset[0].shape = shape;
            expect(vetTrainingData(bad).ok).toBe(false);
        });
    });

    test('refuses values that are not finite numbers', () => {
        const withNull = dataset(2);
        withNull.tensors[0][0] = null;
        expect(vetTrainingData(withNull).ok).toBe(false);

        const withText = dataset(2);
        withText.tensors[0][1] = 'x';
        expect(vetTrainingData(withText).ok).toBe(false);
    });

    test('refuses a label that could not have been typed', () => {
        expect(vetTrainingData(dataset(2, 'a:b')).reason).toBe('name');
        expect(vetTrainingData(dataset(2, '')).reason).toBe('name');
        expect(vetTrainingData(dataset(2, '__proto__')).reason).toBe('name');
        expect(vetTrainingData(dataset(2, 'x'.repeat(500))).reason).toBe('name');

        const noLabel = dataset(2);
        delete noLabel.dataset[0].label;
        // An unlabelled class is invisible to the counts, which is what let a loaded
        // file walk straight past both caps.
        expect(vetTrainingData(noLabel).reason).toBe('name');
    });

    test('enforces the caps that a file would otherwise walk past', () => {
        expect(vetTrainingData(dataset(MAX_EXAMPLES_PER_CATEGORY)).ok).toBe(true);
        expect(vetTrainingData(dataset(MAX_EXAMPLES_PER_CATEGORY + 1)).reason).toBe('per-category');

        const many = {dataset: {}, tensors: []};
        for (let i = 0; i * MAX_EXAMPLES_PER_CATEGORY <= MAX_EXAMPLES_TOTAL; i++) {
            many.dataset[i] = {
                label: `cat ${i}`,
                shape: [MAX_EXAMPLES_PER_CATEGORY, COLS],
                dtype: 'float32'
            };
            many.tensors.push(values(MAX_EXAMPLES_PER_CATEGORY * COLS));
        }
        expect(vetTrainingData(many).reason).toBe('total');
    });
});

describe('sortCategories', () => {
    test('sorts numerically, so 10 follows 2', () => {
        expect(sortCategories(['category 10', 'category 2'])).toEqual(['category 2', 'category 10']);
    });

    test('ignores case, which is why duplicates are checked that way too', () => {
        expect(sortCategories(['b', 'A'])).toEqual(['A', 'b']);
    });
});

describe('formatBytes', () => {
    test('reads like a size', () => {
        expect(formatBytes(0)).toBe('0 bytes');
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(8 * 1024 * 1024)).toBe('8 MB');
    });

    test('says something sensible about a number it was not given', () => {
        // This ends up in a message a child reads, where it used to say 'NaN KB'.
        expect(formatBytes(undefined)).not.toMatch('NaN');
        expect(formatBytes(-1)).not.toMatch('NaN');
    });
});
