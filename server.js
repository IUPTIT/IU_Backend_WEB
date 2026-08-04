import app from "./src/app.js";
import config from "./src/config/env.js";
import { connectDatabase, disconnectDatabase } from "./src/config/database.js";
import { initJobs, agenda } from "./src/jobs/index.js";

async function start() {
  await connectDatabase();
  await initJobs();

  const server = app.listen(config.port, () => {
    console.log(
      `[server] listening on http://localhost:${config.port} (${config.env})`,
    );
  });

  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close(async () => {
      await agenda.stop();
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
