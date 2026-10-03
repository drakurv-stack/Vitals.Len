import { useState } from 'react';
import { HeartPulse, Info, Moon, RotateCcw } from 'lucide-react';
import type { LiveInferenceUpdate } from '@workspace/api-client-react';

type StressReading = {
  heartRate: number;
  hrvSdnn: number;
  hrvRmssd: number;
  resultSequence: number;
  sessionId: string;
};

type StressCheckProps = {
  current: LiveInferenceUpdate | null;
  sessionActive: boolean;
  noFace: boolean;
  sessionId: string | null;
};

function confidencePercent(confidence: number): number {
  return confidence <= 1 ? confidence * 100 : confidence;
}

function reliableReading(current: LiveInferenceUpdate | null): Omit<StressReading, 'sessionId'> | null {
  const heartRate = current?.heartRate;
  const sdnn = current?.hrvSdnn;
  const rmssd = current?.hrvRmssd;
  if (!current?.faceDetected || !heartRate || !sdnn || !rmssd) return null;

  const signals = [heartRate, sdnn, rmssd];
  if (signals.some((signal) =>
    !Number.isFinite(signal.value) ||
    signal.value <= 0 ||
    !Number.isFinite(signal.confidence) ||
    confidencePercent(signal.confidence) < 60
  )) return null;

  return {
    heartRate: heartRate.value,
    hrvSdnn: sdnn.value,
    hrvRmssd: rmssd.value,
    resultSequence: current.resultSequence,
  };
}

export function StressCheck({ current, sessionActive, noFace, sessionId }: StressCheckProps) {
  const [sleepHours, setSleepHours] = useState('');
  const [baseline, setBaseline] = useState<StressReading | null>(null);
  const reading = reliableReading(current);
  const parsedSleepHours = sleepHours.trim() ? Number(sleepHours) : null;
  const validSleepHours = parsedSleepHours !== null &&
    Number.isFinite(parsedSleepHours) &&
    parsedSleepHours >= 0 &&
    parsedSleepHours <= 24;
  const sleepLabel = validSleepHours
    ? parsedSleepHours! < 6
      ? `LOW SLEEP · ${parsedSleepHours!.toFixed(1)} H`
      : parsedSleepHours! < 7
        ? `UNDER 7 H · ${parsedSleepHours!.toFixed(1)} H`
        : `${parsedSleepHours!.toFixed(1)} H LOGGED`
    : 'NOT ENTERED';
  const canSetBaseline = sessionActive && !noFace && Boolean(reading && sessionId);

  const sameSession = Boolean(baseline && sessionId && baseline.sessionId === sessionId);
  const hasFreshComparison = Boolean(
    baseline &&
    reading &&
    reading.resultSequence > 0 &&
    (!sameSession || reading.resultSequence > baseline.resultSequence),
  );

  let assessment: { level: 'very-high' | 'high' | 'change' | 'steady'; title: string; detail: string; changes: string } | null = null;
  if (baseline && reading && hasFreshComparison) {
    const rmssdDrop = Math.max(0, (baseline.hrvRmssd - reading.hrvRmssd) / baseline.hrvRmssd);
    const sdnnDrop = Math.max(0, (baseline.hrvSdnn - reading.hrvSdnn) / baseline.hrvSdnn);
    const pulseRise = reading.heartRate - baseline.heartRate;
    const veryHigh = rmssdDrop >= 0.4 && sdnnDrop >= 0.35 && pulseRise >= 15;
    const high = rmssdDrop >= 0.25 && sdnnDrop >= 0.2 && pulseRise >= 10;
    const changed = rmssdDrop >= 0.15 || sdnnDrop >= 0.15 || pulseRise >= 8;

    assessment = veryHigh
      ? {
          level: 'very-high',
          title: 'Very high stress indicators',
          detail: 'Both HRV readings are well below your calm baseline and your pulse is higher.',
          changes: `RMSSD ↓${Math.round(rmssdDrop * 100)}% · SDNN ↓${Math.round(sdnnDrop * 100)}% · pulse ${pulseRise >= 0 ? '+' : ''}${Math.round(pulseRise)} bpm`,
        }
      : high
        ? {
            level: 'high',
            title: 'High stress indicators',
            detail: 'Both HRV readings fell and your pulse rose compared with your calm baseline.',
            changes: `RMSSD ↓${Math.round(rmssdDrop * 100)}% · SDNN ↓${Math.round(sdnnDrop * 100)}% · pulse ${pulseRise >= 0 ? '+' : ''}${Math.round(pulseRise)} bpm`,
          }
        : changed
          ? {
              level: 'change',
              title: 'Some changes from baseline',
              detail: 'One or more signals shifted. This alone is not enough to label stress.',
              changes: `RMSSD ↓${Math.round(rmssdDrop * 100)}% · SDNN ↓${Math.round(sdnnDrop * 100)}% · pulse ${pulseRise >= 0 ? '+' : ''}${Math.round(pulseRise)} bpm`,
            }
          : {
              level: 'steady',
              title: 'No strong elevated pattern',
              detail: 'These readings are close to your calm baseline. This does not rule out stress.',
              changes: `RMSSD ↓${Math.round(rmssdDrop * 100)}% · SDNN ↓${Math.round(sdnnDrop * 100)}% · pulse ${pulseRise >= 0 ? '+' : ''}${Math.round(pulseRise)} bpm`,
            };
  }

  const waitingMessage = noFace
    ? 'Face not detected. The stress comparison is paused and live readings are hidden.'
    : !sessionActive
      ? baseline
        ? 'Start a live test to compare new readings with your calm baseline.'
        : 'Start a live test, sit calmly, and save a clear reading as your baseline.'
      : !current
        ? 'Waiting for a clean HRV signal. HRV needs at least 20 seconds and may depend on your VitalLens plan.'
        : !reading
          ? 'Signal confidence is too low for a comparison. Keep your face centered and hold still in steady light.'
          : !baseline
            ? 'Sit calmly and still, then save this reading as your personal baseline.'
            : 'Waiting for a new HRV estimate after your baseline; the previous value is not reused.';

  return (
    <section className="stress-check" aria-labelledby="stress-check-title" data-testid="stress-check">
      <div className="stress-check-header">
        <div className="stress-check-title-wrap">
          <span className="stress-check-icon"><HeartPulse size={15} /></span>
          <div>
            <h2 id="stress-check-title">Stress &amp; sleep check</h2>
            <span className="stress-check-subtitle">PERSONAL BASELINE · WELLNESS ONLY</span>
          </div>
        </div>
        <span className="stress-check-badge">EXPERIMENTAL</span>
      </div>

      <div className="sleep-entry">
        <label htmlFor="sleep-hours">
          <Moon size={14} />
          <span>Hours slept last night</span>
        </label>
        <div className="sleep-input-wrap">
          <input
            id="sleep-hours"
            data-testid="input-sleep-hours"
            type="number"
            inputMode="decimal"
            min="0"
            max="24"
            step="0.25"
            value={sleepHours}
            onChange={(event) => setSleepHours(event.currentTarget.value)}
            aria-invalid={sleepHours !== '' && !validSleepHours}
            aria-describedby="sleep-entry-note"
            placeholder="e.g. 7.5"
          />
          <span>hours</span>
        </div>
      </div>
      {validSleepHours && (
        <div className={`sleep-status ${parsedSleepHours! < 6 ? 'sleep-status-low' : parsedSleepHours! < 7 ? 'sleep-status-short' : ''}`} data-testid="sleep-status">
          <Moon size={12} /> {sleepLabel}
        </div>
      )}
      <p id="sleep-entry-note" className="sleep-entry-note">
        {sleepHours !== '' && !validSleepHours
          ? 'Enter a number from 0 to 24.'
          : validSleepHours && parsedSleepHours! < 6
            ? 'Sleep is recovery context only; low sleep by itself does not mean stress.'
            : 'Sleep hours stay in this tab and are not sent to the VitalLens API.'}
      </p>

      {assessment ? (
        <div className={`stress-result stress-result-${assessment.level}`} role="status" data-testid="stress-assessment">
          <strong>{assessment.title}</strong>
          <p>{assessment.detail}</p>
          <span>{assessment.changes}</span>
          {validSleepHours && parsedSleepHours! < 6 && (
            <span className="stress-low-sleep">LOW SLEEP · {parsedSleepHours!.toFixed(1)} H</span>
          )}
        </div>
      ) : (
        <div className={`stress-waiting ${noFace ? 'stress-waiting-face' : ''}`} role="status" data-testid="stress-waiting">
          <span>{noFace ? 'FACE NOT DETECTED' : baseline ? 'WAITING FOR NEW READING' : 'BASELINE NEEDED'}</span>
          <p>{waitingMessage}</p>
        </div>
      )}

      <div className="baseline-actions">
        {!baseline ? (
          <button
            className="baseline-button"
            type="button"
            disabled={!canSetBaseline}
            onClick={() => {
              if (!reading || !sessionId) return;
              setBaseline({ ...reading, sessionId });
            }}
            data-testid="button-set-baseline"
          >
            <HeartPulse size={14} /> Save calm baseline
          </button>
        ) : (
          <>
            <span className="baseline-saved"><span /> BASELINE SAVED IN THIS TAB</span>
            <button className="baseline-reset" type="button" onClick={() => setBaseline(null)} data-testid="button-reset-baseline">
              <RotateCcw size={12} /> Reset
            </button>
          </>
        )}
      </div>

      <p className="stress-disclaimer">
        <Info size={12} />
        <span>Use calm, seated readings with the same device. “High” and “very high” use fixed changes from your baseline; exercise, movement, caffeine, illness, and other factors can change these signals. This is not a medical stress measurement.</span>
      </p>
      <details className="stress-method-details">
        <summary>How this check compares readings</summary>
        <p>High indicators require RMSSD down 25%, SDNN down 20%, and pulse up 10 bpm. Very high indicators require RMSSD down 40%, SDNN down 35%, and pulse up 15 bpm. Sleep is shown separately and does not determine the stress label.</p>
      </details>
    </section>
  );
}