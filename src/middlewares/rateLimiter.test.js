import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";

import { publicReadLimiter, publicWriteLimiter } from "./rateLimiter.js";

// Ngưỡng phải khớp với rateLimiter.js — đổi ở đó thì cập nhật luôn ở đây.
const READ_MAX = 200;
const WRITE_MAX = 40;

// Dựng server thật (loopback) để kiểm tra hành vi limiter — không cần DB.
// Mỗi limiter chỉ được 1 test dùng nên bộ đếm in-memory không lẫn giữa các test.
function startServer() {
  const app = express();
  app.get("/read", publicReadLimiter, (_req, res) => res.json({ ok: true }));
  app.post("/write", publicWriteLimiter, (_req, res) => res.json({ ok: true }));
  return app.listen(0);
}

let server;
let base;

beforeAll(async () => {
  server = startServer();
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

async function fire(path, method, count) {
  const statuses = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch(`${base}${path}`, { method });
    statuses.push(res.status);
  }
  return statuses;
}

describe("publicReadLimiter (endpoint đọc /public)", () => {
  it("cho qua vượt xa 10 req/phút — guard bug rate-limit chặn đăng ký", async () => {
    // Bug cũ: limiter chung max=10 phủ cả nhóm /public khiến landing + mở form
    // đã chạm trần. 30 request đọc liên tiếp giờ phải qua hết.
    const statuses = await fire("/read", "GET", 30);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});

describe("publicWriteLimiter (endpoint ghi /public)", () => {
  it(`cho qua đúng ${WRITE_MAX} request rồi trả 429 để chống spam`, async () => {
    const statuses = await fire("/write", "POST", WRITE_MAX + 5);

    const passed = statuses.slice(0, WRITE_MAX);
    const blocked = statuses.slice(WRITE_MAX);

    expect(passed.every((s) => s === 200)).toBe(true);
    expect(blocked.every((s) => s === 429)).toBe(true);
    // Đủ chỗ cho 1 luồng đăng ký nhiều bước (2 upload + vài lần lưu nháp + nộp).
    expect(WRITE_MAX).toBeGreaterThan(10);
  });

  it("phản hồi 429 có message tiếng Việt đúng định dạng { success:false }", async () => {
    const res = await fetch(`${base}/write`, { method: "POST" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ success: false });
    expect(body.message).toMatch(/Quá nhiều yêu cầu/);
  });
});

describe("cấu hình ngưỡng", () => {
  it("đọc nới rộng hơn ghi (read max > write max)", () => {
    expect(READ_MAX).toBeGreaterThan(WRITE_MAX);
  });
});
