import { createApp } from "../server/app.js";

// Vercel serverless entry. vercel.json rewrites `/api/(.*)` here, so the
// Express app sees the full `/api/...` path and matches its routes directly.
//
// An Express application instance IS a `(req, res)` request handler, so we can
// export it directly as the Vercel Node function handler — no serverless-http
// wrapper needed. Vercel's Node launcher invokes `app(req, res)` and Express
// ends the response itself, which avoids the hang that occurs when a wrapper
// both writes to `res` and resolves a promise back to the launcher.
//
// This is the SAME Express app used in local dev (server/app.ts), minus the
// Vite middleware and static serving. No better-sqlite3 / database in this
// path: settings are client-session only and the workbook is returned inline
// as base64.
const app = createApp();

export default app;
