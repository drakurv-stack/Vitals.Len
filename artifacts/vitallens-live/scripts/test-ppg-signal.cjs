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
const { estimatePpgHeartRate } = signalModule.exports;

function makeSamples({
  durationSeconds,
  bpmAt = () => 72,
  pulseAmplitude = 2.5,
  noiseAmplitude = 0.25,
  slowDriftAmplitude = 0.3,
  seed = 17,
  includePulse = true,
}) {
  const samples = [];
  const baselineWindow = [];
  let filteredSignal = null;
  let phase = 0;
  let previousTime = 0;
  let randomState = seed;

  for (let frame = 0; frame <= Math.ceil(durationSeconds * 15); frame += 1) {
    const elapsedSeconds = frame / 15 + (frame % 4) * 0.001;
    if (frame > 0) {
      const bpm = (bpmAt(previousTime) + bpmAt(elapsedSeconds)) / 2;
      phase += (2 * Math.PI * bpm * (elapsedSeconds - previousTime)) / 60;
    }
    previousTime = elapsedSeconds;

    randomState = (randomState * 48271) % 2147483647;
    const noise = (randomState / 2147483647 - 0.5) * noiseAmplitude;
    const pulse = includePulse
      ? pulseAmplitude *
        (Math.sin(phase) +
          0.35 * Math.sin(2 * phase + 0.7) +
          0.15 * Math.sin(3 * phase + 1.2))
      : 0;
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
        : 0.2 * centered + 0.8 * filteredSignal;
    samples.push({ elapsedSeconds, greenMean, filteredSignal });
  }

  return samples;
}

for (const expectedBpm of [
  40, 48, 55, 60, 72, 90, 100, 110, 120, 135, 150, 165, 175, 180,
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
    Math.abs(estimate.bpm - expectedBpm) <= 5,
    `Expected ${expectedBpm} BPM, got ${estimate.bpm}`,
  );
  console.log(`${expectedBpm} BPM synthetic signal -> ${estimate.bpm} BPM`);
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
assert.ok(beforeChange.bpm !== null && Math.abs(beforeChange.bpm - 60) <= 5);
assert.ok(afterChange.bpm !== null && Math.abs(afterChange.bpm - 100) <= 5);
console.log(`Rate change 60 -> 100 BPM -> ${afterChange.bpm} BPM`);

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

const noiseOnlySignal = estimatePpgHeartRate(
  makeSamples({
    durationSeconds: 16,
    includePulse: false,
    noiseAmplitude: 0.25,
    slowDriftAmplitude: 0,
  }),
);
assert.equal(noiseOnlySignal.bpm, null, 'Noise alone must not produce a pulse rate');
console.log('Noise-only signal -> no pulse estimate');