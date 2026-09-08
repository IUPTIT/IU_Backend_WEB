import { afterEach, describe, expect, test, vi } from "vitest";

// env.js đọc process.env ngay khi import; nạp lại module cho mỗi case để đổi URI.
const ORIGINAL_URI = process.env.MONGODB_URI;

async function loadConfig(mongoUri) {
  process.env.MONGODB_URI = mongoUri;
  vi.resetModules();
  const mod = await import("../env.js");
  return mod.default;
}

afterEach(() => {
  process.env.MONGODB_URI = ORIGINAL_URI;
  vi.resetModules();
});

describe("env config - MONGODB_URI", () => {
  test("giữ nguyên chuỗi mongodb+srv:// (không rewrite thành mongodb://)", async () => {
    const srv =
      "mongodb+srv://user:pass@cluster0.example.mongodb.net/mydb?retryWrites=true";
    const config = await loadConfig(srv);
    expect(config.mongoUri).toBe(srv);
  });

  // Chặn hồi quy: không được chèn lại host/replicaSet ghi cứng theo cluster cũ.
  test("không chèn host/replicaSet ghi cứng vào connection string", async () => {
    const config = await loadConfig(
      "mongodb+srv://u:p@abc.example.mongodb.net/db",
    );
    expect(config.mongoUri).not.toMatch(/shard-00|n3liatt|atlas-58z8f3/);
    expect(config.mongoUri.startsWith("mongodb+srv://")).toBe(true);
  });

  test("giữ nguyên chuỗi mongodb:// thường", async () => {
    const uri = "mongodb://127.0.0.1:27017/iu_club_test";
    const config = await loadConfig(uri);
    expect(config.mongoUri).toBe(uri);
  });
});
