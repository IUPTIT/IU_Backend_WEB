import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import ApiError from "../utils/ApiError.js";
import * as controller from "../controllers/training.controller.js";
import { idParam, objectId } from "../validations/common.validation.js";
import { LESSON_KINDS } from "../models/trainingProgram.model.js";
import { TRAINEE_EVAL_STATUS } from "../models/trainee.model.js";

const router = Router();

const createProgramBody = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().max(200).required(),
    department: Joi.string().trim().required(),
    stages: Joi.array()
      .items(
        Joi.object({
          stageId: Joi.string().trim().required(),
          name: Joi.string().trim().required(),
          order: Joi.number().integer().min(1).required(),
          weekLabel: Joi.string().allow(""),
          durationWeeks: Joi.number().integer().min(1).allow(null),
        }),
      )
      .default([]),
    lessons: Joi.array()
      .items(
        Joi.object({
          lessonId: Joi.string().trim().required(),
          stageId: Joi.string().trim().required(),
          title: Joi.string().trim().required(),
          content: Joi.string().allow(""),
          attachmentUrl: Joi.string().allow(""),
          kind: Joi.string()
            .valid(...LESSON_KINDS)
            .allow(null),
          durationLabel: Joi.string().allow(""),
        }),
      )
      .default([]),
  }),
});

const createGroupBody = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().max(200).required(),
    programId: objectId.required(),
    department: Joi.string().trim().required(),
    specialtyLabel: Joi.string().allow(""),
    mentorId: objectId.allow(null, ""),
    memberIds: Joi.array().items(objectId).min(1).required(),
  }),
});

const evalStatusBody = celebrate({
  [Segments.BODY]: Joi.object({
    evalStatus: Joi.string()
      .valid(...TRAINEE_EVAL_STATUS)
      .required(),
  }),
});

const certificatesBody = celebrate({
  [Segments.BODY]: Joi.object({
    traineeIds: Joi.array().items(objectId).min(1).required(),
  }),
});

router.use(authenticate);
const bcnOnly = authorize("bcn");
const bcnOrLeader = authorize("bcn", "leader");

// BCN/Leader hoặc member đã được đẩy quyền mentor (mentor tự tạo lộ trình riêng)
const bcnLeaderOrMentor = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (["bcn", "leader"].includes(req.user.role) || req.user.isMentor === true) {
    return next();
  }
  return next(ApiError.forbidden("Chỉ BCN/Leader/Mentor mới truy cập được"));
};

router.get("/trainees", bcnOrLeader, controller.listTrainees);
router.get("/mentors", bcnOrLeader, controller.listMentors);
router.get("/mentor-candidates", bcnOrLeader, controller.listMentorCandidates);
router.patch(
  "/mentors/:id",
  bcnOnly,
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({ isMentor: Joi.boolean().required() }),
  }),
  controller.setMentor,
);
router.post(
  "/groups/auto-assign",
  bcnOnly,
  celebrate({
    // programId là fallback — mentor có lộ trình riêng sẽ dùng lộ trình của mình
    [Segments.BODY]: Joi.object({ programId: objectId.allow(null, "") }),
  }),
  controller.autoAssignGroups,
);

router.get("/programs", bcnLeaderOrMentor, controller.listPrograms);
router.get("/programs/:id", bcnLeaderOrMentor, idParam, controller.getProgram);
// Mentor tự tạo lộ trình training của riêng mình
router.post(
  "/programs",
  bcnLeaderOrMentor,
  createProgramBody,
  controller.createProgram,
);

router.get("/groups", bcnLeaderOrMentor, controller.listGroups);
router.post("/groups", bcnOnly, createGroupBody, controller.createGroup);

router.get("/review-summary", bcnOrLeader, controller.getReviewSummary);
// Mentor đánh giá tân binh trong team mình
router.patch(
  "/trainees/:id/eval",
  bcnLeaderOrMentor,
  idParam,
  evalStatusBody,
  controller.updateEvalStatus,
);
router.post(
  "/certificates",
  bcnOnly,
  certificatesBody,
  controller.issueCertificates,
);

export default router;
