import express, { type Response, type NextFunction } from "express";
import type { Request } from "express";
import { registerRoutes } from "./routes.js";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Build the Express app with JSON parsing, request logging, the API routes,
 * and the error handler. This is shared by BOTH the local dev server
 * (server/index.ts) and the Vercel serverless wrapper (api/index.ts).
 *
 * It deliberately does NOT include the Vite dev middleware or any static
 * file serving — those are concerns of the local dev/prod server only.
 * It also has NO database dependency (no better-sqlite3).
 */
export function createApp() {
  const app = express();

  app.use(
    express.json({
      limit: "5mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          // Avoid logging the (large) base64 payload.
          const { fileBase64, ...rest } = capturedJsonResponse as any;
          const summary = fileBase64 ? { ...rest, fileBase64: `[${fileBase64.length} chars]` } : capturedJsonResponse;
          logLine += ` :: ${JSON.stringify(summary)}`;
        }
        log(logLine);
      }
    });

    next();
  });

  registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });

  return app;
}
