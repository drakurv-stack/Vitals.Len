import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  BodyReportHistoryEntrySchema,
  BodyReportHistoryResponseSchema,
  CreateBodyReportSchema,
} from "@workspace/api-zod";

const router: IRouter = Router();
const COOKIE_NAME = "vl_body_report_owner";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function signature(ownerId: string, secret: string): string {
  return createHmac("sha256", secret).update(ownerId).digest("base64url");
}

function cookieValue(req: Request): string | null {
  const cookieHeader = req.get("cookie");
  if (!cookieHeader) return null;
  const pair = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

function setOwnerCookie(res: Response, req: Request, value: string): void {
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = req.secure || forwardedProtocol === "https" || process.env.NODE_ENV === "production";
  const flags = [
    `Path=/api/report`,
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(secure ? ["Secure"] : []),
  ];
  res.append("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(value)}; ${flags.join("; ")}`);
}

function getOwnerId(req: Request, res: Response): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const stored = cookieValue(req);
  const separator = stored?.lastIndexOf(".");
  if (stored && separator > 0) {
    const ownerId = stored.slice(0, separator);
    const receivedSignature = stored.slice(separator + 1);
    if (/^[0-9a-f-]{36}$/i.test(ownerId)) {
      const expectedSignature = signature(ownerId, secret);
      const received = Buffer.from(receivedSignature);
      const expected = Buffer.from(expectedSignature);
      if (received.length === expected.length && timingSafeEqual(received, expected)) {
        return ownerId;
      }
    }
  }

  const ownerId = randomUUID();
  setOwnerCookie(req, res, `${ownerId}.${signature(ownerId, secret)}`);
  return ownerId;
}

function sameSiteRequest(req: Request): boolean {
  const fetchSite = req.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site";
}

function toHistoryEntry(row: {
  id: string;
  source: "fingertip" | "vitallens" | "manual";
  completedAt: Date;
  age: number | null;
  sex: string | null;
  sessionReport: Record<string, unknown> | null;
  manualMetrics: Record<string, number>;
}) {
  return {
    id: row.id,
    source: row.source,
    completedAt: row.completedAt.toISOString(),
    profile: {
      age: row.age,
      sex: row.sex as "female" | "male" | "intersex" | "prefer_not_to_say" | null,
    },
    sessionReport: row.sessionReport,
    manualMetrics: row.manualMetrics,
  };
}

function unavailable(res: Response): void {
  res.status(503).json({ error: "Private report storage is not configured." });
}

router.post("/report", async (req, res): Promise<void> => {
  if (!sameSiteRequest(req)) {
    res.status(403).json({ error: "Report requests must come from this site." });
    return;
  }

  const ownerId = getOwnerId(req, res);
  if (!ownerId || !process.env.DATABASE_URL) {
    unavailable(res);
    return;
  }

  const parsed = CreateBodyReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The report data is invalid." });
    return;
  }

  try {
    const { db, bodyReportsTable } = await import("@workspace/db");
    const [row] = await db.insert(bodyReportsTable).values({
      ownerId,
      source: parsed.data.source,
      completedAt: new Date(parsed.data.completedAt),
      age: parsed.data.profile.age,
      sex: parsed.data.profile.sex,
      sessionReport: parsed.data.sessionReport,
      manualMetrics: parsed.data.manualMetrics,
    }).returning();

    if (!row) {
      req.log.error("Report insert returned no row.");
      res.status(500).json({ error: "The report could not be saved." });
      return;
    }
    res.status(201).json(BodyReportHistoryEntrySchema.parse(toHistoryEntry(row)));
  } catch (error) {
    req.log.error({ err: error }, "Could not save private report.");
    unavailable(res);
  }
});

router.get("/report/history", async (req, res): Promise<void> => {
  const ownerId = getOwnerId(req, res);
  if (!ownerId || !process.env.DATABASE_URL) {
    unavailable(res);
    return;
  }

  try {
    const { db, bodyReportsTable } = await import("@workspace/db");
    const rows = await db.select().from(bodyReportsTable)
      .where(eq(bodyReportsTable.ownerId, ownerId))
      .orderBy(desc(bodyReportsTable.completedAt))
      .limit(50);
    const items = rows.map(toHistoryEntry);
    const latestProfile = items[0]?.profile ?? { age: null, sex: null };
    const response = BodyReportHistoryResponseSchema.parse({
      items,
      profile: latestProfile,
    });
    res.json(response);
  } catch (error) {
    req.log.error({ err: error }, "Could not load private report history.");
    unavailable(res);
  }
});

export default router;