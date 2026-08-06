import { Router } from "express";
import authRoutes from "./auth.routes.js";
import recruitmentRoutes from "./recruitment.routes.js";
import candidateRoutes from "./candidate.routes.js";
import trainingRoutes from "./training.routes.js";
import notificationRoutes from "./notification.routes.js";
import adminRoutes from "./admin.routes.js";
import leaderDepartmentRoutes from "./leaderDepartment.routes.js";
import publicRoutes from "./public/index.js";
import { publicLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "IU_CLUB API is running" });
});

router.use("/public", publicLimiter, publicRoutes);

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/leader/department", leaderDepartmentRoutes);
router.use("/recruitment", recruitmentRoutes);
router.use("/candidate", candidateRoutes);
router.use("/training", trainingRoutes);
router.use("/notifications", notificationRoutes);

export default router;
