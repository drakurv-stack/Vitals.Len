import type {
  MeasurementReportData,
  MeasurementReportMetric,
} from '../components/measurement-report';

export type MeasurementMetricKey =
  | 'heartRate'
  | 'respiratoryRate'
  | 'hrvSdnn'
  | 'hrvRmssd'
  | 'hrvPnn50'
  | 'meanPulseInterval';

export interface MeasurementMetricValue {
  value: number | null;
  confidence: number | null;
  unit?: string;
}

export interface MeasurementReportReading {
  elapsedSeconds: number;
  signalQualityPercent?: number | null;
  heartRate: MeasurementMetricValue | null;
  respiratoryRate: MeasurementMetricValue | null;
  hrvSdnn: MeasurementMetricValue | null;
  hrvRmssd: MeasurementMetricValue | null;
  hrvPnn50?: MeasurementMetricValue | null;
  meanPulseInterval?: MeasurementMetricValue | null;
}

interface CreateMeasurementReportOptions {
  source: MeasurementReportData['source'];
  completedAt?: string;
  durationSeconds: number;
  sampleCount: number;
  readings: readonly MeasurementReportReading[];
  signalQualityPercent?: number | null;
}

const METRIC_DETAILS: Record<
  MeasurementMetricKey,
  Pick<MeasurementReportMetric, 'label' | 'unit'>
> = {
  heartRate: { label: 'Heart rate', unit: 'bpm' },
  respiratoryRate: { label: 'Respiratory rate', unit: 'breaths/min' },
  hrvSdnn: { label: 'HRV · SDNN', unit: 'ms' },
  hrvRmssd: { label: 'HRV · RMSSD', unit: 'ms' },
  hrvPnn50: { label: 'HRV · pNN50', unit: '%' },
  meanPulseInterval: { label: 'Mean pulse interval', unit: 'ms' },
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const lower = ordered[middle - 1];
  const upper = ordered[middle];
  if (ordered.length % 2 === 0 && lower !== undefined && upper !== undefined) {
    return (lower + upper) / 2;
  }
  return upper ?? null;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toPercent(value: number): number {
  const percent = value <= 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, percent)));
}

function formatValue(value: number, unit: string): string {
  const precision = unit === 'bpm' ? 0 : 1;
  return `${value.toFixed(precision)} ${unit}`;
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return minutes > 0 ? `${minutes} min ${remainder} sec` : `${remainder} sec`;
}

function createSummary(
  source: MeasurementReportData['source'],
  durationSeconds: number,
  metrics: readonly MeasurementReportMetric[],
): string {
  const heartRate = metrics.find((metric) => metric.key === 'heartRate');
  const duration = formatDuration(durationSeconds);
  const details: string[] = [];

  if (!heartRate?.value || heartRate.readingCount === 0) {
    const inputName = source === 'fingertip' ? 'fingertip camera signal' : 'face-camera session';
    details.push(
      `The ${inputName} did not produce a reliable heart-rate estimate in ${duration}.`,
    );
  } else {
    details.push(
      `Across ${heartRate.readingCount} valid heart-rate estimate${heartRate.readingCount === 1 ? '' : 's'} in ${duration}, the median was ${formatValue(heartRate.value, heartRate.unit)}.`,
    );
    if (heartRate.min !== null && heartRate.max !== null) {
      details.push(
        `The observed range was ${formatValue(heartRate.min, heartRate.unit)} to ${formatValue(heartRate.max, heartRate.unit)}.`,
      );
    }
  }

  for (const key of [
    'respiratoryRate',
    'hrvSdnn',
    'hrvRmssd',
    'hrvPnn50',
    'meanPulseInterval',
  ] as const) {
    const metric = metrics.find((item) => item.key === key);
    if (metric?.value !== null && metric?.value !== undefined) {
      details.push(
        `${metric.label} median: ${formatValue(metric.value, metric.unit)}.`,
      );
    }
  }

  return `${details.join(' ')} Only measured values are included in this report.`;
}

function downsampleTrend(
  points: readonly { elapsedSeconds: number; value: number }[],
  limit = 80,
): Array<{ elapsedSeconds: number; value: number }> {
  if (points.length <= limit) return [...points];
  const stride = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => {
    const point = points[Math.round(index * stride)];
    return point ?? points[points.length - 1]!;
  });
}

export function createMeasurementReport({
  source,
  completedAt = new Date().toISOString(),
  durationSeconds,
  sampleCount,
  readings,
  signalQualityPercent,
}: CreateMeasurementReportOptions): MeasurementReportData {
  const keys: MeasurementMetricKey[] =
    source === 'fingertip'
      ? ['heartRate', 'hrvSdnn', 'hrvRmssd', 'hrvPnn50', 'meanPulseInterval']
      : ['heartRate', 'respiratoryRate', 'hrvSdnn', 'hrvRmssd'];

  const metrics = keys
    .map((key): MeasurementReportMetric | null => {
      const samples = readings.flatMap((reading) => {
        const metric = reading[key];
        if (
          !metric ||
          metric.value === null ||
          !Number.isFinite(metric.value) ||
          metric.value < 0 ||
          (metric.value === 0 &&
            key !== 'hrvSdnn' &&
            key !== 'hrvRmssd' &&
            key !== 'hrvPnn50')
        ) {
          return [];
        }
        return [{
          value: metric.value,
          confidence: metric.confidence,
          unit: metric.unit,
        }];
      });
      if (samples.length === 0) {
        return source === 'fingertip'
          ? {
              key,
              ...METRIC_DETAILS[key],
              value: null,
              confidencePercent: null,
              min: null,
              max: null,
              readingCount: 0,
            }
          : null;
      }

      const values = samples.map((sample) => sample.value);
      const confidences = samples.flatMap((sample) =>
        sample.confidence !== null && Number.isFinite(sample.confidence)
          ? [toPercent(sample.confidence)]
          : [],
      );
      return {
        key,
        label: METRIC_DETAILS[key].label,
        unit: samples.find((sample) => sample.unit?.trim())?.unit ?? METRIC_DETAILS[key].unit,
        value: median(values),
        confidencePercent: mean(confidences),
        min: Math.min(...values),
        max: Math.max(...values),
        readingCount: samples.length,
      };
    })
    .filter((metric): metric is MeasurementReportMetric => metric !== null);

  const heartRateTrend = downsampleTrend(
    readings.flatMap((reading) => {
      const heartRate = reading.heartRate;
      return heartRate?.value !== null &&
        heartRate?.value !== undefined &&
        Number.isFinite(heartRate.value) &&
        heartRate.value > 0
        ? [{ elapsedSeconds: reading.elapsedSeconds, value: heartRate.value }]
        : [];
    }),
  );

  const allConfidences = readings.flatMap((reading) =>
    keys.flatMap((key) => {
      const confidence = reading[key]?.confidence;
      return confidence !== null && confidence !== undefined && Number.isFinite(confidence)
        ? [toPercent(confidence)]
        : [];
    }),
  );
  const computedQuality = mean(allConfidences);
  const quality =
    signalQualityPercent !== null && signalQualityPercent !== undefined
      ? Math.round(Math.max(0, Math.min(100, signalQualityPercent)))
      : computedQuality === null
        ? null
        : Math.round(computedQuality);

  return {
    source,
    completedAt,
    durationSeconds: Math.max(0, durationSeconds),
    sampleCount: Math.max(0, Math.round(sampleCount)),
    summary: createSummary(source, durationSeconds, metrics),
    signalQualityPercent: quality,
    metrics,
    heartRateTrend,
  };
}
