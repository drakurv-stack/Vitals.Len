import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const bodyReportsTable = pgTable(
  "body_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").notNull(),
    source: text("source", { enum: ["fingertip", "vitallens", "manual"] }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    age: integer("age"),
    sex: text("sex"),
    sessionReport: jsonb("session_report").$type<Record<string, unknown> | null>(),
    manualMetrics: jsonb("manual_metrics")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("body_reports_owner_completed_idx").on(
      table.ownerId,
      table.completedAt,
    ),
  ],
);

export const insertBodyReportSchema = createInsertSchema(bodyReportsTable)
  .omit({ id: true, createdAt: true });
export type InsertBodyReport = z.infer<typeof insertBodyReportSchema>;
export type BodyReport = typeof bodyReportsTable.$inferSelect;