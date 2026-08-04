import { Router } from "express";
import authRoutes from "./auth.routes.js";
import recruitmentRoutes from "./recruitment.routes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "IU_CLUB API is running" });
});

router.use("/auth", authRoutes);
router.use("/recruitment", recruitmentRoutes);
// Future slices: /training, /content, ...

export default router;
