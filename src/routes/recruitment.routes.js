import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import * as controller from "../controllers/recruitment.controller.js";
import * as campaignValidation from "../validations/recruitmentCampaign.validation.js";
import * as formValidation from "../validations/applicationForm.validation.js";
import * as scoreValidation from "../validations/applicationScore.validation.js";
import * as slotValidation from "../validations/interviewSlot.validation.js";
import { idParam, objectId } from "../validations/common.validation.js";

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

const statusBody = (...allowed) =>
  celebrate({
    [Segments.BODY]: Joi.object({
      status: Joi.string()
        .valid(...allowed)
        .required(),
    }),
  });

const assignSlotBody = celebrate({
  [Segments.BODY]: Joi.object({ slotId: objectId.required() }),
});

const updateSlotBody = celebrate({
  [Segments.BODY]: Joi.object({
    interviewerIds: Joi.array().items(objectId).min(1),
    location: Joi.string().trim(),
    date: Joi.date().iso(),
    startTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
    endTime: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/),
    capacity: Joi.number().integer().min(1),
  }).min(1),
});

router.use(authenticate);

const bcnOnly = authorize("bcn");
const bcnOrLeader = authorize("bcn", "leader");

// ---- Phần 0: BCN quản lý đợt tuyển & form ----
router.post("/campaigns", bcnOnly, campaignValidation.createCampaign, controller.createCampaign);
router.get("/campaigns", bcnOrLeader, controller.listCampaigns);
router.get("/campaigns/:id", bcnOrLeader, idParam, controller.getCampaign);
router.patch("/campaigns/:id", bcnOnly, idParam, updateCampaignValidator, controller.updateCampaign);
router.post("/campaigns/:id/publish", bcnOnly, idParam, controller.publishCampaign);
router.post("/campaigns/:id/close", bcnOnly, idParam, controller.closeCampaign);
router.delete("/campaigns/:id", bcnOnly, idParam, controller.deleteCampaign);

router.get("/campaigns/:id/form", bcnOrLeader, idParam, controller.getForm);
router.put("/campaigns/:id/form", bcnOnly, idParam, formValidation.updateForm, controller.updateForm);

// ---- Phần 2: vòng đơn — danh sách, chấm điểm, quyết định ----
router.get("/applications", bcnOrLeader, controller.listApplications);
router.post(
  "/applications/:id/score",
  bcnOrLeader,
  idParam,
  scoreValidation.createScore,
  controller.scoreApplication,
);
router.get("/applications/:id/scores", bcnOrLeader, idParam, controller.getScoreSummary);
router.post(
  "/applications/:id/decide",
  bcnOnly,
  idParam,
  statusBody("passed_cv", "failed_cv"),
  controller.decideApplication,
);

// ---- Phần 3: ca phỏng vấn ----
router.get("/interviewers", bcnOrLeader, controller.listInterviewers);
router.post("/slots", bcnOnly, slotValidation.createSlot, controller.createSlot);
router.post(
  "/campaigns/:id/slots/bulk-generate",
  bcnOnly,
  idParam,
  slotValidation.bulkGenerateSlots,
  controller.bulkGenerateSlots,
);
router.get("/campaigns/:id/slots", bcnOrLeader, idParam, controller.listSlots);
router.patch("/slots/:id", bcnOnly, idParam, updateSlotBody, controller.updateSlot);
router.post("/applications/:id/assign-slot", bcnOnly, idParam, assignSlotBody, controller.assignSlot);
router.post(
  "/bookings/:id/score",
  bcnOrLeader,
  idParam,
  scoreValidation.createScore,
  controller.scoreBooking,
);
router.post(
  "/applications/:id/decide-interview",
  bcnOnly,
  idParam,
  statusBody("passed_interview", "failed_interview"),
  controller.decideInterview,
);

// ---- Phần 4: kết quả cuối & bàn giao ----
router.post(
  "/applications/:id/confirm-final",
  bcnOnly,
  idParam,
  statusBody("admitted", "rejected"),
  controller.confirmFinal,
);
router.get("/campaigns/:id/new-members", bcnOrLeader, idParam, controller.listNewMembers);

export default router;
