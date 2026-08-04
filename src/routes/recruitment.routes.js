import { Router } from "express";
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

// ---- Public (Guest — không cần đăng nhập) ----
router.get("/active", controller.getActiveCampaign);
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
