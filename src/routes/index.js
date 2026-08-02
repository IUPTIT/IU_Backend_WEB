import { Router } from "express";
import authRoutes from "./auth.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "IU_CLUB API is running" });
});

router.use("/auth", authRoutes);
// Future slices: /recruitment, /training, /content, ...

export default router;
