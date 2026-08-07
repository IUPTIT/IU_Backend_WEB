import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import requirePasswordChanged from "../middlewares/requirePasswordChanged.js";
import * as controller from "../controllers/training.controller.js";
import * as taskController from "../controllers/trainingTask.controller.js";
import { idParam, objectId } from "../validations/common.validation.js";
import { LESSON_KINDS } from "../models/trainingProgram.model.js";
import { TRAINEE_EVAL_STATUS } from "../models/trainee.model.js";
import ApiError from "../utils/ApiError.js";
import { hasRole } from "../utils/roles.js";

const router = Router();

const createProgramBody = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().max(200).required(),
    department: Joi.string().trim().required(),
    passThresholdPercent: Joi.number().integer().min(0).max(100).default(80),
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
    programId: objectId.allow(null, ""),
    department: Joi.string().trim().allow(""),
    specialtyLabel: Joi.string().allow(""),
    mentorId: objectId.allow(null, ""),
    memberIds: Joi.array().items(objectId).min(1).required(),
    campaignId: objectId.allow(null, ""),
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
router.use(requirePasswordChanged);
const bcnOnly = authorize("bcn");
const bcnOrMentor = (req, _res, next) => {
  if (hasRole(req.user, "bcn") || req.user?.isMentor === true) return next();
  return next(
    ApiError.forbidden("Chỉ BCN hoặc Mentor training được thực hiện thao tác này"),
  );
};
/** Chỉ Mentor training — Admin/BCN không tạo/sửa/xóa lộ trình. */
const mentorOnly = (req, _res, next) => {
  if (req.user?.isMentor === true) return next();
  return next(
    ApiError.forbidden("Chỉ Mentor training được quản lý lộ trình đào tạo"),
  );
};

// Trainee tự xem vòng training của mình — không giới hạn role, service xác minh
router.get("/me", controller.getMyTraining);

router.get("/trainees", bcnOrMentor, controller.listTrainees);
router.get("/mentors", bcnOrMentor, controller.listMentors);
router.get("/mentor-candidates", bcnOrMentor, controller.listMentorCandidates);
router.patch(
  "/mentors/:id",
  bcnOnly,
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({ isMentor: Joi.boolean().required() }),
  }),
  controller.setMentor,
);
router.get("/programs", bcnOrMentor, controller.listPrograms);
router.get("/programs/:id", bcnOrMentor, idParam, controller.getProgram);
// Chỉ Mentor training thiết kế / sửa / xóa lộ trình (Admin chỉ xem để gắn đội).
router.post(
  "/programs",
  mentorOnly,
  createProgramBody,
  controller.createProgram,
);
router.patch(
  "/programs/:id",
  mentorOnly,
  idParam,
  createProgramBody,
  controller.updateProgram,
);
router.delete(
  "/programs/:id",
  mentorOnly,
  idParam,
  controller.deleteProgram,
);

router.get("/groups", bcnOrMentor, controller.listGroups);
router.post("/groups", bcnOnly, createGroupBody, controller.createGroup);
router.post(
  "/groups/notify",
  bcnOnly,
  celebrate({
    [Segments.BODY]: Joi.object({
      groupIds: Joi.array().items(objectId).min(1).required(),
    }),
  }),
  controller.resendGroupNotifications,
);
router.patch(
  "/groups/:id",
  bcnOrMentor,
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim().max(200),
      programId: objectId.allow(null, ""),
      department: Joi.string().trim(),
      specialtyLabel: Joi.string().allow(""),
      mentorId: objectId.allow(null, ""),
      memberIds: Joi.array().items(objectId).min(1),
    }).min(1),
  }),
  controller.updateGroup,
);
router.delete("/groups/:id", bcnOnly, idParam, controller.deleteGroup);

// Tiến độ cá nhân + chat nhóm
router.get("/me/progress", controller.getMyProgress);
router.get("/groups/:id/messages", idParam, controller.listGroupMessages);
router.post(
  "/groups/:id/messages",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      content: Joi.string().trim().max(4000).required(),
    }),
  }),
  controller.postGroupMessage,
);

// ---- Task: mentor giao task cho team, trainee nộp bài, mentor chấm ----

const createTaskBody = celebrate({
  [Segments.BODY]: Joi.object({
    groupId: objectId.required(),
    title: Joi.string().trim().max(200).required(),
    description: Joi.string().allow(""),
    attachmentUrl: Joi.string().uri().allow(""),
    deadline: Joi.date().iso().allow(null),
    // Bỏ trống → giao cho cả team
    assigneeIds: Joi.array().items(objectId),
  }),
});

const updateTaskBody = celebrate({
  [Segments.BODY]: Joi.object({
    title: Joi.string().trim().max(200),
    description: Joi.string().allow(""),
    attachmentUrl: Joi.string().uri().allow(""),
    deadline: Joi.date().iso().allow(null),
  }).min(1),
});

const submitTaskBody = celebrate({
  [Segments.BODY]: Joi.object({
    submissionUrl: Joi.string().uri().allow(""),
    submissionNote: Joi.string().allow(""),
  }).or("submissionUrl", "submissionNote"),
});

const reviewParams = celebrate({
  [Segments.PARAMS]: Joi.object({
    id: objectId.required(),
    traineeId: objectId.required(),
  }),
});

const reviewBody = celebrate({
  [Segments.BODY]: Joi.object({
    status: Joi.string().valid("approved", "rejected").required(),
    feedback: Joi.string().allow(""),
    score: Joi.number().min(0).max(10).allow(null),
  }),
});

// Trainee (mọi user đăng nhập là trainee sẽ được service xác minh)
router.get("/tasks/mine", taskController.listMyTasks);
router.post(
  "/tasks/:id/submit",
  idParam,
  submitTaskBody,
  taskController.submitTask,
);
router.post(
  "/tasks/:id/progress-log",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      content: Joi.string().trim().min(1).max(2000).required(),
    }),
  }),
  taskController.addProgressLog,
);

// Mentor/BCN/Leader
router.get("/tasks", bcnOrMentor, taskController.listTasks);
router.post(
  "/tasks",
  bcnOrMentor,
  createTaskBody,
  taskController.createTask,
);
router.get("/tasks/:id", bcnOrMentor, idParam, taskController.getTask);
router.patch(
  "/tasks/:id",
  bcnOrMentor,
  idParam,
  updateTaskBody,
  taskController.updateTask,
);
router.delete(
  "/tasks/:id",
  bcnOrMentor,
  idParam,
  taskController.deleteTask,
);
router.patch(
  "/tasks/:id/review/:traineeId",
  bcnOrMentor,
  reviewParams,
  reviewBody,
  taskController.reviewSubmission,
);

// Mentor xem tân binh các team mình dẫn (để đánh giá cuối vòng)
router.get("/my-team", bcnOrMentor, controller.listMyTeamTrainees);

router.get("/review-summary", bcnOrMentor, controller.getReviewSummary);
// Mentor lưu note quá trình + điểm cho tân binh team mình (không chốt Đạt/Trượt)
router.patch(
  "/trainees/:id/mentor-review",
  bcnOrMentor,
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      score: Joi.number().min(0).max(10).allow(null),
      note: Joi.string().allow(""),
      // true = gửi kết quả lên BCN, false/bỏ trống = lưu nháp
      submit: Joi.boolean(),
    }).min(1),
  }),
  controller.saveMentorReview,
);
// Chốt Đạt/Trượt / certified cuối vòng training — chỉ BCN
router.patch(
  "/trainees/:id/eval",
  bcnOnly,
  idParam,
  evalStatusBody,
  controller.updateEvalStatus,
);
router.post(
  "/trainees/:id/incomplete-action",
  bcnOnly,
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      action: Joi.string()
        .valid("final_reminder", "extend_once", "remove_from_club")
        .required(),
      reason: Joi.string().trim().max(1000).required(),
    }),
  }),
  controller.handleIncomplete,
);
router.post(
  "/trainees/:id/confirm-completion",
  bcnOrMentor,
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      note: Joi.string().allow(""),
    }),
  }),
  controller.confirmCompletion,
);
router.post(
  "/certificates",
  bcnOnly,
  certificatesBody,
  controller.issueCertificates,
);

export default router;
