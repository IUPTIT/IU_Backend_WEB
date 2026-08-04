import { Router } from "express";
import authRoutes from "./auth.routes.js";
import publicRoutes from "./public/index.js";
import { publicLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "IU_CLUB API is running" });
});

// Public endpoints for unauthenticated Guests (protected with strict rate limiting)
router.use("/public", publicLimiter, publicRoutes);

// Private / Authenticated endpoints
router.use("/auth", authRoutes);
// Future slices: /recruitment, /candidate, /training, /content, ...

export default router;

