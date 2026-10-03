const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/lib/fingertip-ppg-signal.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const signalModule = { exports: {} };
new Function('module', 'exports', compiled)(signalModule, signalModule.exports);
const { estimatePpgHeartRate, estimatePpgVariability } = signalModule.exports;

const reportSourcePath = path.resolve(__dirname, '../src/lib/measurement-report-data.ts');
const reportSource = fs.readFileSync(reportSourcePath, 'utf8');
const compiledReport = ts.transpileModule(reportSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const reportModule = { exports: {} };
new Function('module', 'exports', compiledReport)(reportModule, reportModule.exports);
const { createMeasurementReport } = reportModule.exports;

function makeSamples({
  durationSeconds,
  bpmAt = () => 72,
  pulseAmplitude = 2.5,
  noiseAmplitude = 0.25,
  slowDriftAmplitude = 0.3,
  dicroticAmplitude = 0.28,
  seed = 17,
  sampleRate = 30,
  includePulse = true,
}) {
  const samples = [];
  const baselineWindow = [];
  let filteredSignal = null;
  let phase = 0;
  let previousTime = 0;
  let randomState = seed;

  for (let frame = 0; frame <= Math.ceil(durationSeconds * sampleRate); frame += 1) {
    const elapsedSeconds =
      frame / sampleRate + Math.sin(frame * 0.71) * 0.0008;
    if (frame > 0) {
      const bpm = (bpmAt(previousTime) + bpmAt(elapsedSeconds)) / 2;
      phase += (2 * Math.PI * bpm * (elapsedSeconds - previousTime)) / 60;
    }
    previousTime = elapsedSeconds;
    const cycle = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
    const pulseDistance = Math.min(cycle, 1 - cycle);
    const dicroticDistance = Math.min(
      Math.abs(cycle - 0.23),
      1 - Math.abs(cycle - 0.23),
    );
    const pulse = includePulse
      ? pulseAmplitude * Math.exp(-0.5 * (pulseDistance / 0.055) ** 2) +
        pulseAmplitude * dicroticAmplitude * Math.exp(-0.5 * (dicroticDistance / 0.05) ** 2)
      : 0;

    randomState = (randomState * 48271) % 2147483647;
    const noise = (randomState / 2147483647 - 0.5) * noiseAmplitude;
    const greenMean =
      125 +
      pulse +
      slowDriftAmplitude * Math.sin((2 * Math.PI * elapsedSeconds) / 8) +
      noise;

    baselineWindow.push({ elapsedSeconds, value: greenMean });
    while (
      baselineWindow.length > 0 &&
      elapsedSeconds - baselineWindow[0].elapsedSeconds > 2.4
    ) {
      baselineWindow.shift();
    }
    const baseline =
      baselineWindow.reduce((sum, sample) => sum + sample.value, 0) /
      baselineWindow.length;
    const centered = greenMean - baseline;
    filteredSignal =
      filteredSignal === null
        ? centered
        : 0.72 * centered + 0.28 * filteredSignal;
    samples.push({ elapsedSeconds, greenMean, filteredSignal });
  }

  return samples;
}

for (const expectedBpm of [
  40, 48, 55, 60, 70, 72, 80, 90, 100, 110, 120, 135, 150, 165, 175, 180,
]) {
  const estimate = estimatePpgHeartRate(
    makeSamples({
      durationSeconds: 16,
      bpmAt: () => expectedBpm,
      seed: expectedBpm,
    }),
  );
  assert.notEqual(estimate.bpm, null, `Expected a reading near ${expectedBpm} BPM`);
  assert.ok(
    Math.abs(estimate.bpm - expectedBpm) <= 3,
    `Expected ${expectedBpm} BPM, got ${estimate.bpm}`,
  );
  console.log(`${expectedBpm} BPM PPG waveform -> ${estimate.bpm} BPM`);
}

const changingSamples = makeSamples({
  durationSeconds: 26,
  bpmAt: (time) => (time < 13 ? 60 : 100),
  seed: 100,
});
const beforeChange = estimatePpgHeartRate(
  changingSamples.filter((sample) => sample.elapsedSeconds <= 11),
);
const afterChange = estimatePpgHeartRate(changingSamples);
assert.ok(beforeChange.bpm !== null && Math.abs(beforeChange.bpm - 60) <= 3);
assert.ok(afterChange.bpm !== null && Math.abs(afterChange.bpm - 100) <= 3);
console.log(`Rate change 60 -> 100 BPM -> ${afterChange.bpm} BPM`);

const variableRateSamples = makeSamples({
  durationSeconds: 75,
  bpmAt: (time) => 72 + 4 * Math.sin((2 * Math.PI * time) / 8),
  seed: 229,
});
const variability = estimatePpgVariability(variableRateSamples);
assert.ok(variability.sdnnMs !== null && variability.sdnnMs > 5);
assert.ok(variability.rmssdMs !== null && variability.rmssdMs > 5);
assert.ok(variability.pnn50Percent !== null);
assert.ok(variability.meanPpiMs !== null);
assert.ok(variability.validBeatCount >= 30);
console.log(
  `60-second PPG variability -> SDNN ${variability.sdnnMs.toFixed(1)} ms, RMSSD ${variability.rmssdMs.toFixed(1)} ms, pNN50 ${variability.pnn50Percent.toFixed(1)}%`,
);

const shortVariability = estimatePpgVariability(
  makeSamples({ durationSeconds: 35, bpmAt: () => 72, seed: 72 }),
);
assert.equal(shortVariability.sdnnMs, null, 'HRV must wait for a full 60-second window');
assert.equal(shortVariability.rmssdMs, null);
console.log('35-second PPG signal -> HRV withheld');

const lowFrameRateVariability = estimatePpgVariability(
  makeSamples({ durationSeconds: 70, bpmAt: () => 72, sampleRate: 15 }),
);
assert.equal(lowFrameRateVariability.sdnnMs, null, 'HRV must be withheld below 20 samples/second');
console.log('15 FPS signal -> HRV withheld');

const flatSignal = estimatePpgHeartRate(
  makeSamples({
    durationSeconds: 16,
    includePulse: false,
    noiseAmplitude: 0,
    slowDriftAmplitude: 0,
  }),
);
assert.equal(flatSignal.bpm, null, 'A flat signal must not produce a pulse rate');
console.log('Flat signal -> no pulse estimate');

const noiseOnlySamples = makeSamples({
  durationSeconds: 70,
  includePulse: false,
  noiseAmplitude: 1.2,
  slowDriftAmplitude: 0,
});
const noiseOnlySignal = estimatePpgHeartRate(noiseOnlySamples);
assert.equal(noiseOnlySignal.bpm, null, 'Noise alone must not produce a pulse rate');
console.log('Noise-only signal -> no pulse estimate');

const noiseOnlyVariability = estimatePpgVariability(noiseOnlySamples);
assert.equal(noiseOnlyVariability.sdnnMs, null, 'Noise alone must not produce variability metrics');
console.log('Noise-only signal -> no pulse-variability estimate');

const zeroVariabilityReport = createMeasurementReport({
  source: 'fingertip',
  durationSeconds: 70,
  sampleCount: 2100,
  readings: [{
    elapsedSeconds: 70,
    signalQualityPercent: 90,
    heartRate: { value: 72, confidence: null, unit: 'bpm' },
    respiratoryRate: null,
    hrvSdnn: { value: 0, confidence: null, unit: 'ms' },
    hrvRmssd: { value: 0, confidence: null, unit: 'ms' },
    hrvPnn50: { value: 0, confidence: null, unit: '%' },
    meanPulseInterval: { value: 833.3, confidence: null, unit: 'ms' },
  }],
});
const reportMetrics = Object.fromEntries(
  zeroVariabilityReport.metrics.map((metric) => [metric.key, metric]),
);
assert.equal(reportMetrics.hrvSdnn.value, 0, 'Measured zero SDNN must remain in the report');
assert.equal(reportMetrics.hrvRmssd.value, 0, 'Measured zero RMSSD must remain in the report');
assert.equal(reportMetrics.hrvPnn50.value, 0, 'Measured zero pNN50 must remain in the report');
assert.equal(reportMetrics.meanPulseInterval.value, 833.3);
console.log('Session report -> keeps measured zero variability values and pulse intervals');