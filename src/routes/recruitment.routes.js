import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import * as controller from "../controllers/recruitment.controller.js";
import {
  createCampaignValidator,
  updateCampaignValidator,
  campaignIdValidator,
  submitApplicationValidator,
  lookupValidator,
  updateApplicationValidator,
  withdrawValidator,
} from "../validators/recruitment.validator.js";

const router = Router();

// Upload file vào RAM rồi đẩy thẳng Cloudinary — giới hạn cứng 5MB tại multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Endpoint công khai nên throttle để tránh spam upload
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many uploads. Please try again later." },
});

// ---- Public (Guest — không cần đăng nhập) ----
router.get("/active", controller.getActiveCampaign);
router.post("/uploads", uploadLimiter, upload.single("file"), controller.uploadFile);
router.post("/applications", submitApplicationValidator, controller.submitApplication);
router.get("/applications/lookup", lookupValidator, controller.lookupApplication);
router.patch(
  "/applications/:code",
  updateApplicationValidator,
  controller.updateApplication,
);
router.post(
  "/applications/:code/withdraw",
  withdrawValidator,
  controller.withdrawApplication,
);

// ---- BCN: quản lý đợt tuyển ----
router.use(authenticate, authorize("bcn"));
router.post("/campaigns", createCampaignValidator, controller.createCampaign);
router.get("/campaigns", controller.listCampaigns);
router.get("/campaigns/:id", campaignIdValidator, controller.getCampaign);
router.patch("/campaigns/:id", updateCampaignValidator, controller.updateCampaign);
router.post("/campaigns/:id/publish", campaignIdValidator, controller.publishCampaign);
router.post("/campaigns/:id/close", campaignIdValidator, controller.closeCampaign);
router.delete("/campaigns/:id", campaignIdValidator, controller.deleteCampaign);
router.get("/applications", controller.listApplications);

export default router;
