import mongoose from "mongoose";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Hàm helper chuyển định dạng HH:mm thành tổng số phút tính từ 00:00
 * để tiện so sánh toán học.
 */
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Hàm helper chuyển tổng số phút thành định dạng chuỗi HH:mm
 */
function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const interviewSlotSchema = new mongoose.Schema(
  {
    // ID đợt tuyển (RecruitmentCampaign)
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecruitmentCampaign",
      required: true,
    },

    // Ngày phỏng vấn
    date: { type: Date, required: true },

    // Giờ bắt đầu (Định dạng HH:mm, VD: "09:00")
    startTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "startTime phải có định dạng HH:mm (00:00 đến 23:59)"],
    },

    // Giờ kết thúc (Định dạng HH:mm, phải lớn hơn startTime)
    endTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "endTime phải có định dạng HH:mm (00:00 đến 23:59)"],
      validate: {
        validator: function (val) {
          if (!this.startTime || !val) return true;
          return timeToMinutes(val) > timeToMinutes(this.startTime);
        },
        message: "Thời gian kết thúc (endTime) phải lớn hơn thời gian bắt đầu (startTime)",
      },
    },

    // Địa điểm phỏng vấn (phòng học, địa chỉ trực tiếp hoặc link Google Meet/Zoom)
    location: { type: String, required: true, trim: true },

    // Danh sách các người phỏng vấn (User IDs)
    interviewerIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      required: true,
      validate: [
        {
          validator: function (arr) {
            return Array.isArray(arr) && arr.length > 0;
          },
          message: "Phải phân công ít nhất 1 người phỏng vấn (interviewer)",
        },
      ],
    },

    // Sức chứa tối đa của ca phỏng vấn (số lượng ứng viên tối đa có thể đặt)
    capacity: {
      type: Number,
      required: true,
      min: [1, "Sức chứa tối thiểu của ca phỏng vấn phải là 1"],
    },

    // Số lượng ứng viên đã đặt lịch thành công (chỉ cộng/trừ atomic ở service)
    bookedCount: { type: Number, default: 0, min: 0 },

    // Version dùng cho Optimistic Locking (tăng mỗi lần thay đổi bookedCount)
    version: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "interview_slots",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual field: Số chỗ còn trống tại thời điểm hiện tại
interviewSlotSchema.virtual("availableSlots").get(function () {
  const available = this.capacity - this.bookedCount;
  return available > 0 ? available : 0;
});

// Indexes
interviewSlotSchema.index({ campaignId: 1, date: 1 });
interviewSlotSchema.index({ campaignId: 1, date: 1, startTime: 1 });

/**
 * Static method sinh danh sách các ca phỏng vấn (Slot) lặp lại liên tục
 * theo khung giờ (VD: từ 09:00 đến 17:00, mỗi ca 30 phút).
 *
 * Tra về mảng các object document CHƯA lưu vào DB (service sẽ dùng insertMany).
 *
 * @param {Object} options
 * @param {string|ObjectId} options.campaignId ID đợt tuyển
 * @param {Array<Date>} options.dates Danh sách các ngày tạo ca phỏng vấn
 * @param {number} options.startHour Giờ bắt đầu trong ngày (VD: 9 nghĩa là 09:00)
 * @param {number} options.endHour Giờ kết thúc trong ngày (VD: 17 nghĩa là 17:00)
 * @param {number} options.durationMinutes Thời lượng mỗi ca (phút, VD: 30)
 * @param {number} options.capacity Sức chứa mỗi ca
 * @param {string} options.location Địa điểm / Link online
 * @param {Array<string|ObjectId>} options.interviewerIds Danh sách người phỏng vấn
 * @returns {Array<Object>} Mảng các slot chưa lưu
 */
interviewSlotSchema.statics.bulkGenerate = function ({
  campaignId,
  dates,
  startHour,
  endHour,
  durationMinutes,
  capacity,
  location,
  interviewerIds,
}) {
  const generatedSlots = [];
  const startTotalMinutes = startHour * 60;
  const endTotalMinutes = endHour * 60;

  for (const rawDate of dates) {
    const slotDate = new Date(rawDate);

    let currentMinutes = startTotalMinutes;
    while (currentMinutes + durationMinutes <= endTotalMinutes) {
      const startTimeStr = minutesToTime(currentMinutes);
      const endTimeStr = minutesToTime(currentMinutes + durationMinutes);

      generatedSlots.push({
        campaignId,
        date: slotDate,
        startTime: startTimeStr,
        endTime: endTimeStr,
        location,
        interviewerIds,
        capacity,
        bookedCount: 0,
        version: 0,
      });

      currentMinutes += durationMinutes;
    }
  }

  return generatedSlots;
};

const InterviewSlot = mongoose.model("InterviewSlot", interviewSlotSchema);

export default InterviewSlot;
