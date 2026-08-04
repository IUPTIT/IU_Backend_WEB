import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
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

// Toàn bộ route dành riêng cho role candidate — thao tác chỉ trên hồ sơ của chính mình
// (service tra theo req.user.sourceApplicationId, không nhận applicationId từ client)
router.use(authenticate, authorize("candidate"));

router.get("/me", controller.getMe);
router.get("/slots", controller.listSlots);
router.post("/slots/:slotId/hold", slotIdParam, controller.holdSlot);
router.post("/bookings/confirm", confirmBody, controller.confirmBooking);
router.put("/bookings/change-slot", changeSlotBody, controller.changeSlot);

export default router;
