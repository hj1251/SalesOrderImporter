import "dotenv/config";
import { createServer } from "node:http";
import { createApp, log } from "./app";
import { serveStatic } from "./static";

// Local dev / self-hosted production server. Wraps the shared Express app
// (createApp) with the HTTP server, plus Vite middleware in development and
// static file serving in production. The Vercel serverless path uses
// createApp() directly and never imports this file.
const app = createApp();
const httpServer = createServer(app);

(async () => {
  // importantly only setup vite in development and after
  // registering all the other routes so the catch-all route
  // doesn't interfere with the API routes.
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "127.0.0.1",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
