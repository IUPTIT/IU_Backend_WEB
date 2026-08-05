import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import ApiError from "../utils/ApiError.js";
import * as controller from "../controllers/training.controller.js";
import * as taskController from "../controllers/trainingTask.controller.js";
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

// Trainee tự xem vòng training của mình — không giới hạn role, service xác minh
router.get("/me", controller.getMyTraining);

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
    [Segments.BODY]: Joi.object({
      programId: objectId.allow(null, ""),
      campaignId: objectId.allow(null, ""),
    }),
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
router.patch(
  "/programs/:id",
  bcnLeaderOrMentor,
  idParam,
  createProgramBody,
  controller.updateProgram,
);
// Mentor xóa lộ trình của mình (BCN/Leader xóa được tất cả — check trong service)
router.delete(
  "/programs/:id",
  bcnLeaderOrMentor,
  idParam,
  controller.deleteProgram,
);

router.get("/groups", bcnLeaderOrMentor, controller.listGroups);
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
  bcnOrLeader,
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

// Mentor/BCN/Leader
router.get("/tasks", bcnLeaderOrMentor, taskController.listTasks);
router.post(
  "/tasks",
  bcnLeaderOrMentor,
  createTaskBody,
  taskController.createTask,
);
router.get("/tasks/:id", bcnLeaderOrMentor, idParam, taskController.getTask);
router.patch(
  "/tasks/:id",
  bcnLeaderOrMentor,
  idParam,
  updateTaskBody,
  taskController.updateTask,
);
router.delete(
  "/tasks/:id",
  bcnLeaderOrMentor,
  idParam,
  taskController.deleteTask,
);
router.patch(
  "/tasks/:id/review/:traineeId",
  bcnLeaderOrMentor,
  reviewParams,
  reviewBody,
  taskController.reviewSubmission,
);

// Mentor xem tân binh các team mình dẫn (để đánh giá cuối vòng)
router.get("/my-team", bcnLeaderOrMentor, controller.listMyTeamTrainees);

router.get("/review-summary", bcnOrLeader, controller.getReviewSummary);
// Mentor lưu note quá trình + điểm cho tân binh team mình (không chốt Đạt/Trượt)
router.patch(
  "/trainees/:id/mentor-review",
  bcnLeaderOrMentor,
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
// Chốt Đạt/Trượt cuối vòng training — CHỈ BCN/Leader
router.patch(
  "/trainees/:id/eval",
  bcnOrLeader,
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
        .valid("final_reminder", "remove_from_club")
        .required(),
      reason: Joi.string().trim().max(1000).required(),
    }),
  }),
  controller.handleIncomplete,
);
router.post(
  "/trainees/:id/confirm-completion",
  bcnLeaderOrMentor,
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
