import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import InterviewSlot from "../models/interviewSlot.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import * as slotHoldService from "./slotHold.service.js";
import * as emailService from "./email.service.js";
import * as notificationService from "./notification.service.js";
import {
  assertSlotHasInterviewers,
  notifyInterviewersNewBooking,
} from "./interview.service.js";

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

async function assertBookableSlot(slotId, application) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound("Ca phỏng vấn không tồn tại");
  assertSlotHasInterviewers(slot);
  const appCampaign = String(
    application.campaignId?._id ?? application.campaignId,
  );
  if (appCampaign && String(slot.campaignId) !== appCampaign) {
    throw ApiError.badRequest(
      "Ca phỏng vấn không thuộc cùng đợt tuyển với hồ sơ của bạn",
    );
  }
  return slot;
}

// Hồ sơ + lịch phỏng vấn hiện tại của ứng viên
export async function getMe(sourceApplicationId) {
  const application = await getOwnApplication(sourceApplicationId);
  const booking = await InterviewBooking.findOne({
    applicationId: application._id,
  }).populate("slotId");
  return { application, booking };
}

// Các ca còn chỗ của đợt — chỉ ca đã có ≥1 người PV; ẩn danh sách interviewer
export async function listAvailableSlots(sourceApplicationId) {
  const application = await getOwnApplication(sourceApplicationId);
  if (application.status !== "passed_cv") {
    throw ApiError.badRequest(
      "Chỉ ứng viên đã đạt vòng đơn mới được đặt lịch phỏng vấn",
    );
  }
  const campaignId = application.campaignId?._id ?? application.campaignId;
  const slots = await InterviewSlot.find({
    campaignId,
    $expr: { $lt: ["$bookedCount", "$capacity"] },
    date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    "interviewerIds.0": { $exists: true },
  })
    .sort({ date: 1, startTime: 1 })
    .select("-interviewerIds");
  return slots;
}

// Giữ chỗ 150 giây (transaction chống overbooking — slotHold.service)
export async function holdSlot(sourceApplicationId, slotId) {
  const application = await getOwnApplication(sourceApplicationId);
  if (application.status !== "passed_cv") {
    throw ApiError.badRequest(
      "Chỉ ứng viên đã đạt vòng đơn mới được đặt lịch phỏng vấn",
    );
  }
  const existing = await InterviewBooking.findOne({
    applicationId: application._id,
  });
  if (existing) {
    throw ApiError.badRequest(
      "Bạn đã có lịch phỏng vấn — dùng chức năng đổi ca",
    );
  }
  await assertBookableSlot(slotId, application);
  return slotHoldService.holdSlot(slotId, application._id);
}

// Xác nhận đặt lịch chính thức trong thời gian hold
export async function confirmBooking(sourceApplicationId, slotId) {
  const application = await getOwnApplication(sourceApplicationId);
  await assertBookableSlot(slotId, application);
  const booking = await slotHoldService.confirmBooking(slotId, application._id);
  const slot = await InterviewSlot.findById(slotId);
  if (slot) {
    try {
      await emailService.sendBookingConfirmedEmail(application, slot);
      if (application.userId) {
        const dateLabel = new Date(slot.date).toLocaleDateString("vi-VN");
        await notificationService.createNotification({
          userId: application.userId,
          title: "Đã xác nhận lịch phỏng vấn",
          body: `${dateLabel} · ${slot.startTime}–${slot.endTime} · ${slot.location}`,
          type: "booking_confirmed",
          link: "/candidate/interview",
        });
      }
      await notifyInterviewersNewBooking(slot, application);
    } catch (err) {
      console.warn("[candidate] confirmBooking notify failed:", err.message);
    }
  }
  return booking;
}

/** Huỷ giữ chỗ tạm (khi chọn ca khác / bỏ) */
export async function releaseHold(sourceApplicationId, slotId = null) {
  const application = await getOwnApplication(sourceApplicationId);
  return slotHoldService.releaseHold(application._id, slotId);
}

// Đổi ca — ca mới còn chỗ; trước giờ PV hiện tại ≥ 12h; không giới hạn số lần
export async function changeSlot(sourceApplicationId, newSlotId) {
  const application = await getOwnApplication(sourceApplicationId);
  const booking = await InterviewBooking.findOne({
    applicationId: application._id,
  });
  if (!booking) throw ApiError.notFound("Bạn chưa có lịch phỏng vấn để đổi");
  if (String(booking.slotId) === String(newSlotId)) {
    throw ApiError.badRequest("Ca mới trùng với ca hiện tại");
  }

  const currentSlot = await InterviewSlot.findById(booking.slotId);
  if (!currentSlot) {
    throw ApiError.badRequest("Không tìm thấy ca phỏng vấn hiện tại");
  }
  const currentStart = new Date(currentSlot.date);
  const [ch, cm] = String(currentSlot.startTime || "0:0")
    .split(":")
    .map(Number);
  currentStart.setHours(ch || 0, cm || 0, 0, 0);

  if (!booking.canChangeSlot(currentStart)) {
    const reason =
      typeof booking.changeSlotBlockReason === "function"
        ? booking.changeSlotBlockReason(currentStart)
        : null;
    throw ApiError.badRequest(
      reason || "Chỉ được đổi ca trước giờ phỏng vấn ít nhất 12 giờ.",
    );
  }

  await assertBookableSlot(newSlotId, application);

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

  try {
    await emailService.sendBookingConfirmedEmail(application, updated);
    if (application.userId) {
      const dateLabel = new Date(updated.date).toLocaleDateString("vi-VN");
      await notificationService.createNotification({
        userId: application.userId,
        title: "Đã đổi lịch phỏng vấn",
        body: `${dateLabel} · ${updated.startTime}–${updated.endTime} · ${updated.location}`,
        type: "booking_confirmed",
        link: "/candidate/interview",
      });
    }
    await notifyInterviewersNewBooking(updated, application);
  } catch (err) {
    console.warn("[candidate] changeSlot notify failed:", err.message);
  }
  return booking;
}
