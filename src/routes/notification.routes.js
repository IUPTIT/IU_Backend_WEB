import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as notificationService from "../services/notification.service.js";
import { objectId } from "../validations/common.validation.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  catchAsync(async (req, res) => {
    const [items, unread] = await Promise.all([
      notificationService.listForUser(req.user.id, {
        limit: req.query.limit,
      }),
      notificationService.countUnread(req.user.id),
    ]);
    sendSuccess(res, {
      message: "Danh sách thông báo",
      data: { items, unread },
    });
  }),
);

router.post(
  "/read-all",
  catchAsync(async (req, res) => {
    const result = await notificationService.markAllRead(req.user.id);
    sendSuccess(res, { message: "Đã đánh dấu đã đọc", data: result });
  }),
);

router.post(
  "/:id/read",
  celebrate({ [Segments.PARAMS]: Joi.object({ id: objectId.required() }) }),
  catchAsync(async (req, res) => {
    const item = await notificationService.markRead(req.user.id, req.params.id);
    sendSuccess(res, { message: "Đã đọc", data: { item } });
  }),
);

export default router;
