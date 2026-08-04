// Route trong thư mục này TUYỆT ĐỐI không được import/dùng middleware authenticate.js — đây là API cho Guest chưa đăng nhập.

import { Router } from "express";

const router = Router();

// Endpoint công khai cho ứng viên (Guest) tra cứu và nộp đơn
router.get("/campaigns/active", (_req, res) => {
  res.json({ success: true, message: "Public active campaigns endpoint" });
});

router.get("/applications/lookup", (_req, res) => {
  res.json({ success: true, message: "Public application lookup endpoint" });
});

export default router;
