import express, { type Express } from "express";
import { PROTOCOL_VERSION } from "@ludo/shared-types";

export interface AppOptions {
  readiness?: (() => Promise<boolean>) | undefined;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  // The API only serves small JSON status documents: forbid sniffing, framing, caching and referrers.
  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", protocolVersion: PROTOCOL_VERSION });
  });

  // Readiness: 503 while the database cannot be reached, so a load balancer stops routing players here.
  app.get("/api/ready", async (_req, res) => {
    const ready = options.readiness ? await options.readiness().catch(() => false) : true;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
  });

  return app;
}
