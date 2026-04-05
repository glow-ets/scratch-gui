/**
 * Glow Sound Integrity Monitor
 * glow-ets/scratch-gui#8 — Solve volume problems
 *
 * Detects and repairs two classes of audio volume bugs:
 *
 * 1. Chromium auto-quieting bug: In Chromium-based browsers, switching in/out
 *    of the sound editor tab silently corrupts AudioBuffer sample data, reducing
 *    amplitude permanently. This monitor snapshots known-good buffer data and
 *    restores it when unauthorized modifications are detected.
 *
 * 2. Gain chain drift: The master GainNode (audioEngine.inputNode) can be
 *    unexpectedly modified by extensions or browser quirks. This monitor
 *    periodically checks the gain value and restores it if it drifts.
 *
 * @see https://github.com/glow-ets/scratch-gui/issues/8
 */

const ISSUE_URL = 'https://github.com/glow-ets/scratch-gui/issues/8';

// If RMS drops by more than this fraction without a legitimate edit, treat as corruption.
// The Chromium bug typically applies a 0.75x multiplier (like clicking "Softer"),
// which would be a ~25% RMS drop. 5% threshold catches even mild corruption.
const RMS_DROP_THRESHOLD = 0.05;

// How often to check the master gain node (ms)
const GAIN_CHECK_INTERVAL = 2000;

// Acceptable deviation from expected gain value
const GAIN_TOLERANCE = 0.01;

/**
 * Compute RMS (root mean square) of a Float32Array.
 * Returns 0 for empty arrays.
 * @param {Float32Array} samples
 * @returns {number}
 */
const computeRMS = samples => {
    if (!samples || samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
};

class GlowSoundMonitor {
    constructor () {
        /**
         * Map of soundId to snapshot: { samples: Float32Array (copy), rms: number }
         * @type {Map<string, {samples: Float32Array, rms: number}>}
         */
        this._snapshots = new Map();

        /**
         * Set of soundIds currently undergoing a legitimate user edit.
         * While a soundId is in this set, buffer changes are expected and not flagged.
         * @type {Set<string>}
         */
        this._legitimateEdits = new Set();

        /**
         * Timer for periodic gain chain checks.
         * @type {number|null}
         */
        this._gainCheckTimer = null;

        /**
         * The expected master gain value.
         * @type {number}
         */
        this._expectedGain = 1.0;

        /**
         * Reference to the audio engine being monitored.
         * @type {object|null}
         */
        this._audioEngine = null;
    }

    /**
     * Save a snapshot of an audio buffer's current state as known-good.
     * @param {string} soundId - unique sound identifier
     * @param {AudioBuffer} audioBuffer - the audio buffer to snapshot
     */
    snapshotBuffer (soundId, audioBuffer) {
        if (!audioBuffer || !soundId) return;
        const channelData = audioBuffer.getChannelData(0);
        // Store a copy — not a reference — so we can detect mutations
        const samplesCopy = new Float32Array(channelData.length);
        samplesCopy.set(channelData);
        const rms = computeRMS(channelData);
        this._snapshots.set(soundId, {samples: samplesCopy, rms});
    }

    /**
     * Check an audio buffer against its saved snapshot.
     * If the buffer's RMS has dropped significantly without a legitimate edit,
     * the buffer is restored from the snapshot.
     *
     * @param {string} soundId - unique sound identifier
     * @param {AudioBuffer} audioBuffer - the audio buffer to check
     * @returns {{corrupted: boolean, restored: boolean}} result
     */
    checkBuffer (soundId, audioBuffer) {
        const result = {corrupted: false, restored: false};
        if (!soundId || !audioBuffer) return result;

        // If this sound is currently being legitimately edited, skip check
        if (this._legitimateEdits.has(soundId)) return result;

        const snapshot = this._snapshots.get(soundId);
        if (!snapshot) return result;

        // For very quiet sounds (near-silence), skip RMS comparison —
        // tiny absolute changes would cause false positives
        if (snapshot.rms < 0.001) return result;

        const currentRMS = computeRMS(audioBuffer.getChannelData(0));
        const rmsDrop = (snapshot.rms - currentRMS) / snapshot.rms;

        if (rmsDrop > RMS_DROP_THRESHOLD) {
            result.corrupted = true;
            console.warn( // eslint-disable-line no-console
                `[Glow Sound Monitor] Buffer corruption detected for sound "${soundId}": ` +
                `RMS dropped ${(rmsDrop * 100).toFixed(1)}% ` +
                `(${snapshot.rms.toFixed(4)} → ${currentRMS.toFixed(4)}). ` +
                `Restoring from snapshot. See ${ISSUE_URL}`
            );
            result.restored = this._restoreBuffer(soundId, audioBuffer);
        }

        return result;
    }

    /**
     * Mark a sound as undergoing a legitimate user edit.
     * While marked, buffer changes won't be treated as corruption.
     * @param {string} soundId
     */
    markLegitimateEdit (soundId) {
        if (soundId) this._legitimateEdits.add(soundId);
    }

    /**
     * Clear the legitimate edit flag and update the snapshot with new buffer state.
     * Call this after a legitimate edit completes.
     * @param {string} soundId
     * @param {AudioBuffer} audioBuffer - the buffer with new legitimate content
     */
    commitLegitimateEdit (soundId, audioBuffer) {
        this._legitimateEdits.delete(soundId);
        if (audioBuffer) {
            this.snapshotBuffer(soundId, audioBuffer);
        }
    }

    /**
     * Remove a sound's snapshot (e.g. when a sound is deleted).
     * @param {string} soundId
     */
    removeSnapshot (soundId) {
        this._snapshots.delete(soundId);
        this._legitimateEdits.delete(soundId);
    }

    /**
     * Start periodic monitoring of the audio engine's master gain node.
     * @param {object} audioEngine - engine with inputNode.gain.value
     */
    startGainMonitor (audioEngine) {
        if (!audioEngine || !audioEngine.inputNode) return;
        this._audioEngine = audioEngine;
        this._expectedGain = audioEngine.inputNode.gain.value;
        this.stopGainMonitor();
        this._gainCheckTimer = setInterval(
            () => this._checkGain(),
            GAIN_CHECK_INTERVAL
        );
    }

    /**
     * Stop the periodic gain monitor.
     */
    stopGainMonitor () {
        if (this._gainCheckTimer !== null) {
            clearInterval(this._gainCheckTimer);
            this._gainCheckTimer = null;
        }
    }

    /**
     * Set the expected master gain value. Call this when the user explicitly
     * changes project volume (e.g. via a "project volume" addon).
     * @param {number} gain
     */
    setExpectedGain (gain) {
        this._expectedGain = gain;
    }

    /**
     * Check and repair the master gain if it has drifted unexpectedly.
     * @returns {{drifted: boolean, restored: boolean}}
     */
    _checkGain () {
        const result = {drifted: false, restored: false};
        if (!this._audioEngine || !this._audioEngine.inputNode) return result;

        const currentGain = this._audioEngine.inputNode.gain.value;
        const deviation = Math.abs(currentGain - this._expectedGain);

        if (deviation > GAIN_TOLERANCE) {
            result.drifted = true;
            console.warn( // eslint-disable-line no-console
                `[Glow Sound Monitor] Master gain drifted: ` +
                `expected ${this._expectedGain.toFixed(3)}, ` +
                `got ${currentGain.toFixed(3)}. ` +
                `Restoring. See ${ISSUE_URL}`
            );
            this._audioEngine.inputNode.gain.value = this._expectedGain;
            result.restored = true;
        }

        return result;
    }

    /**
     * Restore an audio buffer's channel data from the saved snapshot.
     * @param {string} soundId
     * @param {AudioBuffer} audioBuffer
     * @returns {boolean} true if restoration succeeded
     */
    _restoreBuffer (soundId, audioBuffer) {
        const snapshot = this._snapshots.get(soundId);
        if (!snapshot) return false;

        try {
            const channelData = audioBuffer.getChannelData(0);
            channelData.set(snapshot.samples);
            console.log( // eslint-disable-line no-console
                `[Glow Sound Monitor] Buffer restored for sound "${soundId}". See ${ISSUE_URL}`
            );
            return true;
        } catch (e) {
            console.error( // eslint-disable-line no-console
                `[Glow Sound Monitor] Failed to restore buffer for sound "${soundId}":`, e
            );
            return false;
        }
    }

    /**
     * Check if a snapshot exists for the given soundId.
     * @param {string} soundId
     * @returns {boolean}
     */
    hasSnapshot (soundId) {
        return this._snapshots.has(soundId);
    }

    /**
     * Get the number of tracked snapshots (for testing/debugging).
     * @returns {number}
     */
    get snapshotCount () {
        return this._snapshots.size;
    }

    /**
     * Dispose of all snapshots and stop monitoring.
     */
    dispose () {
        this.stopGainMonitor();
        this._snapshots.clear();
        this._legitimateEdits.clear();
        this._audioEngine = null;
    }
}

// Module-level singleton
const glowSoundMonitor = new GlowSoundMonitor();

// Also export the class and utility for testing
export {GlowSoundMonitor, computeRMS};
export default glowSoundMonitor;
