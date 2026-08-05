import mongoose from "mongoose";

export const APPLICATION_STATUS = [
  "draft",
  "pending_review",
  "passed_cv",
  "failed_cv",
  "passed_interview",
  "failed_interview",
  "admitted",
  "rejected",
];

const departmentPreferenceSchema = new mongoose.Schema(
  {
    // Tên ban nguyện vọng
    department: { type: String, required: true, trim: true },

    // Thứ tự ưu tiên nguyện vọng (1, 2, hoặc 3)
    priority: {
      type: Number,
      required: true,
      min: [1, "Thứ tự ưu tiên tối thiểu là 1"],
      max: [3, "Thứ tự ưu tiên tối đa là 3"],
    },
  },
  { _id: false },
);

const answerSchema = new mongoose.Schema(
  {
    // ID của trường trong form tương ứng (slug fieldId)
    fieldId: { type: String, required: true, trim: true },

    // Giá trị câu trả lời (có thể là String, Number, Array...)
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const applicationSchema = new mongoose.Schema(
  {
    // Mã hồ sơ duy nhất (Format: APP-{campaignShortCode}-{4 số}, VD: APP-2026F-0142)
    // Sinh tự động ở service khi submit, null khi ở trạng thái nháp (draft)
    applicationCode: {
      type: String,
      default: null,
      trim: true,
    },

    // ID đợt tuyển tương ứng (RecruitmentCampaign)
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecruitmentCampaign",
      required: true,
    },

    // Trạng thái hồ sơ
    status: {
      type: String,
      enum: APPLICATION_STATUS,
      default: "draft",
    },

    // Email ứng viên (dùng để tra cứu + làm username tài khoản sau này)
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Email không đúng định dạng"],
    },

    // Họ và tên ứng viên
    fullName: {
      type: String,
      trim: true,
      required: function () {
        return this.status !== "draft";
      },
    },

    // Mã số sinh viên
    studentId: {
      type: String,
      trim: true,
      required: function () {
        return this.status !== "draft";
      },
    },

    // Lớp sinh hoạt
    className: {
      type: String,
      trim: true,
      required: function () {
        return this.status !== "draft";
      },
    },

    // Khoa / Ngành học
    faculty: {
      type: String,
      trim: true,
      required: function () {
        return this.status !== "draft";
      },
    },

    // Số điện thoại (10 chữ số)
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (val) {
          if (!val) return true;
          return /^[0-9]{10}$/.test(val);
        },
        message: "Số điện thoại phải có đúng 10 chữ số",
      },
    },

    // Ngày sinh (phải là ngày trong quá khứ và đủ tối thiểu 15 tuổi)
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function (val) {
          if (!val) return true;
          const today = new Date();
          if (val > today) return false;

          // Kiểm tra tuổi tối thiểu 15
          const minAgeDate = new Date(
            today.getFullYear() - 15,
            today.getMonth(),
            today.getDate(),
          );
          return val <= minAgeDate;
        },
        message:
          "Ngày sinh không được là ngày tương lai và ứng viên phải đủ tối thiểu 15 tuổi",
      },
    },

    // Đường dẫn ảnh đại diện
    avatarUrl: { type: String, default: "" },

    // Đường dẫn file CV (PDF/DOCX)
    cvUrl: { type: String, default: "" },

    // Danh sách ban nguyện vọng (tối đa 3, priority không trùng lặp)
    departmentPreferences: {
      type: [departmentPreferenceSchema],
      validate: [
        {
          validator: function (arr) {
            if (!arr) return true;
            return arr.length <= 3;
          },
          message: "Tối đa chỉ được chọn 3 ban nguyện vọng",
        },
        {
          validator: function (arr) {
            if (!arr || arr.length === 0) return true;
            const priorities = arr.map((p) => p.priority);
            return new Set(priorities).size === priorities.length;
          },
          message:
            "Thứ tự ưu tiên (priority) các ban nguyện vọng không được trùng nhau",
        },
      ],
    },

    // Các câu trả lời chi tiết cho các trường linh hoạt trong form
    answers: { type: [answerSchema], default: [] },

    // Bản hash của draft token gửi qua email cho Guest để tiếp tục điền đơn nháp
    draftTokenHash: { type: String, default: null },

    // Thời gian hết hạn của token lưu nháp
    draftExpiresAt: { type: Date, default: null },

    // Thời điểm ứng viên chính thức submit hồ sơ
    submittedAt: { type: Date, default: null },

    // Cờ đánh dấu cần BCN xem xét thủ công (khi chênh lệch điểm 2 reviewer > 30%)
    needsManualReview: { type: Boolean, default: false },

    // Trạng thái xử lý SAU kết quả cuối: chờ / đã gửi email KQ / đã chuyển Member
    resultNotifyStatus: {
      type: String,
      enum: ["pending", "email_sent", "converted"],
      default: "pending",
    },

    // Ban sinh hoạt chính thức khi trúng tuyển (mặc định = NV1; BCN có thể đổi sang NV2/NV3)
    assignedDepartment: {
      type: String,
      default: null,
      trim: true,
    },

    // Người được phân công chấm vòng đơn (1–n) — tránh thiên vị
    reviewerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },

    // Đã gửi email nhắc chưa đặt lịch phỏng vấn
    bookingReminderSentAt: {
      type: Date,
      default: null,
    },

    // Đã gửi email thông báo kết quả vòng phỏng vấn
    interviewResultNotifiedAt: {
      type: Date,
      default: null,
    },

    // ID của tài khoản User được tạo sau khi ứng viên Pass vòng đơn
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, collection: "applications" },
);

// Indexes
applicationSchema.index({ campaignId: 1, email: 1 });
// Partial thay vì sparse: sparse vẫn index giá trị null (draft nào cũng null → E11000),
// partial chỉ index khi applicationCode là string thật sự
applicationSchema.index(
  { applicationCode: 1 },
  {
    unique: true,
    partialFilterExpression: { applicationCode: { $type: "string" } },
  },
);
applicationSchema.index({ status: 1, campaignId: 1 });

/**
 * Static method kiểm tra xem email đã có hồ sơ nào chính thức (status != 'draft')
 * trong cùng đợt tuyển này chưa.
 */
applicationSchema.statics.hasActiveSubmittedApplication = async function (
  campaignId,
  email,
) {
  const count = await this.countDocuments({
    campaignId,
    email: email.toLowerCase().trim(),
    status: { $ne: "draft" },
  });
  return count > 0;
};

/**
 * Instance method kiểm tra hồ sơ có được phép chỉnh sửa / rút đơn hay không.
 * Điều kiện: status === 'pending_review' AND đợt tuyển chưa đóng đơn.
 * (Chặn thêm khi đã có điểm chấm — kiểm tra ở service vì cần query ApplicationScore)
 *
 * @param {Date} [campaignCloseAt] Thời gian đóng đơn của đợt tuyển (nếu chưa populate campaignId)
 * @returns {boolean}
 */
applicationSchema.methods.canEdit = function (campaignCloseAt = null) {
  if (this.status !== "pending_review") return false;

  const closeAt =
    campaignCloseAt || (this.campaignId && this.campaignId.closeAt);
  if (closeAt && new Date() > new Date(closeAt)) {
    return false;
  }

  return true;
};

const Application = mongoose.model("Application", applicationSchema);

// Đồng bộ index với DB (xóa các index cũ không còn trong Schema như code_1)
Application.syncIndexes().catch((err) => {
  console.warn("[Application Model] Sync indexes warning:", err.message);
});

export default Application;
