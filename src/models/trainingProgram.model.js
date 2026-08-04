import mongoose from "mongoose";

export const LESSON_KINDS = ["doc", "video", "practice"];

const stageSchema = new mongoose.Schema(
  {
    // Slug id do FE sinh — giữ nguyên để lessons tham chiếu
    stageId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true },
    weekLabel: { type: String, default: "" },
    durationWeeks: { type: Number, default: null },
  },
  { _id: false },
);

const lessonSchema = new mongoose.Schema(
  {
    lessonId: { type: String, required: true },
    stageId: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, default: "" },
    attachmentUrl: { type: String, default: "" },
    kind: { type: String, enum: [...LESSON_KINDS, null], default: null },
    durationLabel: { type: String, default: "" },
  },
  { _id: false },
);

const trainingProgramSchema = new mongoose.Schema(
  {
    // Tên lộ trình đào tạo (VD: "Lộ trình Ban Chuyên môn K20")
    name: { type: String, required: true, trim: true },
    // Ban áp dụng — dùng tên ban thống nhất với quotas của đợt tuyển
    department: { type: String, required: true, trim: true },
    stages: { type: [stageSchema], default: [] },
    lessons: { type: [lessonSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "training_programs" },
);

trainingProgramSchema.index({ department: 1 });

const TrainingProgram = mongoose.model("TrainingProgram", trainingProgramSchema);
export default TrainingProgram;
