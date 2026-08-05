import mongoose from "mongoose";

export const TRAINEE_STATUS = [
  "pending",
  "in_progress",
  "completed",
  "removed",
];
export const TRAINEE_EVAL_STATUS = [
  "studying",
  "qualified",
  "failed",
  "certified",
];

// Tân thành viên trong vòng training — tự tạo khi ứng viên TRÚNG TUYỂN (admitted)
const traineeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      default: null,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecruitmentCampaign",
      default: null,
    },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // Ban chính thức (mặc định = nguyện vọng 1 của hồ sơ)
    department: { type: String, required: true, trim: true },
    status: { type: String, enum: TRAINEE_STATUS, default: "pending" },
    evalStatus: {
      type: String,
      enum: TRAINEE_EVAL_STATUS,
      default: "studying",
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingGroup",
      default: null,
    },
    cohortLabel: { type: String, default: "" },
  },
  { timestamps: true, collection: "trainees" },
);

traineeSchema.index({ department: 1, status: 1 });

const Trainee = mongoose.model("Trainee", traineeSchema);
export default Trainee;
