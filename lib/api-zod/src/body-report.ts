import { z } from "zod/v4";

const nullableFinite = z.number().finite().nullable();

export const BodyReportMetricSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  value: nullableFinite,
  unit: z.string().max(40),
  confidencePercent: nullableFinite,
  min: nullableFinite,
  max: nullableFinite,
  readingCount: z.number().int().nonnegative(),
});

export const BodyReportSessionSchema = z.object({
  source: z.enum(["fingertip", "vitallens"]),
  completedAt: z.string().datetime(),
  durationSeconds: z.number().finite().nonnegative(),
  sampleCount: z.number().int().nonnegative(),
  summary: z.string().max(2000),
  signalQualityPercent: nullableFinite,
  metrics: z.array(BodyReportMetricSchema).max(40),
  heartRateTrend: z.array(z.object({
    elapsedSeconds: z.number().finite().nonnegative(),
    value: z.number().finite().nonnegative(),
  })).max(500),
});

export const BodyReportProfileSchema = z.object({
  age: z.number().int().min(0).max(120).nullable(),
  sex: z.enum(["female", "male", "intersex", "prefer_not_to_say"]).nullable(),
});

const BodyReportMetricsSchema = z.record(
  z.string().min(1).max(80),
  z.number().finite().nonnegative(),
).refine((metrics) => Object.keys(metrics).length <= 24, {
  message: "At most 24 manual metrics can be saved.",
});

export const CreateBodyReportSchema = z.object({
  source: z.enum(["fingertip", "vitallens", "manual"]),
  completedAt: z.string().datetime(),
  profile: BodyReportProfileSchema,
  sessionReport: BodyReportSessionSchema.nullable(),
  manualMetrics: BodyReportMetricsSchema,
}).refine((data) => (
  data.source === "manual"
    ? data.sessionReport === null
      && (Object.keys(data.manualMetrics).length > 0
        || data.profile.age !== null
        || data.profile.sex !== null)
    : data.sessionReport?.source === data.source
      && data.sessionReport.completedAt === data.completedAt
      && Object.keys(data.manualMetrics).length === 0
), {
  message: "The report source, session data, and manual metrics must agree.",
});

export const BodyReportHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["fingertip", "vitallens", "manual"]),
  completedAt: z.string().datetime(),
  profile: BodyReportProfileSchema,
  sessionReport: BodyReportSessionSchema.nullable(),
  manualMetrics: BodyReportMetricsSchema,
});

export const BodyReportHistoryResponseSchema = z.object({
  items: z.array(BodyReportHistoryEntrySchema),
  profile: BodyReportProfileSchema,
});

export type CreateBodyReport = z.infer<typeof CreateBodyReportSchema>;
export type BodyReportHistoryEntry = z.infer<typeof BodyReportHistoryEntrySchema>;
export type BodyReportHistoryResponse = z.infer<typeof BodyReportHistoryResponseSchema>;