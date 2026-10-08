import express, { type Express } from "express";
import { PROTOCOL_VERSION } from "@ludo/shared-types";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", protocolVersion: PROTOCOL_VERSION });
  });

  return app;
}
