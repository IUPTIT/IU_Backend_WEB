import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as candidateService from "../services/candidate.service.js";

export const getMe = catchAsync(async (req, res) => {
  const result = await candidateService.getMe(req.user.sourceApplicationId);
  sendSuccess(res, { message: "Hồ sơ ứng viên", data: result });
});

export const listSlots = catchAsync(async (req, res) => {
  const slots = await candidateService.listAvailableSlots(
    req.user.sourceApplicationId,
  );
  sendSuccess(res, { message: "Ca phỏng vấn còn chỗ", data: { slots } });
});

export const holdSlot = catchAsync(async (req, res) => {
  const hold = await candidateService.holdSlot(
    req.user.sourceApplicationId,
    req.params.slotId,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã giữ chỗ — xác nhận trong 150 giây",
    data: { hold },
  });
});

export const confirmBooking = catchAsync(async (req, res) => {
  const booking = await candidateService.confirmBooking(
    req.user.sourceApplicationId,
    req.body.slotId,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã đặt lịch phỏng vấn",
    data: { booking },
  });
});

export const releaseHold = catchAsync(async (req, res) => {
  const result = await candidateService.releaseHold(
    req.user.sourceApplicationId,
    req.body?.slotId || null,
  );
  sendSuccess(res, {
    message: "Đã huỷ giữ chỗ",
    data: result,
  });
});

export const changeSlot = catchAsync(async (req, res) => {
  const booking = await candidateService.changeSlot(
    req.user.sourceApplicationId,
    req.body.newSlotId,
  );
  sendSuccess(res, { message: "Đã đổi ca phỏng vấn", data: { booking } });
});
