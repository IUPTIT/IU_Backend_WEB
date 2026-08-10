import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import requirePasswordChanged from "../middlewares/requirePasswordChanged.js";
import catchAsync from "../utils/catchAsync.js";
import { objectId, phoneVNOptional } from "../validations/common.validation.js";
import * as controller from "../controllers/leaderDepartment.controller.js";
import * as departmentService from "../services/department.service.js";

const router = Router();

router.use(authenticate);
router.use(requirePasswordChanged);
router.use(authorize("leader"));
// Chỉ Leader đang thực sự phụ trách một Ban mới vào được API này.
router.use(
  catchAsync(async (req, _res, next) => {
    await departmentService.getLedDepartment(req.user.id);
    next();
  }),
);

router.get("/", controller.getMyDepartment);
router.post(
  "/members/:memberId",
  celebrate({
    [Segments.PARAMS]: Joi.object({ memberId: objectId.required() }),
    [Segments.BODY]: Joi.object({
      joinedAt: Joi.date().iso(),
      reason: Joi.string().allow("", null),
    }),
  }),
  controller.assignMember,
);
router.patch(
  "/members/:memberId",
  celebrate({
    [Segments.PARAMS]: Joi.object({ memberId: objectId.required() }),
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim(),
      phone: phoneVNOptional,
    }).min(1),
  }),
  controller.updateMember,
);
router.delete(
  "/members/:memberId",
  celebrate({
    [Segments.PARAMS]: Joi.object({ memberId: objectId.required() }),
    [Segments.BODY]: Joi.object({
      reason: Joi.string().allow("", null),
    }).unknown(true),
  }),
  controller.removeMember,
);

export default router;
