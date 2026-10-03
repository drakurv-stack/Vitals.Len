import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Fingerprint,
  HeartPulse,
  Info,
  Leaf,
  LockKeyhole,
  X,
} from 'lucide-react';
import type { MeasurementReportData } from './measurement-report';
import {
  BODY_REPORT_EXPLANATIONS,
  BODY_REPORT_METRIC_DETAILS,
  BODY_REPORT_SCORE_KEYS,
  BODY_REPORT_SCORE_LABELS,
} from './body-report-config';
import './body-report.css';

export type BodyReportHistoryItem = {
  id: string;
  source: 'fingertip' | 'vitallens' | 'manual';
  completedAt: string;
  metrics: Record<string, number | null>;
};

export type BodyReportProfile = {
  age: number | null;
  sex: string | null;
};

export type BodyReportProps = {
  report: MeasurementReportData | null;
  history: BodyReportHistoryItem[];
  profile: BodyReportProfile;
  status: 'loading' | 'ready' | 'error';
  onContinue: () => void;
  onMeasureAgain: () => void;
  onManualSave: (input: {
    age: number | null;
    sex: string | null;
    metrics: Record<string, number>;
  }) => Promise<void>;
};

type ReportTab = 'overview' | 'metrics' | 'trends';

const tabs: Array<{ id: ReportTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'trends', label: 'Trends' },
];

const scoreIcons = {
  stress: Activity,
  energy: Leaf,
  health: HeartPulse,
  focus: CircleHelp,
  hrvScore: Activity,
  coherence: Activity,
} as const;

const heroScoreKeys = ['stress', 'energy', 'health'] as const;

const sourceNames: Record<BodyReportHistoryItem['source'], string> = {
  fingertip: 'Fingertip camera',
  vitallens: 'Face camera',
  manual: 'Manual entry',
};

const manualMetricKeys = Object.keys(BODY_REPORT_METRIC_DETAILS);

function formatDate(value: string | undefined): string {
  if (!value) return 'Date not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not available';
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function metricLabel(key: string): string {
  return BODY_REPORT_METRIC_DETAILS[key]?.label ?? key;
}

function metricUnit(key: string, report: MeasurementReportData | null): string {
  const reportUnit = report?.metrics.find((metric) => metric.key === key)?.unit;
  return reportUnit || BODY_REPORT_METRIC_DETAILS[key]?.unit || '';
}

function sourceLabel(source: MeasurementReportData['source'] | 'manual'): string {
  return source === 'fingertip' ? 'Fingertip camera' : source === 'vitallens' ? 'Face camera' : 'Manual entry';
}

export function BodyReport({
  report,
  history,
  profile,
  status,
  onContinue,
  onMeasureAgain,
  onManualSave,
}: BodyReportProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [activeExplanation, setActiveExplanation] = useState<string | null>(null);
  const [openMetric, setOpenMetric] = useState<string | null>(null);
  const [selectedTrend, setSelectedTrend] = useState<string>('');
  const [age, setAge] = useState(profile.age === null ? '' : String(profile.age));
  const [sex, setSex] = useState(profile.sex ?? '');
  const [manualMetrics, setManualMetrics] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveComplete, setSaveComplete] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const explanationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const ageId = 'body-report-age';
  const sexId = 'body-report-sex';

  useEffect(() => {
    setAge(profile.age === null ? '' : String(profile.age));
    setSex(profile.sex ?? '');
  }, [profile.age, profile.sex]);

  const availableMetrics = useMemo(
    () => report?.metrics.filter(
      (metric) => metric.value !== null && Number.isFinite(metric.value),
    ) ?? [],
    [report],
  );

  const trendKeys = useMemo(() => {
    const keys = new Set<string>();
    history.forEach((item) => {
      Object.entries(item.metrics).forEach(([key, value]) => {
        if (value !== null && Number.isFinite(value)) keys.add(key);
      });
    });
    return Array.from(keys);
  }, [history]);

  const selectedTrendKey = trendKeys.includes(selectedTrend) ? selectedTrend : (trendKeys[0] ?? '');
  const trendEntries = useMemo(
    () => history
      .map((item) => ({ item, value: item.metrics[selectedTrendKey] }))
      .filter(
        (entry): entry is { item: BodyReportHistoryItem; value: number } =>
          selectedTrendKey !== '' &&
          entry.value !== null &&
          entry.value !== undefined &&
          Number.isFinite(entry.value),
      )
      .sort(
        (left, right) =>
          new Date(right.item.completedAt).getTime() -
          new Date(left.item.completedAt).getTime(),
      ),
    [history, selectedTrendKey],
  );

  useEffect(() => {
    if (!activeExplanation) return undefined;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveExplanation(null);
      if (event.key === 'Tab') {
        const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      explanationTriggerRef.current?.focus();
    };
  }, [activeExplanation]);

  const validAge = age.trim() === '' ? null : Number(age);
  const profileHasInput = age.trim() !== '' || sex !== '';
  const manualValues = Object.fromEntries(
    Object.entries(manualMetrics)
      .filter(([, value]) => value.trim() !== '' && Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Number(value)]),
  );

async function saveManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || (!profileHasInput && Object.keys(manualValues).length === 0)) return;
    setIsSaving(true);
    setSaveError('');
    setSaveComplete(false);
    try {
      await onManualSave({
        age: validAge !== null && Number.isFinite(validAge) ? validAge : null,
        sex: sex || null,
        metrics: manualValues,
      });
      setSaveComplete(true);
    } catch {
      setSaveError('We couldn’t save this entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  function showExplanation(key: string, trigger: HTMLButtonElement) {
    explanationTriggerRef.current = trigger;
    setActiveExplanation(key);
  }

  const activeDetail = activeExplanation
    ? BODY_REPORT_EXPLANATIONS[activeExplanation]
    : null;
  const activeTitle = activeExplanation
    ? BODY_REPORT_SCORE_LABELS[activeExplanation as keyof typeof BODY_REPORT_SCORE_LABELS] ??
      metricLabel(activeExplanation)
    : '';
  const hasNoReliableReadings = report !== null && availableMetrics.length === 0;
  const signalIsMissing =
    report?.source === 'fingertip' && report.signalQualityPercent === null;
  const currentSource = report ? sourceLabel(report.source) : 'Session report';
  const measuredValueCount = availableMetrics.length;
  const summarySentence = !report
    ? 'Only values returned from a completed measurement will appear here.'
    : measuredValueCount === 0
      ? `The ${currentSource.toLowerCase()} session returned no reliable metric values; nothing has been filled in.`
      : `${measuredValueCount} measured ${measuredValueCount === 1 ? 'value is' : 'values are'} available from this session.`;

  return (
    <main className="vl-body-report">
      <section className="vl-body-report-hero" aria-labelledby="body-report-title">
        <div className="vl-body-report-orbit vl-body-report-orbit-one" aria-hidden="true" />
        <div className="vl-body-report-orbit vl-body-report-orbit-two" aria-hidden="true" />
        <header className="vl-body-report-topline">
          <div className="vl-body-report-brand" aria-label="VitalLens">
            <span className="vl-body-report-brand-mark" aria-hidden="true"><Activity size={16} /></span>
            <span>VitalLens</span>
          </div>
          <span className="vl-body-report-private"><LockKeyhole size={13} /> Personal record</span>
        </header>
        <div className="vl-body-report-hero-content">
          <div className="vl-body-report-kicker"><span /> BODY REPORT</div>
          <div className="vl-body-report-title-line">
            <div>
              <h1 id="body-report-title">A moment to<br /><em>check in.</em></h1>
              <p className="vl-body-report-date"><CalendarDays size={15} /> {formatDate(report?.completedAt)}</p>
            </div>
            <div className="vl-body-report-sigil" aria-hidden="true"><span /><span /><span /></div>
          </div>
          <div className="vl-body-report-source">
            {report?.source === 'fingertip' ? <Fingerprint size={14} /> : <Activity size={14} />}
            <span>{currentSource}</span>
            <span className="vl-body-report-source-dot" aria-hidden="true" />
            <span>Wellness estimate</span>
          </div>
          <p className="vl-body-report-summary">{summarySentence}</p>
        </div>
        <div className="vl-body-report-hero-rings" aria-label="Wellness scores unavailable">
          {heroScoreKeys.map((key) => (
            <div className={`vl-body-report-hero-ring vl-body-report-hero-ring-${key}`} key={key}>
              <span className="vl-body-report-ring" role="img" aria-label={`${BODY_REPORT_SCORE_LABELS[key]} score not calculated`}>
                <span>—</span>
              </span>
              <span className="vl-body-report-ring-label">{BODY_REPORT_SCORE_LABELS[key]}</span>
              <span className="vl-body-report-ring-state">Not calculated</span>
            </div>
          ))}
        </div>
        <div className="vl-body-report-hero-foot">
          <span>YOUR SESSION</span>
          {report ? <span>{report.sampleCount} samples collected</span> : <span>Personal wellness record</span>}
        </div>
      </section>

      <div className="vl-body-report-page">
        <nav className="vl-body-report-tabs" aria-label="Body report sections" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              id={`body-report-tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="body-report-panel"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {status === 'loading' ? (
          <section className="vl-body-report-loading" role="status" aria-live="polite">
            <div className="vl-body-report-loading-mark" aria-hidden="true"><span /><span /><span /></div>
            <p>Preparing your report</p>
            <span>Only readings returned for this session will appear.</span>
            <div className="vl-body-report-loading-skeleton" aria-hidden="true">
              <i /><i /><i />
            </div>
          </section>
        ) : (
          <>
            {status === 'error' && (
              <div className="vl-body-report-alert" role="alert">
                <AlertCircle size={17} />
                <div>
                  <strong>This report couldn’t be fully loaded.</strong>
                  <p>You can try another measurement. Any readings shown below are the values available on this device.</p>
                </div>
                <button type="button" onClick={onMeasureAgain}>Measure again</button>
              </div>
            )}
            {hasNoReliableReadings && (
              <div className="vl-body-report-alert vl-body-report-alert-soft" role="status">
                <Info size={17} />
                <div>
                  <strong>No reliable measurements returned</strong>
                  <p>Nothing is shown as a zero reading. Try again with a steady camera and good light.</p>
                </div>
                <button type="button" onClick={onMeasureAgain}>Measure again</button>
              </div>
            )}

            <div
              id="body-report-panel"
              className="vl-body-report-panel"
              role="tabpanel"
              aria-labelledby={`body-report-tab-${activeTab}`}
              key={activeTab}
            >
              {activeTab === 'overview' && (
                <>
                  <section className="vl-body-report-intro">
                    <div className="vl-body-report-section-label">THE BIG PICTURE <span>01</span></div>
                    <h2>Numbers are only<br />one part of the picture.</h2>
                    <p>We only show scores when a validated value is available. These six wellness indicators were not returned for this session.</p>
                  </section>
                  <section className="vl-body-report-score-grid" aria-label="Wellness indicators">
                    {BODY_REPORT_SCORE_KEYS.map((key, index) => {
                      const Icon = scoreIcons[key];
                      return (
                        <button
                          className="vl-body-report-score"
                          key={key}
                          type="button"
                          aria-label={`${BODY_REPORT_SCORE_LABELS[key]}: unavailable. Open explanation.`}
                          onClick={(event) => showExplanation(key, event.currentTarget)}
                        >
                          <span className="vl-body-report-score-top">
                            <span className="vl-body-report-score-icon"><Icon size={17} /></span>
                            <span className="vl-body-report-score-index">0{index + 1}</span>
                          </span>
                          <span className="vl-body-report-score-name">{BODY_REPORT_SCORE_LABELS[key]}</span>
                          <span className="vl-body-report-score-value">Unavailable</span>
                          <span className="vl-body-report-score-help"><CircleHelp size={13} /> Why?</span>
                        </button>
                      );
                    })}
                  </section>

                  <section className="vl-body-report-section vl-body-report-session" aria-labelledby="body-report-session-title">
                    <div className="vl-body-report-section-label">SESSION READINGS <span>02</span></div>
                    <div className="vl-body-report-section-heading">
                      <h2 id="body-report-session-title">What we measured</h2>
                      <button type="button" className="vl-body-report-text-link" onClick={() => setActiveTab('metrics')}>
                        All metrics <ArrowRight size={15} />
                      </button>
                    </div>
                    {availableMetrics.length ? (
                      <div className="vl-body-report-featured-metrics">
                        {availableMetrics.slice(0, 2).map((metric) => (
                          <div className="vl-body-report-featured-metric" key={metric.key}>
                            <span>{metric.label}</span>
                            <strong>{formatNumber(metric.value as number)} <small>{metric.unit}</small></strong>
                            <span className="vl-body-report-reading-source">{currentSource}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="vl-body-report-empty-reading">
                        <Info size={16} />
                        <p>No measured values are available for this session yet.</p>
                      </div>
                    )}
                  </section>
                </>
              )}

              {activeTab === 'metrics' && (
                <section className="vl-body-report-section vl-body-report-metrics" aria-labelledby="body-report-metrics-title">
                  <div className="vl-body-report-section-label">SESSION DETAILS <span>01</span></div>
                  <h2 id="body-report-metrics-title">Measured values</h2>
                  <p className="vl-body-report-section-copy">Only values actually returned are listed. No population ranges or targets are applied.</p>
                  {availableMetrics.length ? (
                    <div className="vl-body-report-metric-list">
                      {availableMetrics.map((metric) => {
                        const isOpen = openMetric === metric.key;
                        const detail = BODY_REPORT_EXPLANATIONS[metric.key];
                        return (
                          <article className={`vl-body-report-metric${isOpen ? ' is-open' : ''}`} key={metric.key}>
                            <button
                              type="button"
                              className="vl-body-report-metric-trigger"
                              aria-expanded={isOpen}
                              aria-controls={`body-report-metric-detail-${metric.key}`}
                              onClick={() => setOpenMetric(isOpen ? null : metric.key)}
                            >
                              <span className="vl-body-report-metric-icon"><HeartPulse size={17} /></span>
                              <span className="vl-body-report-metric-main">
                                <strong>{metric.label}</strong>
                                <span>{currentSource}</span>
                              </span>
                              <span className="vl-body-report-metric-value">
                                {formatNumber(metric.value as number)} <small>{metric.unit}</small>
                              </span>
                              <ChevronDown className="vl-body-report-chevron" size={17} />
                            </button>
                            {isOpen && (
                              <div className="vl-body-report-metric-detail" id={`body-report-metric-detail-${metric.key}`}>
                                <p>{detail?.explanation ?? 'This value was returned by the current session. It is an estimate for wellness exploration only.'}</p>
                                {detail && <p className="vl-body-report-tip"><strong>A gentle tip</strong>{detail.tip}</p>}
                                {(metric.min !== null || metric.max !== null) && (
                                  <span className="vl-body-report-observed-range">
                                    Session range: {metric.min === null ? '—' : formatNumber(metric.min)}–{metric.max === null ? '—' : formatNumber(metric.max)} {metric.unit}
                                  </span>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="vl-body-report-empty-panel">
                      <span className="vl-body-report-empty-orbit" aria-hidden="true" />
                      <h3>No measured values yet</h3>
                      <p>This session did not return reliable measurements. Nothing is filled in or estimated here.</p>
                      <button type="button" onClick={onMeasureAgain}>Measure again <ArrowRight size={15} /></button>
                    </div>
                  )}
                  <div className="vl-body-report-signal-note">
                    <Info size={15} />
                    <span>{signalIsMissing ? 'Signal quality was not provided for this session.' : 'Measurements are camera-derived wellness estimates, not medical readings.'}</span>
                  </div>
                </section>
              )}

              {activeTab === 'trends' && (
                <section className="vl-body-report-section vl-body-report-trends" aria-labelledby="body-report-trends-title">
                  <div className="vl-body-report-section-label">YOUR HISTORY <span>01</span></div>
                  <h2 id="body-report-trends-title">Patterns, over time.</h2>
                  <div className="vl-body-report-autonomic-cards">
                    <article className="vl-body-report-autonomic-card">
                      <span>7-DAY AUTONOMIC BALANCE</span>
                      <strong>Not available</strong>
                      <p>Sympathetic and parasympathetic balance is not calculated from the measurements returned here.</p>
                      <div className="vl-body-report-autonomic-empty">Take a few measurements to build a history; balance estimates remain unavailable.</div>
                    </article>
                    <article className="vl-body-report-autonomic-card">
                      <span>COHERENCE</span>
                      <strong>Not calculated</strong>
                      <p>No coherence value was returned. VitalLens does not estimate one from pulse intervals alone.</p>
                    </article>
                  </div>
                  {trendKeys.length > 0 ? (
                    <>
                      <label className="vl-body-report-trend-select-label" htmlFor="body-report-trend-select">Choose a measured value</label>
                      <select
                        id="body-report-trend-select"
                        value={selectedTrendKey}
                        onChange={(event) => setSelectedTrend(event.target.value)}
                      >
                        {trendKeys.map((key) => (
                          <option value={key} key={key}>{metricLabel(key)}{metricUnit(key, report) ? ` · ${metricUnit(key, report)}` : ''}</option>
                        ))}
                      </select>
                      {trendEntries.length ? (
                        <ol className="vl-body-report-history-list">
                          {trendEntries.map(({ item, value }) => (
                            <li key={item.id}>
                              <span className="vl-body-report-history-mark" aria-hidden="true" />
                              <span className="vl-body-report-history-date">{formatDate(item.completedAt)}</span>
                              <strong>{formatNumber(value)} <small>{metricUnit(selectedTrendKey, report)}</small></strong>
                              <span className="vl-body-report-history-source">{sourceNames[item.source]}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="vl-body-report-history-empty">No history for this value yet.</p>
                      )}
                    </>
                  ) : (
                    <div className="vl-body-report-trend-empty">
                      <span className="vl-body-report-trend-empty-mark" aria-hidden="true" />
                      <p>No trend yet. Complete another measurement to build your history.</p>
                    </div>
                  )}
                  <p className="vl-body-report-trend-note">History shows only measurements saved to your record. No values are interpolated.</p>
                </section>
              )}
            </div>
          </>
        )}

        <section className="vl-body-report-manual" aria-labelledby="body-report-manual-title">
          <div className="vl-body-report-manual-intro">
            <div className="vl-body-report-section-label">YOUR RECORD <span>03</span></div>
            <h2 id="body-report-manual-title">Add a detail, if you like.</h2>
                    <p>When you open this report, its measured values are added to your private history for this browser. Age, sex and manual values are saved only when you press Save.</p>
          </div>
          <form className="vl-body-report-form" onSubmit={saveManualEntry} aria-busy={isSaving || status === 'loading'}>
            <div className="vl-body-report-profile-fields">
              <div className="vl-body-report-field">
                <label htmlFor={ageId}>Age <span>optional</span></label>
                <input
                  id={ageId}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="120"
                  value={age}
                  onChange={(event) => { setAge(event.target.value); setSaveComplete(false); }}
                  placeholder="Add age"
                />
              </div>
              <div className="vl-body-report-field">
                <label htmlFor={sexId}>Sex <span>optional</span></label>
                <select id={sexId} value={sex} onChange={(event) => { setSex(event.target.value); setSaveComplete(false); }}>
                  <option value="">Not set</option>
                  {!['female', 'male', 'intersex', 'prefer_not_to_say'].includes(sex) && sex && (
                    <option value={sex}>{sex}</option>
                  )}
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="intersex">Intersex</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>
            <div className="vl-body-report-manual-metrics">
              <p>Manual measurements <span>optional</span></p>
              <div className="vl-body-report-manual-metric-grid">
                {manualMetricKeys.map((key) => (
                  <div className="vl-body-report-field" key={key}>
                    <label htmlFor={`body-report-manual-${key}`}>{BODY_REPORT_METRIC_DETAILS[key].label}<span>{BODY_REPORT_METRIC_DETAILS[key].unit}</span></label>
                    <input
                      id={`body-report-manual-${key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={manualMetrics[key] ?? ''}
                      onChange={(event) => {
                        setManualMetrics((current) => ({ ...current, [key]: event.target.value }));
                        setSaveComplete(false);
                      }}
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            </div>
            {saveError && <p className="vl-body-report-form-error" role="alert"><AlertCircle size={15} />{saveError}</p>}
            {saveComplete && <p className="vl-body-report-form-success" role="status"><Check size={15} />Your entry was saved.</p>}
            <button
              className="vl-body-report-save"
              type="submit"
              disabled={isSaving || status === 'loading' || (!profileHasInput && Object.keys(manualValues).length === 0)}
            >
              {isSaving ? 'Saving…' : 'Save to my record'} {!isSaving && <ArrowRight size={16} />}
            </button>
          </form>
        </section>

        <aside className="vl-body-report-disclaimer" role="note">
          <span className="vl-body-report-disclaimer-icon"><Info size={16} /></span>
          <div>
            <strong>Wellness exploration only</strong>
            <p>Camera-derived readings are estimates for general wellness. They are not medical measurements, diagnoses, or a substitute for professional care.</p>
          </div>
        </aside>
      </div>

      <footer className="vl-body-report-sticky-footer">
        <div>
          <span className="vl-body-report-footer-mark" aria-hidden="true">V</span>
          <span>Take what’s useful. Leave the rest.</span>
        </div>
        <button type="button" onClick={onContinue}>Continue <ArrowRight size={17} /></button>
      </footer>

      {activeExplanation && activeDetail && (
        <div className="vl-body-report-sheet-layer">
          <button className="vl-body-report-sheet-scrim" type="button" aria-label="Close explanation" onClick={() => setActiveExplanation(null)} />
          <section
            ref={sheetRef}
            className="vl-body-report-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="body-report-sheet-title"
            aria-describedby="body-report-sheet-description"
          >
            <div className="vl-body-report-sheet-handle" aria-hidden="true" />
            <div className="vl-body-report-sheet-head">
              <div className="vl-body-report-section-label">A LITTLE CONTEXT</div>
              <button ref={closeButtonRef} type="button" className="vl-body-report-sheet-close" aria-label="Close explanation" onClick={() => setActiveExplanation(null)}><X size={18} /></button>
            </div>
            <h2 id="body-report-sheet-title">{activeTitle}</h2>
            <p id="body-report-sheet-description">{activeDetail.explanation}</p>
            <div className="vl-body-report-sheet-tip">
              <Leaf size={17} />
              <div><strong>A gentle tip</strong><p>{activeDetail.tip}</p></div>
            </div>
            <button className="vl-body-report-sheet-done" type="button" onClick={() => setActiveExplanation(null)}>Got it</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default BodyReport;