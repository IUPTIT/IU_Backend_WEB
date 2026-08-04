import mongoose from "mongoose";

export const BOOKING_STATUS = ["booked", "changed", "no_show", "completed"];

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

    // Số lần đã đổi ca phỏng vấn (Tối đa 1 lần)
    changeCount: {
      type: Number,
      default: 0,
      min: [0, "Số lần đổi ca tối thiểu là 0"],
      max: [1, "Tối đa chỉ được đổi ca phỏng vấn 1 lần"],
    },

    // Thời điểm ứng viên thực hiện đặt lịch thành công
    bookedAt: {
      type: Date,
      default: Date.now,
    },

    // Cờ đã gửi email nhắc lịch (job sendInterviewReminder quét định kỳ)
    reminded24h: { type: Boolean, default: false },
    reminded2h: { type: Boolean, default: false },
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
 * Instance method kiểm tra ứng viên có được phép đổi ca phỏng vấn hay không.
 * Điều kiện:
 * 1. Số lần đổi ca (changeCount) < 1
 * 2. Thời điểm ca mới (newSlotStartDateTime) phải cách thời điểm hiện tại >= 24 giờ.
 *
 * @param {Date} newSlotStartDateTime Thời điểm bắt đầu của ca phỏng vấn mới
 * @returns {boolean} true nếu hợp lệ, false nếu không được phép đổi
 */
interviewBookingSchema.methods.canChangeSlot = function (newSlotStartDateTime) {
  if (this.changeCount >= 1) return false;

  if (!newSlotStartDateTime) return false;

  const now = Date.now();
  const targetTime = new Date(newSlotStartDateTime).getTime();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (targetTime - now < TWENTY_FOUR_HOURS_MS) {
    return false;
  }

  return true;
};

const InterviewBooking = mongoose.model(
  "InterviewBooking",
  interviewBookingSchema,
);

export default InterviewBooking;
