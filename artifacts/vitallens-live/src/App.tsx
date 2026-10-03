import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Activity, Aperture, ArrowUpRight, Check, ChevronRight, CircleAlert, CircleHelp, Clock3, Eye, EyeOff, Fingerprint, HeartPulse, Info, LoaderCircle, LockKeyhole, Radio, RefreshCw, ShieldCheck, Square, Video, Wifi } from 'lucide-react';
import { useGetLiveDemoStatus, usePushLiveFrame, useStartLiveSession, useStopLiveSession } from '@workspace/api-client-react';
import type { LiveInferenceUpdate } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { FingertipPpgMode } from '@/components/fingertip-ppg-mode';
import { StressCheck } from '@/components/stress-check';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useFingertipPpg } from '@/hooks/use-fingertip-ppg';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
type Phase = 'idle' | 'camera' | 'starting' | 'no-face' | 'calibrating' | 'live' | 'stopping' | 'denied' | 'error';

function Metric({ label, symbol, metric, precision = 0, emptyLabel = 'WAITING' }: {
  label: string;
  symbol: string;
  metric: LiveInferenceUpdate[keyof Pick<LiveInferenceUpdate, 'heartRate' | 'respiratoryRate' | 'hrvSdnn' | 'hrvRmssd'>];
  precision?: number;
  emptyLabel?: string;
}) {
  const isAvailable = Boolean(metric);
  const confidence = metric ? (metric.confidence <= 1 ? metric.confidence * 100 : metric.confidence) : 0;
  return (
    <article className={`metric-card ${isAvailable ? 'metric-active' : ''}`} data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="metric-top">
        <span className="metric-symbol">{symbol}</span>
        {isAvailable ? <span className="metric-confidence"><span />{Math.round(confidence)}% signal</span> : <span className="metric-awaiting">{emptyLabel}</span>}
      </div>
      <div className="metric-value">
        {metric ? metric.value.toFixed(precision) : <span className="metric-dash">—</span>}
        {metric && <small>{metric.unit}</small>}
      </div>
      <div className="metric-label">{label}</div>
    </article>
  );
}

function SignalTrace({ active }: { active: boolean }) {
  return (
    <div className={`signal-trace ${active ? 'trace-active' : ''}`} aria-hidden="true">
      <div className="trace-caption"><span>LIVE SIGNAL</span><span>PPG / RGB</span></div>
      <svg viewBox="0 0 480 56" preserveAspectRatio="none">
        <path className="trace-grid" d="M0 28H480M0 8H480M0 48H480" />
        <path className="trace-path" d="M0 30 C12 30 13 28 19 30 S31 33 38 29 S48 23 55 30 S67 34 76 30 S88 28 95 30 S108 31 114 30 S120 28 125 30 L132 30 L138 21 L144 40 L151 9 L158 48 L165 28 L172 30 C184 30 189 27 197 30 S210 34 218 29 S232 25 240 30 S252 32 260 29 S275 27 282 30 S296 34 304 29 S318 24 326 30 S339 31 348 30 S360 27 368 30 L376 30 L382 22 L388 39 L395 10 L402 47 L408 29 L418 30 C429 30 435 27 443 30 S456 33 464 29 S474 28 480 30" />
      </svg>
      <div className="trace-foot"><span>FRAME WINDOW</span><span>{active ? 'ACQUIRING' : 'NO STREAM'}</span></div>
    </div>
  );
}

function AppHome() {
  const statusQuery = useGetLiveDemoStatus();
  const startSession = useStartLiveSession();
  const pushFrame = usePushLiveFrame();
  const stopSession = useStopLiveSession();
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [inference, setInference] = useState<LiveInferenceUpdate | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const frameBusyRef = useRef(false);
  const pushFrameRef = useRef(pushFrame.mutateAsync);
  pushFrameRef.current = pushFrame.mutateAsync;
  const stopMutateRef = useRef(stopSession.mutate);
  stopMutateRef.current = stopSession.mutate;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const endSession = useCallback(async () => {
    const activeId = sessionIdRef.current;
    setPhase('stopping');
    stopCamera();
    sessionIdRef.current = null;
    setSessionId(null);
    if (activeId) {
      try {
        await stopSession.mutateAsync({ sessionId: activeId });
      } catch {
        setErrorText('The camera is off, but the server could not confirm session release. Try again in a moment.');
        setPhase('error');
        return;
      }
    }
    setInference(null);
    setPhase('idle');
  }, [stopCamera, stopSession]);

  useEffect(() => {
    if (!sessionId || !stream || phase === 'stopping') return;
    let cancelled = false;
    const sendFrame = async () => {
      if (cancelled || frameBusyRef.current || !videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      frameBusyRef.current = true;
      try {
        const width = 480;
        const height = Math.round((video.videoHeight / video.videoWidth) * width);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to prepare a camera frame.');
        context.drawImage(video, 0, 0, width, height);
        const jpegBase64 = canvas.toDataURL('image/jpeg', 0.56).split(',')[1];
        if (!jpegBase64 || jpegBase64.length > 150000) throw new Error('Frame could not be compressed for the live demo.');
        const result = await pushFrameRef.current({
          sessionId,
          data: { jpegBase64, timestamp: (performance.now() - startedAtRef.current) / 1000 },
        });
        if (!cancelled) {
          if (!result.faceDetected) {
            setInference(null);
            setPhase('no-face');
          } else {
            setInference(result);
            setPhase(result.heartRate || result.respiratoryRate ? 'live' : 'calibrating');
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : 'A live frame could not be analyzed.');
          setPhase('error');
          stopCamera();
          const failedSession = sessionIdRef.current;
          sessionIdRef.current = null;
          setSessionId(null);
          if (failedSession) stopMutateRef.current({ sessionId: failedSession });
        }
      } finally {
        frameBusyRef.current = false;
      }
    };
    void sendFrame();
    const timer = window.setInterval(() => void sendFrame(), 125);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, stream, phase, stopCamera]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const begin = async () => {
    setErrorText('');
    setInference(null);
    setElapsed(0);
    setPhase('camera');
    let cameraStream: MediaStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable here. Open this page in a secure browser context.');
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
      });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
      setErrorText(denied
        ? 'Camera permission was declined. Allow camera access in your browser settings, then try again.'
        : error instanceof Error ? error.message : 'The camera could not be opened.');
      setPhase(denied ? 'denied' : 'error');
      return;
    }
    streamRef.current = cameraStream;
    setStream(cameraStream);
    setPhase('starting');
    try {
      const session = await startSession.mutateAsync();
      sessionIdRef.current = session.sessionId;
      startedAtRef.current = performance.now();
      setSessionId(session.sessionId);
      setPhase('calibrating');
    } catch (error) {
      cameraStream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setErrorText(error instanceof Error ? error.message : 'VitalLens could not start a live session.');
      setPhase('error');
    }
  };

  const isRunning = Boolean(sessionId);
  const configured = statusQuery.data?.apiReady === true;
  const displayState = phase === 'camera' ? 'Requesting camera' : phase === 'starting' ? 'Opening session' :
    phase === 'no-face' ? 'Face not found' : phase === 'calibrating' ? 'Calibrating' :
      phase === 'live' ? 'Live estimates' : phase === 'stopping' ? 'Stopping stream' :
        phase === 'denied' ? 'Permission needed' : phase === 'error' ? 'Needs attention' : 'Ready when you are';
  const elapsedLabel = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const visibleInference = phase === 'no-face' || !inference?.faceDetected ? null : inference;
  const emptyMetricLabel = phase === 'no-face' ? 'NO FACE' : 'WAITING';

  return (
    <main className="page-shell grain min-h-[100dvh]">
      <header className="topbar">
        <a className="brand" href="/" aria-label="VitalLens Live home" data-testid="link-home">
          <span className="brand-mark"><Aperture size={19} strokeWidth={1.8} /></span>
          <span>vital<span>lens</span><sup>LIVE</sup></span>
        </a>
        <div className="topbar-right">
          <span className="demo-label"><span className="demo-dot" />BROWSER DEMO</span>
          <Link className="ppg-nav-link" href="/ppg" data-testid="link-fingertip-ppg">
            <Activity size={15} /> Fingertip PPG
          </Link>
          <button className="about-link" type="button" onClick={() => setShowPrivacy((value) => !value)} data-testid="button-privacy">
            <CircleHelp size={16} /> How it works
          </button>
        </div>
      </header>

      <section className="intro enter">
        <div className="eyebrow"><span className="eyebrow-rule" />THE VITALLENS LIBRARY, LIVE</div>
        <div className="intro-row">
          <h1>See your signal<span className="title-period">.</span></h1>
          <div className="intro-copy">
            <p>A small, direct test of camera-based vital estimates. No account, no saved video — just your browser, this server, and the VitalLens API.</p>
            <div className="wellness-note"><Info size={14} />For wellness exploration only. Not a medical device or diagnosis.</div>
          </div>
        </div>
        <nav className="ppg-mode-switch home-mode-switch" aria-label="Camera modes">
          <span className="ppg-mode-current" aria-current="page">Face camera <i>ACTIVE MODE</i></span>
          <Link className="ppg-mode-link" href="/ppg" data-testid="link-mode-fingertip-ppg">
            <Fingerprint size={15} /> Fingertip PPG
          </Link>
        </nav>
      </section>

      <section className="workbench enter-delay" aria-label="Live VitalLens demo">
        <div className="camera-column">
          <div className="section-kicker"><span>01</span> CAMERA WINDOW <span className="kicker-line" /><span className="mono">{isRunning ? elapsedLabel : 'STANDBY'}</span></div>
          <div className={`camera-window ${isRunning ? 'camera-on' : ''}`} data-testid="status-camera-window">
            <video ref={videoRef} className={`camera-video ${stream ? 'visible' : ''}`} muted playsInline aria-label="Your live camera preview" />
            <canvas ref={canvasRef} className="capture-canvas" />
            {!stream && <div className="camera-placeholder">
              <div className="lens-mark"><span /><span /><span /><Aperture size={34} strokeWidth={1.1} /></div>
              <div className="placeholder-title">{phase === 'denied' ? 'Camera permission needed' : phase === 'error' ? 'Stream paused' : 'Your camera stays yours'}</div>
              <p>{phase === 'denied' ? 'Allow camera access in your browser, then return here.' : phase === 'error' ? 'Resolve the issue below and start a fresh session.' : 'Preview stays in this tab. Frames are only sent while you run the test.'}</p>
              <div className="privacy-pills"><span><Eye size={13} />Local preview</span><span><LockKeyhole size={13} />No recording</span></div>
            </div>}
            {stream && <>
              <div className="camera-overlay-top"><span><span className="record-dot" /> CAMERA ACTIVE</span><span>LOCAL PREVIEW</span></div>
              <div className="viewfinder"><i /><i /><i /><i /><div className="face-guide"><span /><span /></div></div>
              {(phase === 'no-face' || phase === 'calibrating' || phase === 'starting') && (
                <div className="camera-hint">
                  {phase === 'no-face' ? <><EyeOff size={15} /> Center your face inside the guide</> : phase === 'starting' ? <><LoaderCircle size={15} className="spin" /> Connecting to VitalLens</> : <><span className="signal-pulse"><Radio size={14} /></span> Hold still while the signal settles</>}
                </div>
              )}
              <div className="camera-overlay-bottom"><span>CAMERA · FULL FRAME</span><span><span className="cam-led" /> STREAMING TO SERVER</span></div>
            </>}
            {phase === 'stopping' && <div className="camera-stopping"><LoaderCircle className="spin" size={20} /> Releasing camera session…</div>}
          </div>

          <div className="control-row">
            <div className={`connection-state ${isRunning ? 'connection-live' : configured ? 'connection-ready' : ''}`}>
              <span className="connection-indicator" />
              <span><strong data-testid="status-session">{displayState}</strong><small>{isRunning ? `SESSION ${sessionId?.slice(0, 8).toUpperCase()}` : statusQuery.isLoading ? 'CHECKING CONFIGURATION' : configured ? 'API READY' : 'AWAITING CONFIGURATION'}</small></span>
            </div>
            {!isRunning ? (
              <button className="start-button" type="button" onClick={begin} disabled={!configured || statusQuery.isLoading || phase === 'camera' || phase === 'starting' || phase === 'stopping'} data-testid="button-start-session">
                {phase === 'camera' || phase === 'starting' ? <LoaderCircle size={16} className="spin" /> : <Video size={16} />}
                {phase === 'camera' ? 'Allow camera…' : phase === 'starting' ? 'Connecting…' : 'Start live test'}
                {phase !== 'camera' && phase !== 'starting' && <ArrowUpRight size={15} />}
              </button>
            ) : (
              <button className="stop-button" type="button" onClick={() => void endSession()} disabled={phase === 'stopping'} data-testid="button-stop-session">
                <Square size={13} fill="currentColor" /> Stop session
              </button>
            )}
          </div>
          {statusQuery.isLoading && <div className="api-message skeleton-line"><span /> Checking VitalLens availability…</div>}
          {statusQuery.isError && <div className="inline-alert" role="alert"><CircleAlert size={16} /><span>We couldn’t check API readiness. Your camera won’t start until the service is available.</span><button type="button" onClick={() => void statusQuery.refetch()} data-testid="button-retry-status"><RefreshCw size={14} /> Retry</button></div>}
          {!statusQuery.isLoading && statusQuery.data && !statusQuery.data.apiReady && <div className="inline-alert" role="status"><CircleAlert size={16} /><span>{statusQuery.data.message || 'VitalLens is not configured yet. A server administrator must add the API key.'}</span><button type="button" onClick={() => void statusQuery.refetch()} data-testid="button-refresh-status"><RefreshCw size={14} /> Check again</button></div>}
          {(phase === 'denied' || phase === 'error') && errorText && <div className="inline-alert error-alert" role="alert"><CircleAlert size={16} /><span>{errorText}</span>{phase === 'denied' && <button type="button" onClick={() => void begin()} data-testid="button-retry-camera"><RefreshCw size={14} /> Try again</button>}</div>}

          <div className="transmission-note">
            <div className="transmission-icon"><ShieldCheck size={17} /></div>
            <div><strong>Before you start</strong><p>With your consent, temporary JPEG frames travel from this browser to our server and the VitalLens API for analysis. Video is not retained. The API key never leaves the server.</p></div>
            <button className="detail-toggle" type="button" aria-label="Toggle privacy details" onClick={() => setShowPrivacy((value) => !value)} data-testid="button-privacy-details"><ChevronRight size={17} /></button>
          </div>
          {showPrivacy && <div className="privacy-detail enter">
            <div><span>01</span><p><strong>You choose when.</strong> Camera access is requested only after you press Start. Stop ends the camera stream and asks the server to release the session.</p></div>
            <div><span>02</span><p><strong>Frames are transient.</strong> The browser sends compressed still frames while the session is active. No video recording is created or retained by this demo.</p></div>
            <div><span>03</span><p><strong>Credentials stay server-side.</strong> The browser talks to this application server; it never receives the VitalLens API key.</p></div>
          </div>}
        </div>

        <aside className="readout-column">
          <div className="readout-header">
            <div className="section-kicker"><span>02</span> LIVE READOUT <span className="kicker-line" /></div>
            <div className={`readout-status ${phase === 'no-face' ? 'readout-warning' : isRunning ? 'readout-on' : ''}`}><span />{phase === 'no-face' ? 'NO FACE' : phase === 'live' ? 'READING' : isRunning ? 'WARMING UP' : 'IDLE'}</div>
          </div>
          <div className="metric-grid">
            <Metric label="Heart rate" symbol="HR" metric={visibleInference?.heartRate ?? null} emptyLabel={emptyMetricLabel} />
            <Metric label="Respiratory rate" symbol="RR" metric={visibleInference?.respiratoryRate ?? null} emptyLabel={emptyMetricLabel} />
            <Metric label="HRV · SDNN" symbol="SDNN" metric={visibleInference?.hrvSdnn ?? null} precision={1} emptyLabel={emptyMetricLabel} />
            <Metric label="HRV · RMSSD" symbol="RMSSD" metric={visibleInference?.hrvRmssd ?? null} precision={1} emptyLabel={emptyMetricLabel} />
          </div>
          <div className="metric-note" role="note"><Info size={13} /><span>HRV (SDNN and RMSSD) measures beat-to-beat timing variation, needs at least 20 seconds of clean signal, and may require a VitalLens plan that supports HRV.</span></div>
          <StressCheck
            current={isRunning && phase === 'live' ? visibleInference : null}
            sessionActive={isRunning}
            noFace={phase === 'no-face'}
            sessionId={sessionId}
          />
          <SignalTrace active={isRunning && phase === 'live'} />

          <div className={`guidance-panel ${phase === 'no-face' ? 'guidance-warn' : phase === 'live' ? 'guidance-live' : ''}`}>
            <div className="guidance-icon">
              {phase === 'no-face' ? <EyeOff size={17} /> : phase === 'live' ? <Check size={17} /> : phase === 'error' ? <CircleAlert size={17} /> : <HeartPulse size={17} />}
            </div>
            <div className="guidance-copy">
              <span className="guidance-label">{phase === 'no-face' ? 'FACE NOT DETECTED' : phase === 'live' ? 'SIGNAL ACQUIRED' : phase === 'error' ? 'SESSION INTERRUPTED' : 'WHAT TO EXPECT'}</span>
              <p>{phase === 'no-face' ? 'No face is tracked, so live values are hidden. Center your face inside the guide and face a steady light source.' : phase === 'live' ? 'Pulse estimates can take several seconds to update. Hold still in steady light; vigorous movement can make camera readings unreliable.' : phase === 'error' ? 'The stream stopped safely. Check your connection and start a new session when ready.' : 'Center your whole face inside the guide, use steady lighting, and hold still for a few seconds while the signal calibrates.'}</p>
            </div>
          </div>

          <div className="pipeline">
            <div className="pipeline-title"><span>SESSION PIPELINE</span><span>{isRunning ? 'ACTIVE' : 'READY'}</span></div>
            <div className="pipeline-steps">
              <div className={`pipeline-step ${isRunning ? 'step-done' : ''}`}><span className="step-marker">{isRunning ? <Check size={11} /> : '1'}</span><span>Camera</span></div>
              <div className={`pipeline-step ${inference?.faceDetected ? 'step-done' : ''}`}><span className="step-marker">{inference?.faceDetected ? <Check size={11} /> : '2'}</span><span>Face</span></div>
              <div className={`pipeline-step ${phase === 'live' ? 'step-done' : ''}`}><span className="step-marker">{phase === 'live' ? <Check size={11} /> : '3'}</span><span>Calibrate</span></div>
              <div className={`pipeline-step ${phase === 'live' ? 'step-done' : ''}`}><span className="step-marker">{phase === 'live' ? <Check size={11} /> : '4'}</span><span>Estimate</span></div>
            </div>
          </div>
          <div className="readout-foot"><Clock3 size={13} /><span>Latest frame</span><strong>{inference ? 'just now' : '—'}</strong><span className="foot-divider" /><Wifi size={13} /><span>Confidence shown per estimate</span></div>
        </aside>
      </section>

      <footer className="page-footer">
        <span><span className="footer-mark">V</span> VitalLens <span className="footer-sep">/</span> a direct library demo</span>
        <span><span className="footer-dot" /> WELLNESS ONLY <span className="footer-sep">·</span> NOT MEDICAL ADVICE</span>
        <span>Frames are transient <span className="footer-sep">·</span> No video retained</span>
      </footer>
    </main>
  );
}

function FingertipPpgPage() {
  const ppgProps = useFingertipPpg();
  return <FingertipPpgMode {...ppgProps} />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={AppHome} />
        <Route path="/ppg" component={FingertipPpgPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;