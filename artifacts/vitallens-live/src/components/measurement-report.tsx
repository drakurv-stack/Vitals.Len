import { useEffect, useMemo, useRef } from 'react';
import { Activity, ArrowLeft, CalendarClock, Check, Clock3, Fingerprint, HeartPulse, Info, Wind, X } from 'lucide-react';
import './measurement-report.css';

export type MeasurementReportMetric = {
  key: 'heartRate' | 'respiratoryRate' | 'hrvSdnn' | 'hrvRmssd' | 'hrvPnn50' | 'meanPulseInterval' | 'hrvModa' | 'hrvAmo50' | 'hrvMxDmn' | 'hrvCv' | 'hrvStressIndex';
  label: string;
  value: number | null;
  unit: string;
  confidencePercent: number | null;
  min: number | null;
  max: number | null;
  readingCount: number;
};

export type MeasurementReportData = {
  source: 'fingertip' | 'vitallens';
  completedAt: string;
  durationSeconds: number;
  sampleCount: number;
  summary: string;
  signalQualityPercent: number | null;
  metrics: MeasurementReportMetric[];
  heartRateTrend: Array<{ elapsedSeconds: number; value: number }>;
};

export type MeasurementReportProps = {
  report: MeasurementReportData;
  onClose: () => void;
  onViewBodyReport?: () => void;
};

const metricExplanations: Record<MeasurementReportMetric['key'], string> = {
  heartRate: 'An estimate of how many heartbeats occur in one minute, based on this session’s camera-derived signal.',
  respiratoryRate: 'An estimate of breaths per minute. This value is only shown when the session returned a reading.',
  hrvSdnn: 'SDNN describes the spread of detected optical pulse-to-pulse intervals in this session.',
  hrvRmssd: 'RMSSD describes short-term changes between successive optical pulse-to-pulse intervals in this session.',
  hrvPnn50: 'pNN50 is the share of successive optical pulse intervals that differ by more than 50 ms.',
  meanPulseInterval: 'The average time between detected optical pulses during this session.',
  hrvModa: 'Moda is the center of the most common 50 ms bin of quality-screened optical pulse intervals.',
  hrvAmo50: 'AMo50 is the share of quality-screened optical pulse intervals in the most common 50 ms bin.',
  hrvMxDmn: 'MxDMn is the range between the shortest and longest quality-screened optical pulse intervals.',
  hrvCv: 'CV is the pulse-interval standard deviation expressed as a percentage of the mean interval.',
  hrvStressIndex: 'An experimental histogram-derived index from optical pulse intervals; it is not a stress diagnosis.',
};

const metricIcons = {
  heartRate: HeartPulse,
  respiratoryRate: Wind,
  hrvSdnn: Activity,
  hrvRmssd: Activity,
  hrvPnn50: Activity,
  meanPulseInterval: Activity,
  hrvModa: Activity,
  hrvAmo50: Activity,
  hrvMxDmn: Activity,
  hrvCv: Activity,
  hrvStressIndex: Activity,
};

function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return minutes ? `${minutes} min ${remaining} sec` : `${remaining} sec`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function TrendChart({ data }: { data: MeasurementReportData['heartRateTrend'] }) {
  const points = useMemo(() => data.filter((point) =>
    Number.isFinite(point.elapsedSeconds) && Number.isFinite(point.value),
  ), [data]);

  if (!points.length) {
    return (
      <div className="vl-report-trend-empty" data-testid="status-heart-rate-trend-empty">
        <span className="vl-report-empty-mark" aria-hidden="true" />
        <p>No heart-rate trend was returned for this session.</p>
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || Math.max(high * 0.08, 1);
  const minValue = low - spread * 0.16;
  const maxValue = high + spread * 0.16;
  const firstTime = points[0].elapsedSeconds;
  const lastTime = points[points.length - 1].elapsedSeconds;
  const timeSpan = lastTime - firstTime || 1;
  const path = points.map((point, index) => {
    const x = 12 + ((point.elapsedSeconds - firstTime) / timeSpan) * 576;
    const y = 82 - ((point.value - minValue) / (maxValue - minValue)) * 62;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <figure className="vl-report-trend" data-testid="chart-heart-rate-trend">
      <div className="vl-report-trend-top">
        <span>HEART RATE</span>
        <span>{points.length} {points.length === 1 ? 'POINT' : 'POINTS'}</span>
      </div>
      <svg viewBox="0 0 600 104" preserveAspectRatio="none" role="img" aria-label={`Heart rate trend with ${points.length} measured ${points.length === 1 ? 'point' : 'points'}, ranging from ${formatValue(low)} to ${formatValue(high)} beats per minute.`}>
        <path className="vl-report-chart-grid" d="M0 20H600M0 51H600M0 82H600" />
        <path className="vl-report-chart-line" d={path} />
        {points.length === 1 && (() => {
          const y = 82 - ((points[0].value - minValue) / (maxValue - minValue)) * 62;
          return <circle className="vl-report-chart-point" cx="12" cy={y} r="4" />;
        })()}
      </svg>
      <figcaption>
        <span>{formatDuration(firstTime)} into session</span>
        <span>{formatDuration(lastTime)} into session</span>
      </figcaption>
    </figure>
  );
}

function MetricCard({ metric }: { metric: MeasurementReportMetric }) {
  const Icon = metricIcons[metric.key];
  const hasRange = metric.min !== null && metric.max !== null;
  const hasConfidence = metric.confidencePercent !== null && Number.isFinite(metric.confidencePercent);

  return (
    <article className={`vl-report-metric vl-report-metric-${metric.key}`} data-testid={`report-metric-${metric.key}`}>
      <div className="vl-report-metric-heading">
        <span className="vl-report-metric-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.7} /></span>
        <span className="vl-report-metric-label">{metric.label}</span>
      </div>
      <div className="vl-report-metric-reading" data-testid={`report-value-${metric.key}`}>
        {formatValue(metric.value as number)}
        <small>{metric.unit}</small>
      </div>
      <p className="vl-report-metric-explanation">{metricExplanations[metric.key]}</p>
      <div className="vl-report-metric-meta">
        {hasRange && <span data-testid={`report-range-${metric.key}`}>Session range <strong>{formatValue(metric.min as number)}–{formatValue(metric.max as number)} {metric.unit}</strong></span>}
        {hasConfidence && <span data-testid={`report-confidence-${metric.key}`}>Confidence <strong>{formatValue(metric.confidencePercent as number)}%</strong></span>}
        <span data-testid={`report-reading-count-${metric.key}`}>{metric.readingCount} {metric.readingCount === 1 ? 'reading' : 'readings'}</span>
      </div>
    </article>
  );
}

export function MeasurementReport({ report, onClose, onViewBodyReport }: MeasurementReportProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sourceLabel = report.source === 'fingertip' ? 'Fingertip PPG' : 'VitalLens face camera';
  const availableMetrics = report.metrics.filter((metric) =>
    metric.value !== null && Number.isFinite(metric.value),
  );
  const quality = report.signalQualityPercent !== null && Number.isFinite(report.signalQualityPercent)
    ? Math.min(100, Math.max(0, report.signalQualityPercent))
    : null;

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('.vl-report-dialog');
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="vl-report" data-testid="measurement-report">
      <div className="vl-report-scrim" aria-hidden="true" />
      <section
        className="vl-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vl-report-title"
        aria-describedby="vl-report-summary"
        data-testid="measurement-report-dialog"
      >
        <header className="vl-report-header">
          <div className="vl-report-brand" aria-label="VitalLens Live">
            <span className="vl-report-brand-mark"><Activity size={17} /></span>
            <span>vital<span>lens</span><sup>LIVE</sup></span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="vl-report-close"
            onClick={onClose}
            aria-label="Close measurement report"
            data-testid="button-close-measurement-report"
          >
            <X size={18} />
          </button>
        </header>

        <main className="vl-report-content">
          <section className="vl-report-overview" aria-labelledby="vl-report-title">
            <div className="vl-report-eyebrow"><span /> SESSION REPORT <span className="vl-report-session-number">01 / 01</span></div>
            <div className="vl-report-title-row">
              <div>
                <div className="vl-report-source"><span>{report.source === 'fingertip' ? <Fingerprint size={14} /> : <Activity size={14} />}</span>{sourceLabel}</div>
                <h1 id="vl-report-title">Your session,<br /><em>measured.</em></h1>
              </div>
              <div className="vl-report-complete-mark" aria-hidden="true"><Check size={21} /></div>
            </div>
            <p className="vl-report-summary" id="vl-report-summary" data-testid="text-report-summary">{report.summary}</p>
            <div className="vl-report-session-meta" data-testid="report-session-metadata">
              <span><CalendarClock size={14} />{formatDate(report.completedAt)}</span>
              <span><Clock3 size={14} />{formatDuration(report.durationSeconds)}</span>
              <span><Activity size={14} />{report.sampleCount} samples</span>
            </div>
          </section>

          <section className="vl-report-measurements" aria-labelledby="vl-report-measurements-title">
            <div className="vl-report-section-head">
              <div><span className="vl-report-section-index">01</span><h2 id="vl-report-measurements-title">What this session returned</h2></div>
              <span className="vl-report-section-note">MEASUREMENTS</span>
            </div>
            {availableMetrics.length ? (
              <div className="vl-report-metric-list" data-testid="list-report-metrics">
                {availableMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} />)}
              </div>
            ) : (
              <div className="vl-report-no-metrics" role="status" data-testid="status-no-report-metrics">
                <Info size={17} />
                <p>No metric values were returned for this session. Nothing is shown as a zero reading.</p>
              </div>
            )}
          </section>

          {report.source === 'fingertip' && quality !== null && (
            <section className="vl-report-quality" aria-labelledby="vl-report-quality-title" data-testid="report-signal-quality">
              <div className="vl-report-quality-heading">
                <div><span className="vl-report-section-index">02</span><h2 id="vl-report-quality-title">Signal quality</h2></div>
                <strong>{formatValue(quality)}<small>%</small></strong>
              </div>
              <div className="vl-report-quality-track" role="meter" aria-label="Signal quality" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quality} data-testid="meter-signal-quality">
                <span style={{ width: `${quality}%` }} />
              </div>
              <p>This is the signal-quality estimate supplied for this fingertip session. It describes the captured signal, not a health score.</p>
            </section>
          )}

          {(report.source === 'vitallens' || report.source === 'fingertip') && (
            <section className="vl-report-trend-section" aria-labelledby="vl-report-trend-title">
              <div className="vl-report-section-head">
                <div><span className="vl-report-section-index">{report.source === 'fingertip' && quality !== null ? '03' : '02'}</span><h2 id="vl-report-trend-title">Across this session</h2></div>
                <span className="vl-report-section-note">HEART RATE</span>
              </div>
              <TrendChart data={report.heartRateTrend} />
            </section>
          )}

          <aside className="vl-report-notice" role="note" data-testid="report-wellness-notice">
            <span className="vl-report-notice-icon"><Info size={16} /></span>
            <div>
              <strong>Wellness exploration only</strong>
              <p>These camera-derived readings are estimates for general wellness exploration. They are not a medical measurement, diagnosis, or substitute for professional care.</p>
            </div>
          </aside>
        </main>

        <footer className="vl-report-footer">
          <span><span className="vl-report-footer-mark">V</span> VitalLens Live <i>/</i> session record</span>
          {onViewBodyReport && (
            <button type="button" onClick={onViewBodyReport} data-testid="button-view-body-report">
              View Body Report
            </button>
          )}
          <button type="button" onClick={onClose} data-testid="button-report-back"><ArrowLeft size={15} /> Back to camera</button>
        </footer>
      </section>
    </div>
  );
}