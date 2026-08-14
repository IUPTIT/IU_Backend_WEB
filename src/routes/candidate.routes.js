import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import requirePasswordChanged from "../middlewares/requirePasswordChanged.js";
import * as controller from "../controllers/candidate.controller.js";
import { objectId } from "../validations/common.validation.js";

const router = Router();

const slotIdParam = celebrate({
  [Segments.PARAMS]: Joi.object({ slotId: objectId.required() }),
});

const confirmBody = celebrate({
  [Segments.BODY]: Joi.object({ slotId: objectId.required() }),
});

const changeSlotBody = celebrate({
  [Segments.BODY]: Joi.object({ newSlotId: objectId.required() }),
});

// slotId tuỳ chọn: có → chỉ nhả hold của ca đó; không → nhả mọi hold của ứng viên
const releaseHoldBody = celebrate({
  [Segments.BODY]: Joi.object({ slotId: objectId.optional() }),
});

// Toàn bộ route dành riêng cho role candidate — thao tác chỉ trên hồ sơ của chính mình
router.use(authenticate, authorize("candidate"));

// getMe luôn cho phép — FE dùng để hiện ChangePasswordGate
router.get("/me", controller.getMe);

router.use(requirePasswordChanged);
router.get("/slots", controller.listSlots);
router.post("/slots/:slotId/hold", slotIdParam, controller.holdSlot);
router.post("/bookings/confirm", confirmBody, controller.confirmBooking);
router.post("/bookings/release-hold", releaseHoldBody, controller.releaseHold);
router.put("/bookings/change-slot", changeSlotBody, controller.changeSlot);

export default router;
