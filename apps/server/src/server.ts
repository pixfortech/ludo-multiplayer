import { loadConfig } from "./config.js";
import { startServer } from "./httpServer.js";

const server = await startServer(loadConfig());
console.log(`Ludo server listening on http://localhost:${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
