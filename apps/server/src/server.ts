import { bootstrap, describeStartupFailure } from "./startup.js";

try {
  const app = await bootstrap();
  console.log(`Ludo server listening on http://localhost:${app.server.port} (PostgreSQL connected, schema up to date)`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
} catch (error) {
  console.error(`Ludo server failed to start: ${describeStartupFailure(error)}`);
  process.exit(1);
}
