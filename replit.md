# VitalLens Live

A browser camera demo for the imported VitalLens Python library. It sends compressed still frames to the server only during a user-started session and displays live vital-sign estimates returned by the VitalLens API.

## Run & Operate

- Start the `artifacts/vitallens-live: web` workflow for the camera demo.
- Start the `artifacts/api-server: API Server` workflow for the live inference endpoints.
- `uv sync --python 3.13` — install the Python runtime dependencies used by the VitalLens worker.
- `pnpm run typecheck` — typecheck workspace libraries and artifacts.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec.
- Required Replit Secret: `VITALLENS_API_KEY` — a VitalLens API key. Keep it in Replit Secrets; do not place it in source code.

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Web: React + Vite
- Inference API: Express 5 with a transient Python worker
- VitalLens: Python 3.13
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/vitallens-live` — browser camera demo
- `artifacts/api-server/src/routes/live-demo.ts` — live inference API and worker lifecycle
- `vitallens-python/web/live_worker.py` — persistent Python stream worker
- `lib/api-spec/openapi.yaml` — API contract

## Architecture decisions

- Camera frames are sent only while the user has started a session; the app does not save the video.
- The VitalLens API key stays server-side.
- Live sessions are transient and limited to one active stream at a time.

## Product

The live demo displays camera status, face detection, calibration, heart rate, respiratory rate, and available HRV estimates.

## User preferences

The estimates are for wellness exploration only and must not be presented as medical advice or diagnosis.

## Gotchas

- Run the API server and web artifact workflows together.
- The browser must grant camera access; use the secure Replit preview URL.
- Use the Python 3.13 environment for the VitalLens worker.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
