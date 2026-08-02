import mongoose from "mongoose";
import config from "./env.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);

  mongoose.connection.on("connected", () => console.log("[db] connected"));
  mongoose.connection.on("error", (err) =>
    console.error("[db] error:", err.message),
  );
  mongoose.connection.on("disconnected", () =>
    console.warn("[db] disconnected"),
  );

  await mongoose.connect(config.mongoUri);
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
