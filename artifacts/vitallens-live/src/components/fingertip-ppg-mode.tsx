import { useMemo } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  Download,
  Fingerprint,
  Flashlight,
  HeartPulse,
  Info,
  LockKeyhole,
  Pause,
  Play,
  Wind,
} from 'lucide-react';
import type { PpgModeProps } from '../lib/fingertip-ppg-types';
import { Link } from 'wouter';
import './fingertip-ppg-mode.css';

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

function SignalPlot({ samples, sampleCount, active, markers }: Pick<PpgModeProps, 'samples' | 'sampleCount' | 'markers'> & { active: boolean }) {
  const plot = useMemo(() => {
    const recent = samples.slice(-160);
    if (!recent.length) return { path: '', markerPositions: [] as number[] };
    const values = recent.map((sample) => sample.filteredSignal);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const range = high - low || 1;
    const path = values.map((value, index) => {
      const x = 12 + (index / Math.max(1, values.length - 1)) * 576;
      const y = 72 - ((value - low) / range) * 50;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    const from = recent[0].elapsedSeconds;
    const to = recent[recent.length - 1].elapsedSeconds;
    const markerPositions = markers
      .filter((marker) => marker.elapsedSeconds >= from && marker.elapsedSeconds <= to)
      .map((marker) => 12 + ((marker.elapsedSeconds - from) / Math.max(.01, to - from)) * 576);
    return { path, markerPositions };
  }, [samples, markers]);

  return (
    <div className={`ppg-wave ${active ? 'ppg-wave-active' : ''}`} role="img" aria-label={active && samples.length ? 'Live fingertip pulse waveform' : 'Waveform appears when a measurement begins'}>
      <div className="ppg-wave-top"><span><Activity size={14} /> OPTICAL PULSE · GREEN CHANNEL</span><span>{active ? 'LIVE' : 'SIGNAL TRACE'}</span></div>
      <svg viewBox="0 0 600 96" preserveAspectRatio="none" aria-hidden="true">
        <path className="ppg-grid" d="M0 24H600M0 48H600M0 72H600M100 0V96M200 0V96M300 0V96M400 0V96M500 0V96" />
        {plot.markerPositions.map((x, index) => <line key={`${x}-${index}`} className="ppg-marker-line" x1={x} x2={x} y1="9" y2="86" />)}
        {plot.path
          ? <path className="ppg-wave-line" d={plot.path} />
          : <path className="ppg-wave-empty" d="M0 49 C22 48 26 52 43 49 S69 45 86 49 S112 53 129 49 S155 46 172 49 S198 52 215 49 S241 46 258 49 S284 52 301 49 S327 46 344 49 S370 52 387 49 S413 46 430 49 S456 52 473 49 S499 46 516 49 S542 52 559 49 S585 46 600 49" />}
      </svg>
      <div className="ppg-wave-legend"><span><i /> FILTERED PPG</span><span>{sampleCount ? `${sampleCount} SAMPLES` : 'WAITING FOR SIGNAL'}</span></div>
    </div>
  );
}

function VariabilityCard({
  label,
  value,
  unit,
  precision = 1,
}: {
  label: string;
  value: number | null;
  unit: string;
  precision?: number;
}) {
  return (
    <article className="ppg-variability-card">
      <span>{label}</span>
      <strong data-testid={`metric-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}>
        {value === null ? '—' : value.toFixed(precision)}
        <small>{value === null ? '' : unit}</small>
      </strong>
    </article>
  );
}

export function FingertipPpgMode({
  videoRef,
  phase,
  cameraActive,
  bpm,
  signalQuality,
  variability,
  torchStatus,
  elapsedSeconds,
  errorMessage,
  samples,
  sampleCount,
  markers,
  onStart,
  onStop,
  onMarkBreathing,
  onExportCsv,
}: PpgModeProps) {
  const active = cameraActive || phase === 'starting' || phase === 'warming' || phase === 'live';
  const qualityPercent = signalQuality === null ? null : Math.round(Math.min(100, Math.max(0, signalQuality)));
  const qualityLabel = qualityPercent === null ? 'Waiting' : qualityPercent >= 75 ? 'Strong' : qualityPercent >= 45 ? 'Fair' : 'Low';
  const lowGreenSignal = useMemo(() => {
    const latestSample = samples[samples.length - 1];
    if (!active || bpm !== null || !latestSample || samples.length < 20) return false;

    const recentGreenValues = samples
      .filter((sample) => latestSample.elapsedSeconds - sample.elapsedSeconds <= 3)
      .map((sample) => sample.greenMean)
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (recentGreenValues.length < 20) return false;

    const middle = Math.floor(recentGreenValues.length / 2);
    const lower = recentGreenValues[middle - 1];
    const upper = recentGreenValues[middle];
    const medianGreenMean = recentGreenValues.length % 2 === 0 && lower !== undefined && upper !== undefined
      ? (lower + upper) / 2
      : upper;
    return medianGreenMean !== undefined && medianGreenMean < 0.1;
  }, [active, bpm, samples]);
  const variabilityReady = Boolean(
    variability &&
    variability.sdnnMs !== null &&
    variability.rmssdMs !== null &&
    variability.pnn50Percent !== null &&
    variability.meanPpiMs !== null,
  );
  const variabilityProgress = Math.min(60, variability?.windowSeconds ?? 0);
  const torchLabel = {
    idle: 'Start a session to check support',
    checking: 'Checking torch support',
    on: 'Torch on',
    unsupported: 'Torch not supported',
    unavailable: 'Torch unavailable',
  }[torchStatus];

  return (
    <main className="ppg-page">
      <header className="ppg-header">
        <Link className="ppg-brand" href="/" aria-label="VitalLens Live face-camera demo" data-testid="link-ppg-home">
          <span className="ppg-brand-mark"><Activity size={18} strokeWidth={1.8} /></span>
          <span>vital<span>lens</span><sup>LIVE</sup></span>
        </Link>
        <Link className="ppg-back" href="/" data-testid="link-face-camera-demo"><ArrowLeft size={15} /> Face-camera demo <ArrowUpRight size={13} /></Link>
      </header>

      <section className="ppg-intro">
        <div className="ppg-eyebrow"><span /> CAMERA MODE / 02</div>
        <div className="ppg-intro-row">
          <div>
            <p className="ppg-overline">A quieter way to explore your pulse</p>
            <h1>Pulse, in the<br className="ppg-title-break" /> palm of your hand<span>.</span></h1>
          </div>
          <p className="ppg-intro-copy">Cover the rear camera lens and flash with a relaxed fingertip. The browser follows green-channel light changes locally; flash support depends on your device.</p>
        </div>
        <div className="ppg-mode-switch" aria-label="Camera modes">
          <Link href="/" className="ppg-mode-link" data-testid="link-mode-face-camera">Face camera</Link>
          <span className="ppg-mode-current"><Fingerprint size={15} /> Fingertip PPG <i>ACTIVE MODE</i></span>
        </div>
      </section>

      <section className="ppg-console" aria-label="Fingertip pulse measurement">
        <div className="ppg-capture">
          <div className="ppg-section-head">
            <span><b>01</b> CAMERA / LOCAL PREVIEW</span>
            <span className={`ppg-phase-tag ppg-phase-${phase}`}><i />{phase === 'live' ? 'READING' : phase === 'warming' ? 'SETTLING' : phase === 'starting' ? 'STARTING' : phase === 'error' ? 'PAUSED' : 'READY'}</span>
          </div>
          <div className={`ppg-preview ${cameraActive ? 'is-active' : ''}`}>
            <video ref={videoRef} muted playsInline aria-label="Local fingertip camera preview" />
            {!cameraActive && <div className="ppg-preview-placeholder">
              <div className="ppg-lens-symbol"><span /><Fingerprint size={31} strokeWidth={1.25} /></div>
              <strong>{phase === 'error' ? 'Measurement paused' : 'Your camera stays here'}</strong>
              <p>{phase === 'error' ? 'Check the camera and try starting again.' : 'Place your fingertip gently over the rear camera lens when prompted.'}</p>
              <span className="ppg-local-chip"><LockKeyhole size={13} /> PREVIEW STAYS IN THIS BROWSER</span>
            </div>}
            {cameraActive && <div className="ppg-camera-corner"><span className="ppg-live-dot" /> LOCAL CAMERA</div>}
            <div className="ppg-preview-time"><span>SESSION TIME</span><strong>{formatTime(elapsedSeconds)}</strong></div>
          </div>
          <div className="ppg-controls">
            <div className="ppg-status-copy">
              <span className={`ppg-status-led ${active ? 'is-on' : ''}`} />
              <div><strong data-testid="status-ppg-phase">{phase === 'error' ? 'Needs attention' : phase === 'live' ? 'Signal is live' : phase === 'warming' ? 'Finding a steady signal' : active ? 'Preparing measurement' : 'Ready when you are'}</strong>
                <small>{cameraActive ? 'CAMERA ACTIVE · PROCESSING LOCALLY' : 'NO CAMERA ACCESS UNTIL YOU START'}</small></div>
            </div>
            {active ? (
              <button className="ppg-stop" type="button" onClick={onStop} data-testid="button-stop-measurement"><Pause size={15} fill="currentColor" /> Stop measurement</button>
            ) : (
              <button className="ppg-start" type="button" onClick={onStart} data-testid="button-start-measurement">
                <Play size={15} fill="currentColor" /> {phase === 'error' ? 'Try again' : 'Start measurement'}
              </button>
            )}
          </div>
          {errorMessage && <div className="ppg-error" role="alert"><CircleAlert size={16} /><span>{errorMessage}</span></div>}
          <div className="ppg-device-strip">
            <span><Flashlight size={14} /><b>TORCH</b> {torchLabel}</span>
            <span className="ppg-device-divider" />
            <span><LockKeyhole size={14} /><b>PRIVACY</b> Local signal only</span>
          </div>
          <p className="ppg-privacy-note"><LockKeyhole size={14} /> This mode processes camera-derived signal in your browser. No camera frames are sent to the VitalLens API.</p>
        </div>

        <aside className="ppg-readout">
          <div className="ppg-section-head"><span><b>02</b> LIVE READOUT</span><span className="ppg-readout-caption">FINGERTIP PPG</span></div>
          <div className="ppg-bpm-panel">
            <div className="ppg-bpm-label"><HeartPulse size={16} /> PULSE RATE <span>ESTIMATE</span></div>
            <div className="ppg-bpm-value" data-testid="metric-fingertip-bpm">{bpm !== null ? Math.round(bpm) : <span>—</span>}<small>BPM</small></div>
            <div className="ppg-bpm-foot"><span>{bpm !== null ? 'Current camera-derived estimate' : active ? 'Waiting for a clean pulse pattern' : 'Start a session to begin'}</span><span className="ppg-approx">APPROXIMATE</span></div>
          </div>

          <div className="ppg-quality">
            <div className="ppg-quality-head"><span>SIGNAL QUALITY</span><strong data-testid="metric-ppg-signal-quality">{qualityPercent === null ? '—' : `${qualityPercent}%`} <i>{qualityLabel}</i></strong></div>
            <div className="ppg-quality-track" role="meter" aria-label="Signal quality" aria-valuemin={0} aria-valuemax={100} aria-valuenow={qualityPercent ?? 0}><span style={{ width: `${qualityPercent ?? 0}%` }} /></div>
            <p>{lowGreenSignal ? 'Very little green light is reaching the camera. Reposition your fingertip over the camera lens and rear flash; use light pressure and keep it still.' : qualityPercent !== null && qualityPercent >= 75 ? 'Good contact. Keep your finger relaxed and still.' : 'Use light, steady pressure. Avoid pressing hard or shifting.'}</p>
          </div>

          <section className="ppg-variability" aria-label="Pulse interval variability" data-testid="ppg-variability">
            <div className="ppg-variability-heading">
              <strong>Pulse interval variability</strong>
              <span>{variabilityReady ? '60 SEC · PPG' : `${Math.floor(variabilityProgress)} / 60 SEC`}</span>
            </div>
            <div
              className="ppg-variability-progress"
              role="progressbar"
              aria-label="Clean signal collected for pulse variability"
              aria-valuemin={0}
              aria-valuemax={60}
              aria-valuenow={Math.floor(variabilityProgress)}
            >
              <span style={{ width: `${(variabilityProgress / 60) * 100}%` }} />
            </div>
            <div className="ppg-variability-grid">
              <VariabilityCard label="SDNN" value={variability?.sdnnMs ?? null} unit="ms" />
              <VariabilityCard label="RMSSD" value={variability?.rmssdMs ?? null} unit="ms" />
              <VariabilityCard label="pNN50" value={variability?.pnn50Percent ?? null} unit="%" />
              <VariabilityCard label="Mean PPI" value={variability?.meanPpiMs ?? null} unit="ms" precision={0} />
            </div>
            <p>Estimated from optical pulse-to-pulse intervals, not ECG. Values appear only after 60 seconds of clean signal.</p>
          </section>

          <SignalPlot samples={samples} sampleCount={sampleCount} active={phase === 'live'} markers={markers} />

          <div className="ppg-breathing">
            <div className="ppg-breathing-heading"><span><Wind size={16} /> BREATHING MARKERS</span><span>{markers.length} MARKED</span></div>
            <p>Mark moments as you breathe, if useful. These are personal notes, not an assessment.</p>
            <div className="ppg-breathing-actions">
              <button type="button" onClick={() => onMarkBreathing('inhale')} disabled={!cameraActive} data-testid="button-mark-inhale"><span className="ppg-inhale-mark" /> Mark inhale</button>
              <button type="button" onClick={() => onMarkBreathing('exhale')} disabled={!cameraActive} data-testid="button-mark-exhale"><span className="ppg-exhale-mark" /> Mark exhale</button>
            </div>
            {markers.length > 0 && <div className="ppg-marker-list" aria-label="Recent breathing markers" data-testid="list-breathing-markers">
              {markers.slice(-3).reverse().map((marker, index) => <span key={`${marker.elapsedSeconds}-${marker.event}-${index}`}><i className={marker.event} />{marker.event} · {formatTime(marker.elapsedSeconds)}</span>)}
            </div>}
          </div>

          <button className="ppg-export" type="button" onClick={onExportCsv} disabled={sampleCount === 0} data-testid="button-export-ppg-csv"><Download size={15} /> Export session as CSV <span>{sampleCount ? `${sampleCount} samples` : 'Available after sampling'}</span></button>
        </aside>
      </section>

      <section className="ppg-guidance">
        <div className="ppg-guidance-icon"><Info size={17} /></div>
        <div><strong>Explore gently. This is wellness-only.</strong><p>Camera pulse estimates can be affected by movement, lighting, temperature, and fit. They are for general wellness exploration only—not medical advice, diagnosis, or a substitute for care.</p></div>
        <div className="ppg-guidance-check"><Check size={14} /> No account. No frame upload.</div>
      </section>

      <footer className="ppg-footer">
        <span><span className="ppg-footer-mark">V</span> VitalLens Live <i>/</i> fingertip mode</span>
        <span>LOCAL SIGNAL PROCESSING <i>·</i> WELLNESS ONLY</span>
      </footer>
    </main>
  );
}

export default FingertipPpgMode;