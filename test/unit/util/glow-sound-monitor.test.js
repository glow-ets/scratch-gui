/* global WebAudioTestAPI */
import 'web-audio-test-api';

import {GlowSoundMonitor, computeRMS} from '../../../src/lib/audio/glow-sound-monitor';

/**
 * Tests for Glow Sound Integrity Monitor
 * @see https://github.com/glow-ets/scratch-gui/issues/8
 *
 * These tests verify that the monitor can:
 * 1. Detect silent buffer corruption (the Chromium auto-quieting bug)
 * 2. Restore corrupted buffers from known-good snapshots
 * 3. Ignore legitimate user edits (Louder, Softer, etc.)
 * 4. Detect and restore master gain drift
 *
 * The "evil sound changer" pattern simulates the Chromium bug by silently
 * reducing all sample amplitudes, which is exactly what the bug does.
 */

describe('computeRMS', () => {
    test('returns 0 for empty array', () => {
        expect(computeRMS(new Float32Array(0))).toEqual(0);
    });

    test('returns 0 for null/undefined', () => {
        expect(computeRMS(null)).toEqual(0);
        expect(computeRMS(undefined)).toEqual(0);
    });

    test('computes correct RMS for known values', () => {
        // samples = [1, 0, -1, 0] => sum of squares = 2, mean = 0.5, sqrt = ~0.707
        const samples = new Float32Array([1, 0, -1, 0]);
        expect(computeRMS(samples)).toBeCloseTo(Math.SQRT1_2, 5);
    });

    test('computes correct RMS for uniform signal', () => {
        const samples = new Float32Array([0.5, 0.5, 0.5, 0.5]);
        expect(computeRMS(samples)).toBeCloseTo(0.5, 5);
    });
});

describe('GlowSoundMonitor — Buffer Integrity', () => {
    let monitor;
    let audioContext;

    beforeEach(() => {
        monitor = new GlowSoundMonitor();
        audioContext = new AudioContext();
        // Suppress console output during tests
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        monitor.dispose();
        jest.restoreAllMocks();
    });

    /**
     * Helper: create an AudioBuffer with known sample values.
     */
    const makeBuffer = (samples) => {
        const buffer = audioContext.createBuffer(1, samples.length, 44100);
        buffer.getChannelData(0).set(new Float32Array(samples));
        return buffer;
    };

    /**
     * "Evil sound changer" — simulates the Chromium auto-quieting bug
     * by silently reducing all sample amplitudes by a given factor.
     * This is exactly what the bug does: applies a gain < 1.0 to the
     * stored Float32Array data without any user action.
     */
    const evilSoundChanger = (audioBuffer, factor = 0.5) => {
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < channelData.length; i++) {
            channelData[i] *= factor;
        }
    };

    test('snapshot and verify — clean buffer passes check', () => {
        const buffer = makeBuffer([0.5, -0.3, 0.8, -0.1, 0.6]);
        monitor.snapshotBuffer('sound1', buffer);

        const result = monitor.checkBuffer('sound1', buffer);
        expect(result.corrupted).toBe(false);
        expect(result.restored).toBe(false);
    });

    test('detect evil changer — 50% amplitude reduction is caught', () => {
        const buffer = makeBuffer([0.5, -0.3, 0.8, -0.1, 0.6]);
        monitor.snapshotBuffer('sound1', buffer);

        // Evil changer strikes! Simulates Chromium bug
        evilSoundChanger(buffer, 0.5);

        const result = monitor.checkBuffer('sound1', buffer);
        expect(result.corrupted).toBe(true);
        expect(result.restored).toBe(true);

        // Console warning should have been emitted
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Buffer corruption detected')
        );
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('glow-ets/scratch-gui/issues/8')
        );
    });

    test('detect evil changer — 75% amplitude (Softer-like) reduction is caught', () => {
        const buffer = makeBuffer([0.8, -0.6, 0.9, -0.7, 0.5]);
        monitor.snapshotBuffer('sound1', buffer);

        // The Chromium bug often applies ~0.75x (like clicking "Softer")
        evilSoundChanger(buffer, 0.75);

        const result = monitor.checkBuffer('sound1', buffer);
        expect(result.corrupted).toBe(true);
        expect(result.restored).toBe(true);
    });

    test('buffer is restored to original values after corruption', () => {
        const originalSamples = [0.5, -0.3, 0.8, -0.1, 0.6];
        const buffer = makeBuffer(originalSamples);
        monitor.snapshotBuffer('sound1', buffer);

        // Corrupt it
        evilSoundChanger(buffer, 0.5);

        // Verify it's corrupted
        const channelData = buffer.getChannelData(0);
        expect(channelData[0]).toBeCloseTo(0.25, 5); // 0.5 * 0.5

        // Check triggers restoration
        monitor.checkBuffer('sound1', buffer);

        // Verify restoration
        expect(channelData[0]).toBeCloseTo(0.5, 5);
        expect(channelData[2]).toBeCloseTo(0.8, 5);
        expect(channelData[4]).toBeCloseTo(0.6, 5);
    });

    test('legitimate edit — markLegitimateEdit prevents false positives', () => {
        const buffer = makeBuffer([0.5, -0.3, 0.8, -0.1, 0.6]);
        monitor.snapshotBuffer('sound1', buffer);

        // User clicks "Softer" — mark as legitimate
        monitor.markLegitimateEdit('sound1');

        // Volume reduction happens (this time it's intentional)
        evilSoundChanger(buffer, 0.75);

        // Check should NOT flag this as corruption
        const result = monitor.checkBuffer('sound1', buffer);
        expect(result.corrupted).toBe(false);
        expect(result.restored).toBe(false);
    });

    test('commitLegitimateEdit updates snapshot to new state', () => {
        const buffer = makeBuffer([0.5, -0.3, 0.8]);
        monitor.snapshotBuffer('sound1', buffer);

        // Legitimate edit: user applies "Softer"
        monitor.markLegitimateEdit('sound1');
        evilSoundChanger(buffer, 0.75);
        monitor.commitLegitimateEdit('sound1', buffer);

        // Now the buffer at 0.75x is the new known-good state
        // A further unauthorized reduction should be caught
        evilSoundChanger(buffer, 0.5);

        const result = monitor.checkBuffer('sound1', buffer);
        expect(result.corrupted).toBe(true);
        expect(result.restored).toBe(true);
    });

    test('multiple sounds tracked independently', () => {
        const buffer1 = makeBuffer([0.5, 0.5, 0.5]);
        const buffer2 = makeBuffer([0.8, 0.8, 0.8]);
        monitor.snapshotBuffer('sound1', buffer1);
        monitor.snapshotBuffer('sound2', buffer2);

        // Corrupt only sound1
        evilSoundChanger(buffer1, 0.5);

        const result1 = monitor.checkBuffer('sound1', buffer1);
        const result2 = monitor.checkBuffer('sound2', buffer2);

        expect(result1.corrupted).toBe(true);
        expect(result2.corrupted).toBe(false);

        expect(monitor.snapshotCount).toBe(2);
    });

    test('near-silence buffers skip RMS check to avoid false positives', () => {
        // Very quiet sound — near silence
        const buffer = makeBuffer([0.0001, -0.0001, 0.0001]);
        monitor.snapshotBuffer('quiet', buffer);

        // Even a large relative change should not trigger
        evilSoundChanger(buffer, 0.1);

        const result = monitor.checkBuffer('quiet', buffer);
        expect(result.corrupted).toBe(false);
    });

    test('no snapshot — checkBuffer is a no-op', () => {
        const buffer = makeBuffer([0.5, 0.5]);
        const result = monitor.checkBuffer('unknown', buffer);
        expect(result.corrupted).toBe(false);
        expect(result.restored).toBe(false);
    });

    test('removeSnapshot cleans up', () => {
        const buffer = makeBuffer([0.5, 0.5]);
        monitor.snapshotBuffer('sound1', buffer);
        expect(monitor.hasSnapshot('sound1')).toBe(true);

        monitor.removeSnapshot('sound1');
        expect(monitor.hasSnapshot('sound1')).toBe(false);
        expect(monitor.snapshotCount).toBe(0);
    });

    test('null/undefined args handled gracefully', () => {
        expect(() => monitor.snapshotBuffer(null, null)).not.toThrow();
        expect(() => monitor.checkBuffer(null, null)).not.toThrow();
        expect(() => monitor.markLegitimateEdit(null)).not.toThrow();
        expect(() => monitor.commitLegitimateEdit(null, null)).not.toThrow();
        expect(() => monitor.removeSnapshot(null)).not.toThrow();
    });

    test('dispose clears all state', () => {
        const buffer = makeBuffer([0.5, 0.5]);
        monitor.snapshotBuffer('sound1', buffer);
        monitor.markLegitimateEdit('sound1');
        monitor.dispose();
        expect(monitor.snapshotCount).toBe(0);
        expect(monitor.hasSnapshot('sound1')).toBe(false);
    });
});

describe('GlowSoundMonitor — Gain Chain Monitor', () => {
    let monitor;

    beforeEach(() => {
        monitor = new GlowSoundMonitor();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.useFakeTimers();
    });

    afterEach(() => {
        monitor.dispose();
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    /**
     * Create a mock audio engine with a controllable gain node.
     */
    const makeMockEngine = (initialGain = 1.0) => ({
        inputNode: {
            gain: {value: initialGain}
        }
    });

    test('detects unexpected gain reduction', () => {
        const engine = makeMockEngine(1.0);
        monitor.startGainMonitor(engine);

        // Something unexpectedly lowers the gain
        engine.inputNode.gain.value = 0.5;

        // Advance timer to trigger check
        jest.advanceTimersByTime(2000);

        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Master gain drifted')
        );
        // Gain should be restored
        expect(engine.inputNode.gain.value).toBeCloseTo(1.0, 2);
    });

    test('does not flag gain within tolerance', () => {
        const engine = makeMockEngine(1.0);
        monitor.startGainMonitor(engine);

        // Tiny fluctuation within tolerance (0.01)
        engine.inputNode.gain.value = 0.995;

        jest.advanceTimersByTime(2000);

        expect(console.warn).not.toHaveBeenCalled();
    });

    test('respects setExpectedGain for project volume changes', () => {
        const engine = makeMockEngine(1.0);
        monitor.startGainMonitor(engine);

        // User explicitly sets project volume to 50%
        engine.inputNode.gain.value = 0.5;
        monitor.setExpectedGain(0.5);

        jest.advanceTimersByTime(2000);

        // Should NOT flag — the user set this intentionally
        expect(console.warn).not.toHaveBeenCalled();
        expect(engine.inputNode.gain.value).toBeCloseTo(0.5, 2);
    });

    test('stopGainMonitor stops checks', () => {
        const engine = makeMockEngine(1.0);
        monitor.startGainMonitor(engine);
        monitor.stopGainMonitor();

        engine.inputNode.gain.value = 0.5;
        jest.advanceTimersByTime(10000);

        // No warnings because monitor was stopped
        expect(console.warn).not.toHaveBeenCalled();
    });

    test('null engine handled gracefully', () => {
        expect(() => monitor.startGainMonitor(null)).not.toThrow();
        expect(() => monitor.startGainMonitor({})).not.toThrow();
    });
});
