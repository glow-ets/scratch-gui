/**
 * Download the MobileNet weights that Glow ML needs to run without the
 * internet. glow-ets/scratch-gui#21
 *
 *   node scripts/glow-fetch-mobilenet.mjs
 *
 * ml5's featureExtractor loads two models, and each model.json lists its weight
 * shards in a weightsManifest. The model.json files are committed; the shards
 * are not, because they are binary and there are 56 of them. This reads the
 * manifests already in the tree and fetches exactly what they ask for, next to
 * the model.json that references them, which is where tfjs looks.
 *
 * Re-running is cheap: files already the right size are skipped.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const BYTES_PER_DTYPE = {
    float32: 4, int32: 4, complex64: 8, float16: 2, uint16: 2, uint8: 1, bool: 1
};

const MODELS = [
    {
        dir: 'src/extensions/glow-ml/mobilenet',
        base: 'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/'
    },
    {
        dir: 'src/extensions/glow-ml/mobilenet-graph',
        base: 'https://tfhub.dev/google/imagenet/mobilenet_v1_025_224/classification/1/',
        query: '?tfjs-format=file'
    }
];

/** @param {object} group one weightsManifest entry @returns {number} its size in bytes */
const groupBytes = group => group.weights.reduce((total, weight) => {
    const elements = weight.shape.reduce((a, b) => a * b, 1);
    return total + (elements * (BYTES_PER_DTYPE[weight.dtype] ?? 4));
}, 0);

const download = async (url, destination, expectedBytes) => {
    const existing = await fs.stat(destination).catch(() => null);
    if (existing && existing.size === expectedBytes) {
        console.log(`  ok      ${path.basename(destination)} (already ${existing.size} bytes)`);
        return;
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} for ${url}`);
    }
    const body = Buffer.from(await response.arrayBuffer());

    // A 404 page or an SPA fallback is still a 200 on some servers, and tfjs
    // will happily decode it as weights and fail much later with a confusing
    // "byte length ... should be a multiple of 4". Check the size here instead.
    if (body.length !== expectedBytes) {
        throw new Error(
            `${url}\n    expected ${expectedBytes} bytes, got ${body.length}. ` +
            `Not writing it - a wrong-sized shard breaks the model at load time.`
        );
    }
    await fs.writeFile(destination, body);
    console.log(`  fetched ${path.basename(destination)} (${body.length} bytes)`);
};

for (const model of MODELS) {
    const manifestPath = path.join(model.dir, 'model.json');
    console.log(`\n${manifestPath}`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    for (const group of manifest.weightsManifest) {
        const expectedBytes = groupBytes(group);
        for (const shard of group.paths) {
            await download(
                `${model.base}${shard}${model.query ?? ''}`,
                path.join(model.dir, shard),
                expectedBytes
            );
        }
    }
}

console.log('\nDone. Commit the shards alongside the model.json files.');
