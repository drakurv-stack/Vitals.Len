import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetLiveDemoStatusResponse,
  PushLiveFrameBody,
  PushLiveFrameParams,
  PushLiveFrameResponse,
  StartLiveSessionResponse,
  StopLiveSessionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MAX_ACTIVE_SESSIONS = 1;
const MAX_SESSION_AGE_MS = 3 * 60 * 1000;
const IDLE_SESSION_AGE_MS = 30 * 1000;
const FRAME_REPLY_TIMEOUT_MS = 12 * 1000;
const SESSION_START_TIMEOUT_MS = 60 * 1000;

type LiveInferenceUpdate = ReturnType<typeof PushLiveFrameResponse.parse>;

interface PendingFrame {
  resolve: (update: LiveInferenceUpdate) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface LiveWorker {
  id: string;
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  readySettled: boolean;
  buffer: string;
  pending: Map<string, PendingFrame>;
  latestUpdate: LiveInferenceUpdate;
  lastActiveAt: number;
  startedAt: number;
}

const emptyUpdate: LiveInferenceUpdate = PushLiveFrameResponse.parse({
  faceDetected: false,
  heartRate: null,
  respiratoryRate: null,
  hrvSdnn: null,
  hrvRmssd: null,
});

const sessions = new Map<string, LiveWorker>();

function findWorkspaceRoot(): string | null {
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(current, "vitallens-python", "web", "live_worker.py"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function frameRequestAllowed(req: Request, res: Response): boolean {
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    res.status(403).json({ error: "Live demo requests must come from this site." });
    return false;
  }
  return true;
}

function rejectPending(worker: LiveWorker, error: Error): void {
  for (const pending of worker.pending.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  worker.pending.clear();
}

function removeSession(worker: LiveWorker): void {
  sessions.delete(worker.id);
  rejectPending(worker, new Error("The live stream has ended."));
  if (!worker.child.killed) {
    worker.child.stdin.end(`${JSON.stringify({ type: "close" })}\n`);
    const killTimer = setTimeout(() => worker.child.kill("SIGKILL"), 2_000);
    killTimer.unref();
  }
}

function handleWorkerMessage(worker: LiveWorker, line: string): void {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return;
  }

  if (message.type === "ready") {
    if (!worker.readySettled) {
      worker.readySettled = true;
      worker.resolveReady();
    }
    return;
  }

  if (message.type === "result" && message.update) {
    const parsed = PushLiveFrameResponse.safeParse(message.update);
    if (parsed.success) worker.latestUpdate = parsed.data;
    return;
  }

  if (message.type === "frame" && typeof message.requestId === "string") {
    const pending = worker.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    worker.pending.delete(message.requestId);
    const parsed = PushLiveFrameResponse.safeParse(message.update);
    if (parsed.success) {
      worker.latestUpdate = parsed.data;
      pending.resolve(parsed.data);
    } else {
      pending.reject(new Error("VitalLens returned an invalid update."));
    }
    return;
  }

  if (
    (message.type === "frame-error" || message.type === "error") &&
    typeof message.error === "string"
  ) {
    if (message.type === "error" && !worker.readySettled) {
      worker.readySettled = true;
      worker.rejectReady(new Error(message.error));
    }
    if (typeof message.requestId === "string") {
      const pending = worker.pending.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        worker.pending.delete(message.requestId);
        pending.reject(new Error(message.error));
      }
    }
  }
}

function createWorker(id: string, root: string): LiveWorker {
  const workerPath = resolve(root, "vitallens-python", "web", "live_worker.py");
  const pythonPath = process.env.VITALLENS_PYTHON ?? resolve(root, ".pythonlibs", "bin", "python");
  if (!existsSync(pythonPath)) {
    throw new Error("The Python environment is not installed.");
  }

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const child = spawn(pythonPath, ["-u", workerPath], {
    cwd: resolve(root, "vitallens-python"),
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const worker: LiveWorker = {
    id,
    child,
    ready,
    resolveReady,
    rejectReady,
    readySettled: false,
    buffer: "",
    pending: new Map(),
    latestUpdate: emptyUpdate,
    lastActiveAt: Date.now(),
    startedAt: Date.now(),
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    worker.buffer += chunk;
    let newline = worker.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = worker.buffer.slice(0, newline);
      worker.buffer = worker.buffer.slice(newline + 1);
      handleWorkerMessage(worker, line);
      newline = worker.buffer.indexOf("\n");
    }
    if (worker.buffer.length > 200_000) worker.buffer = "";
  });
  child.stderr.on("data", () => {
    // Do not echo third-party SDK diagnostics, which may contain request details.
  });
  child.on("error", () => {
    const error = new Error("The live inference worker could not start.");
    if (!worker.readySettled) {
      worker.readySettled = true;
      worker.rejectReady(error);
    }
    rejectPending(worker, error);
  });
  child.on("exit", () => {
    if (!worker.readySettled) {
      worker.readySettled = true;
      worker.rejectReady(new Error("The live inference worker stopped during startup."));
    }
    rejectPending(worker, new Error("The live inference worker stopped."));
    sessions.delete(worker.id);
  });
  return worker;
}

async function requestFrame(
  worker: LiveWorker,
  jpegBase64: string,
  timestamp: number,
): Promise<LiveInferenceUpdate> {
  await worker.ready;
  if (worker.pending.size >= 2) {
    throw new Error("The live stream is catching up; try sending frames more slowly.");
  }
  const requestId = randomUUID();
  worker.lastActiveAt = Date.now();
  return new Promise<LiveInferenceUpdate>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      worker.pending.delete(requestId);
      rejectPromise(new Error("VitalLens took too long to process this frame."));
    }, FRAME_REPLY_TIMEOUT_MS);
    timeout.unref();
    worker.pending.set(requestId, {
      resolve: resolvePromise,
      reject: rejectPromise,
      timeout,
    });
    worker.child.stdin.write(
      `${JSON.stringify({ type: "frame", requestId, jpegBase64, timestamp })}\n`,
      (error) => {
        if (!error) return;
        const pending = worker.pending.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          worker.pending.delete(requestId);
          pending.reject(new Error("The frame could not be sent to VitalLens."));
        }
      },
    );
  });
}

router.get("/live/status", (_req, res): void => {
  const root = findWorkspaceRoot();
  const pythonPath = root
    ? process.env.VITALLENS_PYTHON ?? resolve(root, ".pythonlibs", "bin", "python")
    : null;
  const hasApiKey = Boolean(process.env.VITALLENS_API_KEY);
  const pythonAvailable = Boolean(root && pythonPath && existsSync(pythonPath));
  const response = {
    apiReady: hasApiKey && pythonAvailable,
    message: !hasApiKey
      ? "Add VITALLENS_API_KEY to Replit Secrets to enable live analysis."
      : !pythonAvailable
        ? "The Python environment is not ready for live analysis."
        : "Live analysis is ready.",
  };
  res.json(GetLiveDemoStatusResponse.parse(response));
});

router.post("/live/sessions", async (req, res): Promise<void> => {
  if (!frameRequestAllowed(req, res)) return;
  if (!process.env.VITALLENS_API_KEY) {
    res.status(503).json({ error: "Add VITALLENS_API_KEY to Replit Secrets to enable live analysis." });
    return;
  }
  if (sessions.size >= MAX_ACTIVE_SESSIONS) {
    res.status(429).json({ error: "A live demo is already running. Stop it before starting another." });
    return;
  }

  const root = findWorkspaceRoot();
  if (!root) {
    res.status(503).json({ error: "The VitalLens Python package could not be found." });
    return;
  }

  const sessionId = randomUUID();
  let worker: LiveWorker;
  try {
    worker = createWorker(sessionId, root);
  } catch {
    res.status(503).json({ error: "The Python environment is not installed." });
    return;
  }
  sessions.set(sessionId, worker);

  const readyTimeout = setTimeout(() => {
    if (!worker.readySettled) {
      worker.readySettled = true;
      worker.rejectReady(new Error("The live worker did not become ready in time."));
    }
  }, SESSION_START_TIMEOUT_MS);
  readyTimeout.unref();
  try {
    await worker.ready;
    res.status(201).json(StartLiveSessionResponse.parse({ sessionId }));
  } catch (error) {
    removeSession(worker);
    req.log.warn({ error: error instanceof Error ? error.message : "unknown" }, "Live session startup failed");
    res.status(503).json({
      error: error instanceof Error ? error.message : "The live session could not start.",
    });
  } finally {
    clearTimeout(readyTimeout);
  }
});

router.post("/live/sessions/:sessionId/frames", async (req, res): Promise<void> => {
  if (!frameRequestAllowed(req, res)) return;
  const params = PushLiveFrameParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid live session." });
    return;
  }
  const body = PushLiveFrameBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Camera frames must be valid base64 JPEG images." });
    return;
  }
  const worker = sessions.get(params.data.sessionId);
  if (!worker) {
    res.status(404).json({ error: "Live session not found. Start the camera demo again." });
    return;
  }
  if (Date.now() - worker.startedAt > MAX_SESSION_AGE_MS) {
    removeSession(worker);
    res.status(410).json({ error: "This live demo reached its time limit. Start it again to continue." });
    return;
  }

  try {
    const update = await requestFrame(worker, body.data.jpegBase64, body.data.timestamp);
    res.json(PushLiveFrameResponse.parse(update));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The camera frame could not be processed.";
    res.status(message.includes("catching up") ? 429 : 503).json({ error: message });
  }
});

router.delete("/live/sessions/:sessionId", (req, res): void => {
  if (!frameRequestAllowed(req, res)) return;
  const params = StopLiveSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid live session." });
    return;
  }
  const worker = sessions.get(params.data.sessionId);
  if (!worker) {
    res.sendStatus(204);
    return;
  }
  removeSession(worker);
  res.sendStatus(204);
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const worker of sessions.values()) {
    if (
      now - worker.lastActiveAt > IDLE_SESSION_AGE_MS ||
      now - worker.startedAt > MAX_SESSION_AGE_MS
    ) {
      removeSession(worker);
    }
  }
}, 10_000);
cleanupTimer.unref();

export default router;