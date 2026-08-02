import app from "./src/app.js";
import config from "./src/config/env.js";
import { connectDatabase, disconnectDatabase } from "./src/config/database.js";

async function start() {
  await connectDatabase();

  const server = app.listen(config.port, () => {
    console.log(
      `[server] listening on http://localhost:${config.port} (${config.env})`,
    );
  });

  // Graceful shutdown.
  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
