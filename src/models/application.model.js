import mongoose from "mongoose";

// Vòng đời hồ sơ (phụ lục tài liệu nghiệp vụ)
export const APPLICATION_STATUS = [
  "pending", // Chờ xét duyệt
  "passed_screening", // Đạt vòng đơn
  "failed_screening", // Không đạt vòng đơn
  "passed_interview", // Đạt phỏng vấn
  "failed_interview", // Không đạt phỏng vấn
  "accepted", // Trúng tuyển
  "rejected", // Không trúng tuyển
  "withdrawn", // Đã rút đơn
];

const applicationSchema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    code: { type: String, required: true, unique: true }, // VD: APP-2026F-0142

    // Trường cố định của form (nghiệp vụ phần 0.2)
    fullName: { type: String, required: true, trim: true },
    studentId: { type: String, required: true, trim: true },
    className: { type: String, required: true, trim: true },
    faculty: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    nationalId: { type: String, required: true, trim: true }, // CCCD 12 số
    dateOfBirth: { type: Date, required: true }, // dùng sinh password tài khoản Ứng viên
    // TODO: upload thật (multer/cloudinary) — hiện lưu URL/tên file
    avatarUrl: { type: String, default: "" },
    cvUrl: { type: String, default: "" },
    // Ban nguyện vọng theo thứ tự ưu tiên, tối đa 3
    wishes: {
      type: [String],
      validate: [(v) => v.length >= 1 && v.length <= 3, "1-3 wishes required"],
    },
    // Trả lời câu hỏi riêng của đợt tuyển: { [questionId]: string | string[] }
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },

    status: { type: String, enum: APPLICATION_STATUS, default: "pending" },
    note: { type: String, default: "" }, // nhận xét gửi kèm khi thông báo kết quả
  },
  { timestamps: true },
);

// Một email chỉ nộp 1 hồ sơ trong cùng đợt tuyển
applicationSchema.index({ campaign: 1, email: 1 }, { unique: true });

applicationSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Application = mongoose.model("Application", applicationSchema);
export default Application;
