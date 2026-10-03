import type { MeasurementReportData } from '@/components/measurement-report';

export type BodyReportSource = 'fingertip' | 'vitallens' | 'manual';
export type BodyReportProfile = {
  age: number | null;
  sex: string | null;
};

export type BodyReportHistoryRecord = {
  id: string;
  source: BodyReportSource;
  completedAt: string;
  profile: BodyReportProfile;
  sessionReport: MeasurementReportData | null;
  manualMetrics: Record<string, number>;
};

export type BodyReportSaveInput = {
  source: BodyReportSource;
  completedAt: string;
  profile: BodyReportProfile;
  sessionReport: MeasurementReportData | null;
  manualMetrics: Record<string, number>;
};

export type BodyReportHistoryResponse = {
  items: BodyReportHistoryRecord[];
  profile: BodyReportProfile;
};

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Body report request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function getBodyReportHistory(): Promise<BodyReportHistoryResponse> {
  return requestJson<BodyReportHistoryResponse>('/report/history');
}

export function saveBodyReport(input: BodyReportSaveInput): Promise<BodyReportHistoryRecord> {
  return requestJson<BodyReportHistoryRecord>('/report', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function toBodyReportHistoryMetrics(
  entry: BodyReportHistoryRecord,
): Record<string, number | null> {
  if (!entry.sessionReport) return entry.manualMetrics;
  return Object.fromEntries(
    entry.sessionReport.metrics.map((metric) => [metric.key, metric.value]),
  );
}