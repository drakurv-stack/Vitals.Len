import type { MeasurementReportData } from '../components/measurement-report';

export type PpgModePhase = 'idle' | 'starting' | 'warming' | 'live' | 'error';

export type PpgTorchStatus = 'idle' | 'checking' | 'on' | 'unsupported' | 'unavailable';

export type PpgBreathingEvent = 'inhale' | 'exhale';

export interface PpgSample {
  elapsedSeconds: number;
  greenMean: number;
  filteredSignal: number;
}

export interface PpgBreathingMarker {
  elapsedSeconds: number;
  event: PpgBreathingEvent;
}

export interface PpgModeProps {
  videoRef: (node: HTMLVideoElement | null) => void;
  phase: PpgModePhase;
  cameraActive: boolean;
  bpm: number | null;
  signalQuality: number | null;
  torchStatus: PpgTorchStatus;
  elapsedSeconds: number;
  errorMessage: string | null;
  samples: readonly PpgSample[];
  sampleCount: number;
  markers: readonly PpgBreathingMarker[];
  report: MeasurementReportData | null;
  onStart: () => void;
  onStop: () => void;
  onCloseReport: () => void;
  onMarkBreathing: (event: PpgBreathingEvent) => void;
  onExportCsv: () => void;
}