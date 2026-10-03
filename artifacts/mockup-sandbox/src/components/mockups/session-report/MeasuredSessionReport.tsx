import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Fingerprint,
  HeartPulse,
  Info,
  RotateCcw,
  Wind,
} from 'lucide-react';
import './_group.css';
import './MeasuredSessionReport.css';

type MeasurementReportMetric = {
  key: 'heartRate' | 'respiratoryRate' | 'hrvSdnn' | 'hrvRmssd' | 'hrvPnn50' | 'meanPulseInterval';
  label: string;
  value: number | null;
  unit: string;
  confidencePercent: number | null;
  min: number | null;
  max: number | null;
  readingCount: number;
};

type MeasurementReportData = {
  source: 'fingertip' | 'vitallens';
  completedAt: string;
  durationSeconds: number;
  sampleCount: number;
  summary: string;
  signalQualityPercent: number | null;
  metrics: MeasurementReportMetric[];
  heartRateTrend: Array<{ elapsedSeconds: number; value: number }>;
};

type View = 'overview' | 'metrics' | 'trends';

type MeasuredSessionReportProps = {
  report?: MeasurementReportData;
  onContinue?: () => void;
  onRetake?: () => void;
};

const demoReport: MeasurementReportData = {
  source: 'fingertip',
  completedAt: '2025-02-18T10:42:00.000Z',
  durationSeconds: 60,
  sampleCount: 60,
  summary: 'A one-minute fingertip session returned heart rate, respiratory rate, HRV, and pulse-interval readings.',
  signalQualityPercent: 94,
  metrics: [
    { key: 'heartRate', label: 'Heart rate', value: 72, unit: 'bpm', confidencePercent: 96, min: 69, max: 76, readingCount: 60 },
    { key: 'respiratoryRate', label: 'Respiratory rate', value: 14, unit: 'breaths/min', confidencePercent: 89, min: 13, max: 15, readingCount: 12 },
    { key: 'hrvSdnn', label: 'HRV · SDNN', value: 48.6, unit: 'ms', confidencePercent: 91, min: 42.1, max: 55.8, readingCount: 59 },
    { key: 'hrvRmssd', label: 'HRV · RMSSD', value: 36.2, unit: 'ms', confidencePercent: 91, min: 30.4, max: 43.7, readingCount: 59 },
    { key: 'hrvPnn50', label: 'HRV · pNN50', value: 12, unit: '%', confidencePercent: 91, min: 8, max: 17, readingCount: 58 },
    { key: 'meanPulseInterval', label: 'Mean pulse interval', value: 833.3, unit: 'ms', confidencePercent: 96, min: 789.5, max: 869.6, readingCount: 60 },
  ],
  heartRateTrend: [
    { elapsedSeconds: 0, value: 76 },
    { elapsedSeconds: 10, value: 74 },
    { elapsedSeconds: 20, value: 73 },
    { elapsedSeconds: 30, value: 71 },
    { elapsedSeconds: 40, value: 72 },
    { elapsedSeconds: 50, value: 70 },
    { elapsedSeconds: 60, value: 72 },
  ],
};

const metricExplanations: Record<MeasurementReportMetric['key'], string> = {
  heartRate: 'An estimate of how many heartbeats occur in one minute, based on this session’s camera-derived signal.',
  respiratoryRate: 'An estimate of breaths per minute. This value is only shown when the session returned a reading.',
  hrvSdnn: 'SDNN describes the spread of detected optical pulse-to-pulse intervals in this session.',
  hrvRmssd: 'RMSSD describes short-term changes between successive optical pulse-to-pulse intervals in this session.',
  hrvPnn50: 'pNN50 is the share of successive optical pulse intervals that differ by more than 50 ms.',
  meanPulseInterval: 'The average time between detected optical pulses during this session.',
};

const metricIcons = {
  heartRate: HeartPulse,
  respiratoryRate: Wind,
  hrvSdnn: Activity,
  hrvRmssd: Activity,
  hrvPnn50: Activity,
  meanPulseInterval: Activity,
};

const tabs: Array<{ id: View; label: string; number: string }> = [
  { id: 'overview', label: 'Overview', number: '01' },
  { id: 'metrics', label: 'Metrics', number: '02' },
  { id: 'trends', label: 'Trends', number: '03' },
];

function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return minutes ? `${minutes} min ${remaining} sec` : `${remaining} sec`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function MetricDisclosure({
  metric,
  expanded,
  onToggle,
}: {
  metric: MeasurementReportMetric;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = metricIcons[metric.key];
  const hasRange = metric.min !== null && metric.max !== null
    && Number.isFinite(metric.min) && Number.isFinite(metric.max);
  const hasConfidence = metric.confidencePercent !== null
    && Number.isFinite(metric.confidencePercent);

  return (
    <article className={`msr-metric ${expanded ? 'is-expanded' : ''}`} data-testid={`report-metric-${metric.key}`}>
      <button
        type="button"
        className="msr-metric-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`metric-details-${metric.key}`}
        aria-label={`${metric.label}, ${formatValue(metric.value as number)} ${metric.unit}. ${expanded ? 'Hide' : 'Show'} session details`}
        data-testid={`button-explain-${metric.key}`}
      >
        <span className="msr-metric-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.8} /></span>
        <span className="msr-metric-name">{metric.label}</span>
        <span className="msr-metric-value" data-testid={`report-value-${metric.key}`}>
          {formatValue(metric.value as number)}<small>{metric.unit}</small>
        </span>
        <ChevronDown className="msr-metric-chevron" size={16} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="msr-metric-details" id={`metric-details-${metric.key}`} data-testid={`metric-details-${metric.key}`}>
          <p>{metricExplanations[metric.key]}</p>
          <div className="msr-metric-facts">
            {hasRange && <span data-testid={`report-range-${metric.key}`}>Session range <strong>{formatValue(metric.min as number)}–{formatValue(metric.max as number)} {metric.unit}</strong></span>}
            {hasConfidence && <span data-testid={`report-confidence-${metric.key}`}>Confidence <strong>{formatValue(metric.confidencePercent as number)}%</strong></span>}
            <span data-testid={`report-reading-count-${metric.key}`}>{metric.readingCount} {metric.readingCount === 1 ? 'reading' : 'readings'}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function SessionTrend({ data }: { data: MeasurementReportData['heartRateTrend'] }) {
  const points = useMemo(() => data.filter((point) =>
    Number.isFinite(point.elapsedSeconds) && Number.isFinite(point.value),
  ), [data]);

  if (!points.length) {
    return (
      <div className="msr-trend-empty" role="status" data-testid="status-heart-rate-trend-empty">
        <span className="msr-empty-symbol" aria-hidden="true" />
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
    <figure className="msr-trend-chart" data-testid="chart-heart-rate-trend">
      <div className="msr-chart-caption">
        <span>HEART RATE</span>
        <span>{points.length} {points.length === 1 ? 'POINT' : 'POINTS'}</span>
      </div>
      <svg
        viewBox="0 0 600 104"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Heart rate curve within this session only. ${points.length} measured ${points.length === 1 ? 'point' : 'points'}, ranging from ${formatValue(low)} to ${formatValue(high)} beats per minute.`}
      >
        <path className="msr-chart-grid" d="M0 20H600M0 51H600M0 82H600" />
        <path className="msr-chart-line" d={path} />
        {points.length === 1 && (
          <circle
            className="msr-chart-point"
            cx="12"
            cy={82 - ((points[0].value - minValue) / (maxValue - minValue)) * 62}
            r="4"
          />
        )}
      </svg>
      <figcaption>
        <span>{formatDuration(firstTime)} into session</span>
        <span>{formatDuration(lastTime)} into session</span>
      </figcaption>
    </figure>
  );
}

export function MeasuredSessionReport({
  report = demoReport,
  onContinue,
  onRetake,
}: MeasuredSessionReportProps) {
  const [activeView, setActiveView] = useState<View>('overview');
  const [expandedMetric, setExpandedMetric] = useState<MeasurementReportMetric['key'] | null>(null);
  const [continued, setContinued] = useState(false);
  const [retakeReady, setRetakeReady] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const sourceLabel = report.source === 'fingertip' ? 'Fingertip camera' : 'VitalLens face camera';
  const availableMetrics = report.metrics.filter((metric) =>
    metric.value !== null && Number.isFinite(metric.value),
  );
  const heartRate = availableMetrics.find((metric) => metric.key === 'heartRate');
  const quality = report.signalQualityPercent !== null && Number.isFinite(report.signalQualityPercent)
    ? Math.min(100, Math.max(0, report.signalQualityPercent))
    : null;

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    setActiveView(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  function continueToCamera() {
    onContinue?.();
    setContinued(true);
  }

  function startRetake() {
    onRetake?.();
    setRetakeReady(true);
  }

  return (
    <div className="msr-page" data-testid="measurement-report">
      <header className="msr-topbar">
        <div className="msr-brand" aria-label="VitalLens Live">
          <span className="msr-brand-mark"><Activity size={16} strokeWidth={1.8} /></span>
          <span className="msr-brand-word">vital<span>lens</span><sup>LIVE</sup></span>
        </div>
        <span className="msr-topbar-note"><span className="msr-status-light" /> PRIVATE SESSION</span>
      </header>

      <main className="msr-main">
        <div className="msr-page-intro">
          <div className="msr-kicker"><span className="msr-kicker-line" /> SESSION RECORD <span className="msr-kicker-index">01 / 01</span></div>
          <h1>A closer look at<br className="msr-mobile-break" /> this session.</h1>
          <p>Optical pulse signals, gathered in one quiet moment.</p>
        </div>

        <section className="msr-report-panel" aria-label="Measurement session report" data-testid="measurement-report-panel">
          <div className="msr-panel-topline">
            <div className="msr-source-pill">
              <span aria-hidden="true">{report.source === 'fingertip' ? <Fingerprint size={14} /> : <Activity size={14} />}</span>
              {sourceLabel}
            </div>
            <span className="msr-capture-stamp"><Check size={13} /> SESSION COMPLETE</span>
          </div>

          <div className="msr-tabs" role="tablist" aria-label="Report views" data-testid="report-view-tabs">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                ref={(element) => { tabRefs.current[index] = element; }}
                type="button"
                role="tab"
                id={`report-tab-${tab.id}`}
                aria-selected={activeView === tab.id}
                aria-controls={`report-panel-${tab.id}`}
                tabIndex={activeView === tab.id ? 0 : -1}
                onClick={() => setActiveView(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                data-testid={`tab-report-${tab.id}`}
              >
                <span className="msr-tab-number">{tab.number}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className="msr-view-panel"
            role="tabpanel"
            id={`report-panel-${activeView}`}
            aria-labelledby={`report-tab-${activeView}`}
            tabIndex={0}
            data-testid={`panel-report-${activeView}`}
          >
            {activeView === 'overview' && (
              <div className="msr-overview-view">
                {availableMetrics.length ? (
                  <>
                    <div className="msr-overview-lead">
                      <div className="msr-lead-label"><span className="msr-pulse-dot" /> SESSION SNAPSHOT</div>
                      {heartRate ? (
                        <div className="msr-lead-reading">
                          <div className="msr-lead-value">{formatValue(heartRate.value as number)}<small>{heartRate.unit}</small></div>
                          <div className="msr-lead-meta">
                            <strong>Heart rate</strong>
                            <span>A reading from this session</span>
                          </div>
                          <HeartPulse className="msr-lead-icon" size={27} strokeWidth={1.4} aria-hidden="true" />
                        </div>
                      ) : (
                        <div className="msr-lead-no-heart">Heart-rate estimate was not returned for this session.</div>
                      )}
                      <p className="msr-summary" data-testid="text-report-summary">{report.summary}</p>
                    </div>

                    <div className="msr-session-details">
                      <div className="msr-details-heading"><span>SESSION DETAILS</span><span>LOCAL RECORD</span></div>
                      <div className="msr-detail-grid" data-testid="report-session-metadata">
                        <div className="msr-detail"><CalendarDays size={15} aria-hidden="true" /><span>Completed</span><strong>{formatDate(report.completedAt)}</strong></div>
                        <div className="msr-detail"><Clock3 size={15} aria-hidden="true" /><span>Duration</span><strong>{formatDuration(report.durationSeconds)}</strong></div>
                        <div className="msr-detail"><Activity size={15} aria-hidden="true" /><span>Samples</span><strong>{report.sampleCount} collected</strong></div>
                        {quality !== null && report.source === 'fingertip' && (
                          <div className="msr-detail msr-quality-detail" data-testid="report-signal-quality">
                            <span className="msr-quality-icon"><Check size={12} /></span>
                            <span>Signal quality</span>
                            <strong>{formatValue(quality)}%</strong>
                            <span className="msr-quality-track" role="meter" aria-label="Signal quality estimate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quality} data-testid="meter-signal-quality"><span style={{ width: `${quality}%` }} /></span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button className="msr-view-more" type="button" onClick={() => setActiveView('metrics')} data-testid="button-view-measurements">
                      Explore {availableMetrics.length} returned measurements <ArrowRight size={15} />
                    </button>
                  </>
                ) : (
                  <div className="msr-empty-state" role="status" data-testid="status-no-report-metrics">
                    <span className="msr-empty-mark"><Activity size={21} strokeWidth={1.4} /></span>
                    <span className="msr-empty-kicker">A QUIET SIGNAL</span>
                    <h2>No reliable measurements this time.</h2>
                    <p>Nothing is shown as a zero reading. You can try another measurement whenever you’re ready.</p>
                    <button type="button" className="msr-retake-button" onClick={startRetake} data-testid="button-retake-measurement">
                      <RotateCcw size={15} /> Start another measurement
                    </button>
                    {retakeReady && <span className="msr-retake-note" role="status">Continue to the camera to begin again.</span>}
                  </div>
                )}
              </div>
            )}

            {activeView === 'metrics' && (
              <section className="msr-metrics-view" aria-labelledby="msr-metrics-heading">
                <div className="msr-view-heading">
                  <div><span className="msr-section-kicker">MEASURED VALUES</span><h2 id="msr-metrics-heading">What this session returned</h2></div>
                  <span className="msr-count-tag">{availableMetrics.length} {availableMetrics.length === 1 ? 'VALUE' : 'VALUES'}</span>
                </div>
                {availableMetrics.length ? (
                  <>
                    <p className="msr-instruction">Select a measurement for its session details.</p>
                    <div className="msr-metric-list" data-testid="list-report-metrics">
                      {availableMetrics.map((metric) => (
                        <MetricDisclosure
                          key={metric.key}
                          metric={metric}
                          expanded={expandedMetric === metric.key}
                          onToggle={() => setExpandedMetric(expandedMetric === metric.key ? null : metric.key)}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="msr-no-metrics" role="status" data-testid="status-no-report-metrics">
                    <Info size={17} />
                    <p>No metric values were returned for this session. Nothing is shown as a zero reading.</p>
                    <button type="button" onClick={startRetake} data-testid="button-retake-measurement">Try another measurement <ArrowRight size={14} /></button>
                    {retakeReady && <span role="status">Continue to the camera to begin again.</span>}
                  </div>
                )}
              </section>
            )}

            {activeView === 'trends' && (
              <section className="msr-trends-view" aria-labelledby="msr-trends-heading">
                <div className="msr-view-heading">
                  <div><span className="msr-section-kicker">ONE SESSION, OVER TIME</span><h2 id="msr-trends-heading">A signal in motion</h2></div>
                  <span className="msr-count-tag">THIS SESSION</span>
                </div>
                <p className="msr-trend-intro">A simple view of heart-rate readings as they arrived during this session.</p>
                <SessionTrend data={report.heartRateTrend} />
                <div className="msr-trend-disclaimer"><Info size={14} /><span>The curve reflects this session only. It is not a comparison or a prediction.</span></div>
              </section>
            )}
          </div>

          <aside className="msr-wellness-note" role="note" data-testid="report-wellness-notice">
            <span className="msr-note-icon"><Info size={15} /></span>
            <div><strong>Wellness exploration only</strong><p>These camera-derived readings are estimates for general wellness exploration. They are not a medical measurement, diagnosis, or substitute for professional care.</p></div>
          </aside>
        </section>
      </main>

      <footer className="msr-action-dock">
        <div className="msr-dock-inner">
          <span className="msr-dock-note"><span className="msr-dock-mark">V</span> A personal session record</span>
          <div className="msr-dock-action">
            {continued && <span className="msr-continue-status" role="status" data-testid="status-continue">Ready to return to your camera.</span>}
            <button type="button" onClick={continueToCamera} data-testid="button-report-continue" aria-label="Continue to the camera">
              Continue <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default MeasuredSessionReport;