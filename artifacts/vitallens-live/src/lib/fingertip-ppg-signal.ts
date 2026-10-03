import type { PpgSample } from './fingertip-ppg-types';

export interface PpgEstimate {
  bpm: number | null;
  quality: number | null;
}

export interface PpgVariabilityEstimate {
  sdnnMs: number | null;
  rmssdMs: number | null;
  pnn50Percent: number | null;
  meanPpiMs: number | null;
  validBeatCount: number;
  windowSeconds: number;
}

interface PpgPeak {
  elapsedSeconds: number;
  value: number;
  prominence: number;
}

const HEART_RATE_WINDOW_SECONDS = 12;
const HRV_WINDOW_SECONDS = 60;
const MIN_SIGNAL_SECONDS = 5.5;
const MIN_HRV_SECONDS = 60;
const MIN_BPM = 40;
const MAX_BPM = 180;
const MIN_PEAK_GAP_SECONDS = 0.28;
const MIN_VALID_HRV_INTERVALS = 30;
const MIN_SIGNAL_VARIANCE = 0.0025;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (sorted.length % 2 === 0 && lower !== undefined && upper !== undefined) {
    return (lower + upper) / 2;
  }
  return upper ?? null;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getWindow(
  samples: readonly PpgSample[],
  windowSeconds: number,
): { samples: PpgSample[]; durationSeconds: number } {
  const validSamples = samples.filter((sample) =>
    Number.isFinite(sample.elapsedSeconds) &&
    Number.isFinite(sample.filteredSignal),
  );
  const first = validSamples[0];
  const last = validSamples[validSamples.length - 1];
  if (!first || !last) return { samples: [], durationSeconds: 0 };

  const start = Math.max(first.elapsedSeconds, last.elapsedSeconds - windowSeconds);
  return {
    samples: validSamples.filter((sample) => sample.elapsedSeconds >= start),
    durationSeconds: last.elapsedSeconds - start,
  };
}

function detectPeaks(samples: readonly PpgSample[]): {
  peaks: PpgPeak[];
  standardDeviation: number;
} {
  if (samples.length < 3) return { peaks: [], standardDeviation: 0 };

  const values = samples.map((sample) => sample.filteredSignal);
  const average = mean(values) ?? 0;
  const variance = mean(values.map((value) => (value - average) ** 2)) ?? 0;
  const standardDeviation = Math.sqrt(variance);
  if (!Number.isFinite(standardDeviation) || variance < MIN_SIGNAL_VARIANCE) {
    return { peaks: [], standardDeviation: 0 };
  }

  const duration = (samples[samples.length - 1]?.elapsedSeconds ?? 0) -
    (samples[0]?.elapsedSeconds ?? 0);
  const sampleRate = duration > 0 ? (samples.length - 1) / duration : 0;
  if (!Number.isFinite(sampleRate) || sampleRate < 4) {
    return { peaks: [], standardDeviation };
  }

  const prominenceRadius = Math.max(1, Math.round(sampleRate * 0.12));
  const minimumProminence = Math.max(0.002, standardDeviation * 0.2);
  const peakThreshold = average + standardDeviation * 0.45;
  const peaks: PpgPeak[] = [];

  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous = values[index - 1];
    const value = values[index];
    const next = values[index + 1];
    const sample = samples[index];
    if (
      previous === undefined ||
      value === undefined ||
      next === undefined ||
      !sample ||
      value < peakThreshold ||
      value < previous ||
      value <= next
    ) {
      continue;
    }

    const leftStart = Math.max(0, index - prominenceRadius);
    const rightEnd = Math.min(values.length - 1, index + prominenceRadius);
    let leftMinimum = value;
    let rightMinimum = value;
    for (let neighbor = leftStart; neighbor < index; neighbor += 1) {
      leftMinimum = Math.min(leftMinimum, values[neighbor] ?? value);
    }
    for (let neighbor = index + 1; neighbor <= rightEnd; neighbor += 1) {
      rightMinimum = Math.min(rightMinimum, values[neighbor] ?? value);
    }
    const prominence = value - Math.max(leftMinimum, rightMinimum);
    if (prominence < minimumProminence) continue;

    const curvature = previous - 2 * value + next;
    const offset = Math.abs(curvature) > 1e-9
      ? Math.max(-0.5, Math.min(0.5, 0.5 * (previous - next) / curvature))
      : 0;
    const left = samples[index - 1];
    const right = samples[index + 1];
    const sampleSpacing = left && right
      ? (right.elapsedSeconds - left.elapsedSeconds) / 2
      : 0;
    const peak: PpgPeak = {
      elapsedSeconds: sample.elapsedSeconds + offset * sampleSpacing,
      value,
      prominence,
    };

    const previousPeak = peaks[peaks.length - 1];
    if (
      previousPeak &&
      peak.elapsedSeconds - previousPeak.elapsedSeconds < MIN_PEAK_GAP_SECONDS
    ) {
      if (peak.value > previousPeak.value) peaks[peaks.length - 1] = peak;
      continue;
    }
    peaks.push(peak);
  }

  return { peaks, standardDeviation };
}

function getPulseIntervals(
  peaks: readonly PpgPeak[],
): Array<{ intervalSeconds: number; peakIndex: number }> {
  const intervals: Array<{ intervalSeconds: number; peakIndex: number }> = [];
  for (let index = 1; index < peaks.length; index += 1) {
    const previous = peaks[index - 1];
    const current = peaks[index];
    if (!previous || !current) continue;
    const intervalSeconds = current.elapsedSeconds - previous.elapsedSeconds;
    if (intervalSeconds >= 60 / MAX_BPM && intervalSeconds <= 60 / MIN_BPM) {
      intervals.push({ intervalSeconds, peakIndex: index });
    }
  }
  return intervals;
}

function getConsistentIntervals(
  intervals: readonly { intervalSeconds: number; peakIndex: number }[],
  tolerance: number,
): Array<{ intervalSeconds: number; peakIndex: number }> {
  const center = median(intervals.map((interval) => interval.intervalSeconds));
  if (center === null) return [];
  return intervals.filter((interval) =>
    Math.abs(interval.intervalSeconds - center) <= center * tolerance,
  );
}

function getPeriodicityScore(
  samples: readonly PpgSample[],
  periodSeconds: number,
): number {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const duration = (last?.elapsedSeconds ?? 0) - (first?.elapsedSeconds ?? 0);
  const sampleRate = duration > 0 ? (samples.length - 1) / duration : 0;
  const expectedLag = Math.round(periodSeconds * sampleRate);
  if (expectedLag < 2 || expectedLag >= samples.length) return 0;

  const values = samples.map((sample) => sample.filteredSignal);
  const average = mean(values) ?? 0;
  const maximumOffset = Math.max(1, Math.round(sampleRate * 0.04));
  let bestCorrelation = 0;

  for (
    let lag = Math.max(1, expectedLag - maximumOffset);
    lag <= Math.min(samples.length - 1, expectedLag + maximumOffset);
    lag += 1
  ) {
    let product = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = lag; index < values.length; index += 1) {
      const current = (values[index] ?? 0) - average;
      const previous = (values[index - lag] ?? 0) - average;
      product += current * previous;
      leftEnergy += current * current;
      rightEnergy += previous * previous;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    if (denominator > 0) {
      bestCorrelation = Math.max(bestCorrelation, product / denominator);
    }
  }
  return Math.max(0, Math.min(1, bestCorrelation));
}

/**
 * Estimates pulse rate from detected optical pulse peaks and their timestamps.
 * Camera timestamps are used directly; a plausible number is withheld when the
 * signal is flat, irregular, or too short rather than forcing a maximum rate.
 */
export function estimatePpgHeartRate(samples: readonly PpgSample[]): PpgEstimate {
  const window = getWindow(samples, HEART_RATE_WINDOW_SECONDS);
  if (
    window.durationSeconds < MIN_SIGNAL_SECONDS ||
    window.samples.length < 20
  ) {
    return { bpm: null, quality: null };
  }

  const { peaks, standardDeviation } = detectPeaks(window.samples);
  if (standardDeviation === 0) return { bpm: null, quality: 0 };

  const intervals = getPulseIntervals(peaks);
  const consistentIntervals = getConsistentIntervals(intervals, 0.3);
  if (consistentIntervals.length < 3) return { bpm: null, quality: 0 };

  const center = median(
    consistentIntervals.map((interval) => interval.intervalSeconds),
  );
  if (center === null || center <= 0) return { bpm: null, quality: 0 };

  const absoluteDeviations = consistentIntervals.map((interval) =>
    Math.abs(interval.intervalSeconds - center),
  );
  const variationRatio = (median(absoluteDeviations) ?? center) / center;
  const rhythmScore = Math.max(0, Math.min(1, 1 - variationRatio * 5));
  const averageProminence = mean(
    peaks.map((peak) => peak.prominence),
  ) ?? 0;
  const signalScore = Math.max(
    0,
    Math.min(1, averageProminence / (standardDeviation * 0.65)),
  );
  const periodicityScore = getPeriodicityScore(window.samples, center);
  const quality = Math.round(rhythmScore * signalScore * periodicityScore * 100);
  const bpm = 60 / center;

  if (
    quality < 30 ||
    bpm < MIN_BPM ||
    bpm > MAX_BPM ||
    !Number.isFinite(bpm)
  ) {
    return { bpm: null, quality };
  }

  return { bpm: Math.round(bpm), quality };
}

/**
 * Estimates time-domain variability from 60 seconds of clean pulse-to-pulse
 * intervals. These are PPG pulse intervals, not ECG R-R intervals.
 */
export function estimatePpgVariability(
  samples: readonly PpgSample[],
): PpgVariabilityEstimate {
  const window = getWindow(samples, HRV_WINDOW_SECONDS);
  const empty: PpgVariabilityEstimate = {
    sdnnMs: null,
    rmssdMs: null,
    pnn50Percent: null,
    meanPpiMs: null,
    validBeatCount: 0,
    windowSeconds: window.durationSeconds,
  };

  if (
    window.durationSeconds < MIN_HRV_SECONDS ||
    window.samples.length < 120
  ) {
    return empty;
  }
  const sampleRate =
    (window.samples.length - 1) / window.durationSeconds;
  if (!Number.isFinite(sampleRate) || sampleRate < 20) return empty;

  const recentEstimate = estimatePpgHeartRate(window.samples);
  if (recentEstimate.bpm === null || (recentEstimate.quality ?? 0) < 30) {
    return empty;
  }

  const { peaks, standardDeviation } = detectPeaks(window.samples);
  if (standardDeviation === 0) return empty;
  const intervals = getPulseIntervals(peaks);
  const cleanIntervals = getConsistentIntervals(intervals, 0.25);
  if (cleanIntervals.length < MIN_VALID_HRV_INTERVALS) return empty;

  const intervalMs = cleanIntervals.map((interval) => interval.intervalSeconds * 1000);
  const average = mean(intervalMs);
  if (average === null) return empty;

  const variance = intervalMs.reduce(
    (sum, interval) => sum + (interval - average) ** 2,
    0,
  ) / (intervalMs.length - 1);
  const consecutiveDifferences: number[] = [];
  for (let index = 1; index < cleanIntervals.length; index += 1) {
    const previous = cleanIntervals[index - 1];
    const current = cleanIntervals[index];
    if (
      previous &&
      current &&
      current.peakIndex === previous.peakIndex + 1
    ) {
      consecutiveDifferences.push(
        intervalMs[index]! - intervalMs[index - 1]!,
      );
    }
  }
  if (consecutiveDifferences.length < MIN_VALID_HRV_INTERVALS - 1) {
    return empty;
  }

  const rmssd = Math.sqrt(
    mean(consecutiveDifferences.map((difference) => difference ** 2)) ?? 0,
  );
  const pnn50 = (
    consecutiveDifferences.filter((difference) => Math.abs(difference) > 50).length /
    consecutiveDifferences.length
  ) * 100;

  return {
    sdnnMs: Number.isFinite(variance) ? Math.sqrt(variance) : null,
    rmssdMs: Number.isFinite(rmssd) ? rmssd : null,
    pnn50Percent: Number.isFinite(pnn50) ? pnn50 : null,
    meanPpiMs: average,
    validBeatCount: cleanIntervals.length,
    windowSeconds: window.durationSeconds,
  };
}