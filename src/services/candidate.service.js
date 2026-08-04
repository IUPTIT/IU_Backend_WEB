import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import InterviewSlot from "../models/interviewSlot.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import * as slotHoldService from "./slotHold.service.js";
import * as emailService from "./email.service.js";

async function getOwnApplication(sourceApplicationId) {
  if (!sourceApplicationId) {
    throw ApiError.forbidden("Tài khoản không gắn với hồ sơ ứng tuyển nào");
  }
  const application = await Application.findById(sourceApplicationId).populate(
    "campaignId",
    "name openAt closeAt status",
  );
  if (!application) throw ApiError.notFound("Không tìm thấy hồ sơ ứng tuyển");
  return application;
}

// Hồ sơ + lịch phỏng vấn hiện tại của ứng viên
export async function getMe(sourceApplicationId) {
  const application = await getOwnApplication(sourceApplicationId);
  const booking = await InterviewBooking.findOne({
    applicationId: application._id,
  }).populate("slotId");
  return { application, booking };
}

// Các ca còn chỗ của đợt tuyển mình ứng tuyển — ẩn danh sách người phỏng vấn
export async function listAvailableSlots(sourceApplicationId) {
  const application = await getOwnApplication(sourceApplicationId);
  if (application.status !== "passed_cv") {
    throw ApiError.badRequest("Chỉ ứng viên đã đạt vòng đơn mới được đặt lịch phỏng vấn");
  }
  const campaignId = application.campaignId?._id ?? application.campaignId;
  const slots = await InterviewSlot.find({
    campaignId,
    $expr: { $lt: ["$bookedCount", "$capacity"] },
    date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  })
    .sort({ date: 1, startTime: 1 })
    .select("-interviewerIds");
  return slots;
}

// Giữ chỗ 150 giây (transaction chống overbooking — slotHold.service)
export async function holdSlot(sourceApplicationId, slotId) {
  const application = await getOwnApplication(sourceApplicationId);
  if (application.status !== "passed_cv") {
    throw ApiError.badRequest("Chỉ ứng viên đã đạt vòng đơn mới được đặt lịch phỏng vấn");
  }
  const existing = await InterviewBooking.findOne({ applicationId: application._id });
  if (existing) {
    throw ApiError.badRequest("Bạn đã có lịch phỏng vấn — dùng chức năng đổi ca");
  }
  return slotHoldService.holdSlot(slotId, application._id);
}

// Xác nhận đặt lịch chính thức trong thời gian hold
export async function confirmBooking(sourceApplicationId, slotId) {
  const application = await getOwnApplication(sourceApplicationId);
  const booking = await slotHoldService.confirmBooking(slotId, application._id);
  const slot = await InterviewSlot.findById(slotId);
  if (slot) await emailService.sendBookingConfirmedEmail(application, slot);
  return booking;
}

// Đổi ca — tối đa 1 lần, ca mới phải cách hiện tại >= 24h (booking.canChangeSlot)
export async function changeSlot(sourceApplicationId, newSlotId) {
  const application = await getOwnApplication(sourceApplicationId);
  const booking = await InterviewBooking.findOne({ applicationId: application._id });
  if (!booking) throw ApiError.notFound("Bạn chưa có lịch phỏng vấn để đổi");
  if (String(booking.slotId) === String(newSlotId)) {
    throw ApiError.badRequest("Ca mới trùng với ca hiện tại");
  }

  const newSlot = await InterviewSlot.findById(newSlotId);
  if (!newSlot) throw ApiError.notFound("Ca phỏng vấn mới không tồn tại");

  const newSlotStart = new Date(newSlot.date);
  const [h, m] = newSlot.startTime.split(":").map(Number);
  newSlotStart.setHours(h, m, 0, 0);
  if (!booking.canChangeSlot(newSlotStart)) {
    throw ApiError.badRequest(
      "Không thể đổi ca: chỉ được đổi tối đa 1 lần và ca mới phải cách hiện tại ít nhất 24 giờ",
    );
  }

  // Giữ chỗ ca mới trước (atomic guard capacity), rồi nhả ca cũ
  const updated = await InterviewSlot.findOneAndUpdate(
    { _id: newSlotId, $expr: { $lt: ["$bookedCount", "$capacity"] } },
    { $inc: { bookedCount: 1, version: 1 } },
    { new: true },
  );
  if (!updated) throw ApiError.badRequest("Ca phỏng vấn mới đã hết chỗ");

  await InterviewSlot.updateOne(
    { _id: booking.slotId, bookedCount: { $gt: 0 } },
    { $inc: { bookedCount: -1, version: 1 } },
  );

  booking.slotId = newSlotId;
  booking.status = "changed";
  booking.changeCount += 1;
  booking.bookedAt = new Date();
  await booking.save();

  await emailService.sendBookingConfirmedEmail(application, updated);
  return booking;
}
