import mongoose from "mongoose";

export const BOOKING_STATUS = ["booked", "changed", "no_show", "completed"];

/** Đổi ca phải trước giờ PV hiện tại ít nhất 12 giờ */
export const CHANGE_SLOT_MIN_LEAD_MS = 12 * 60 * 60 * 1000;

const interviewBookingSchema = new mongoose.Schema(
  {
    // ID hồ sơ ứng tuyển (Unique: 1 hồ sơ chỉ được có 1 booking active)
    // unique qua schema.index() bên dưới — không khai báo tại field để tránh trùng index
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },

    // ID ca phỏng vấn được chọn
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InterviewSlot",
      required: true,
    },

    // Trạng thái đặt lịch phỏng vấn
    status: {
      type: String,
      enum: BOOKING_STATUS,
      default: "booked",
    },

    // Số lần đã đổi ca (không giới hạn — chỉ để thống kê)
    changeCount: {
      type: Number,
      default: 0,
      min: [0, "Số lần đổi ca tối thiểu là 0"],
    },

    // Thời điểm ứng viên thực hiện đặt lịch thành công
    bookedAt: {
      type: Date,
      default: Date.now,
    },

    // Cờ đã gửi email nhắc lịch (job sendInterviewReminder quét định kỳ)
    reminded24h: { type: Boolean, default: false },
    reminded2h: { type: Boolean, default: false },
    /** Mốc giờ đã nhắc (vd. 24, 2, 48) — đọc từ Auto Rules */
    remindedOffsets: { type: [Number], default: [] },
  },
  {
    timestamps: true,
    collection: "interview_bookings",
  },
);

// Indexes
interviewBookingSchema.index({ applicationId: 1 }, { unique: true });
interviewBookingSchema.index({ slotId: 1 });

/**
 * Được đổi ca khi còn ≥ 12 giờ trước thời điểm bắt đầu ca hiện tại.
 * (Ca mới còn chỗ — kiểm tra riêng ở service.)
 *
 * @param {Date} currentSlotStartDateTime Thời điểm bắt đầu ca đang đặt
 */
interviewBookingSchema.methods.canChangeSlot = function (
  currentSlotStartDateTime,
) {
  if (!currentSlotStartDateTime) return false;
  const start = new Date(currentSlotStartDateTime).getTime();
  if (Number.isNaN(start)) return false;
  return start - Date.now() >= CHANGE_SLOT_MIN_LEAD_MS;
};

/** Lý do cụ thể khi không đổi được ca */
interviewBookingSchema.methods.changeSlotBlockReason = function (
  currentSlotStartDateTime,
) {
  if (!currentSlotStartDateTime) {
    return "Không xác định được giờ phỏng vấn hiện tại.";
  }
  const start = new Date(currentSlotStartDateTime).getTime();
  if (Number.isNaN(start)) {
    return "Giờ phỏng vấn hiện tại không hợp lệ.";
  }
  if (start - Date.now() < CHANGE_SLOT_MIN_LEAD_MS) {
    return "Chỉ được đổi ca trước giờ phỏng vấn ít nhất 12 giờ.";
  }
  return null;
};

const InterviewBooking = mongoose.model(
  "InterviewBooking",
  interviewBookingSchema,
);

export default InterviewBooking;
