import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import * as controller from "../controllers/recruitment.controller.js";
import * as campaignValidation from "../validations/recruitmentCampaign.validation.js";
import * as formValidation from "../validations/applicationForm.validation.js";
import { idParam } from "../validations/common.validation.js";

const router = Router();

// Update chung: bản draft sửa được mọi trường; sau publish service tự giới hạn
// còn closeAt/quotas/description (spec 2.3)
const updateCampaignValidator = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().max(200),
    description: Joi.string().allow(""),
    openAt: Joi.date().iso(),
    closeAt: Joi.date().iso(),
    quotas: Joi.array()
      .items(
        Joi.object({
          department: Joi.string().trim().required(),
          quota: Joi.number().integer().min(1).required(),
        }),
      )
      .min(1)
      .unique("department"),
  }).min(1),
});

// ---- BCN: quản lý đợt tuyển & form (Phần 0) ----
router.use(authenticate, authorize("bcn"));

router.post(
  "/campaigns",
  campaignValidation.createCampaign,
  controller.createCampaign,
);
router.get("/campaigns", controller.listCampaigns);
router.get("/campaigns/:id", idParam, controller.getCampaign);
router.patch(
  "/campaigns/:id",
  idParam,
  updateCampaignValidator,
  controller.updateCampaign,
);
router.post("/campaigns/:id/publish", idParam, controller.publishCampaign);
router.post("/campaigns/:id/close", idParam, controller.closeCampaign);
router.delete("/campaigns/:id", idParam, controller.deleteCampaign);

router.get("/campaigns/:id/form", idParam, controller.getForm);
router.put(
  "/campaigns/:id/form",
  idParam,
  formValidation.updateForm,
  controller.updateForm,
);

// ---- BCN: hồ sơ vòng đơn (Phần 2 — mới có list, chấm điểm làm ở PR sau) ----
router.get("/applications", controller.listApplications);

export default router;
