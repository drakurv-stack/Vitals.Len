import type { PpgSample } from './fingertip-ppg-types';

export interface PpgEstimate {
  bpm: number | null;
  quality: number | null;
}

const ANALYSIS_WINDOW_SECONDS = 10;
const RESAMPLE_RATE = 12;
const MIN_SIGNAL_SECONDS = 5.5;
const MIN_BPM = 40;
const MAX_BPM = 180;
const MIN_CORRELATION = 0.32;

/**
 * Estimates the dominant pulse period from a detrended fingertip PPG window.
 * The input is resampled to a uniform time grid before autocorrelation so
 * camera frame-rate jitter does not directly change the BPM estimate.
 */
export function estimatePpgHeartRate(samples: readonly PpgSample[]): PpgEstimate {
  if (samples.length < 20) return { bpm: null, quality: null };

  const last = samples[samples.length - 1];
  const firstAvailable = samples[0];
  if (!last || !firstAvailable) return { bpm: null, quality: null };

  const end = last.elapsedSeconds;
  const start = Math.max(firstAvailable.elapsedSeconds, end - ANALYSIS_WINDOW_SECONDS);
  const duration = end - start;
  if (duration < MIN_SIGNAL_SECONDS) return { bpm: null, quality: null };

  const windowSamples = samples.filter((sample) => sample.elapsedSeconds >= start);
  if (windowSamples.length < 20) return { bpm: null, quality: null };

  const count = Math.floor(duration * RESAMPLE_RATE) + 1;
  const uniform: number[] = [];
  let cursor = 0;

  for (let index = 0; index < count; index += 1) {
    const targetTime = start + index / RESAMPLE_RATE;
    while (
      cursor < windowSamples.length - 2 &&
      (windowSamples[cursor + 1]?.elapsedSeconds ?? end) < targetTime
    ) {
      cursor += 1;
    }

    const left = windowSamples[cursor];
    const right = windowSamples[Math.min(cursor + 1, windowSamples.length - 1)];
    if (!left || !right) continue;

    const span = right.elapsedSeconds - left.elapsedSeconds;
    const fraction = span > 0 ? (targetTime - left.elapsedSeconds) / span : 0;
    uniform.push(left.filteredSignal + (right.filteredSignal - left.filteredSignal) * fraction);
  }

  if (uniform.length < MIN_SIGNAL_SECONDS * RESAMPLE_RATE) {
    return { bpm: null, quality: null };
  }

  const mean = uniform.reduce((sum, value) => sum + value, 0) / uniform.length;
  const centered = uniform.map((value) => value - mean);
  const variance = centered.reduce((sum, value) => sum + value * value, 0) / centered.length;
  if (!Number.isFinite(variance) || variance < 0.0025) {
    return { bpm: null, quality: 0 };
  }

  const minLag = Math.max(2, Math.floor((RESAMPLE_RATE * 60) / MAX_BPM));
  const maxLag = Math.ceil((RESAMPLE_RATE * 60) / MIN_BPM);
  const correlations: number[] = [];
  let bestLag = -1;
  let bestCorrelation = -1;

  for (let lag = minLag; lag <= maxLag && lag < centered.length / 2; lag += 1) {
    let crossProduct = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;

    for (let index = 0; index < centered.length - lag; index += 1) {
      const left = centered[index] ?? 0;
      const right = centered[index + lag] ?? 0;
      crossProduct += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }

    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    const correlation = denominator > 0 ? crossProduct / denominator : 0;
    correlations[lag] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || !Number.isFinite(bestCorrelation)) {
    return { bpm: null, quality: null };
  }

  let refinedLag = bestLag;
  const before = correlations[bestLag - 1];
  const after = correlations[bestLag + 1];
  if (before !== undefined && after !== undefined) {
    const curvature = before - 2 * bestCorrelation + after;
    if (Math.abs(curvature) > 1e-8) {
      const offset = Math.max(-0.5, Math.min(0.5, 0.5 * (before - after) / curvature));
      refinedLag += offset;
    }
  }

  const quality = Math.round(Math.max(0, Math.min(100, ((bestCorrelation - 0.1) / 0.7) * 100)));
  const bpm = (RESAMPLE_RATE * 60) / refinedLag;

  if (bestCorrelation < MIN_CORRELATION || bpm < MIN_BPM || bpm > MAX_BPM) {
    return { bpm: null, quality };
  }

  return { bpm: Math.round(bpm), quality };
}