import mongoose from "mongoose";

export const TASK_ASSIGNMENT_STATUS = [
  "assigned",
  "submitted",
  "approved",
  "rejected",
];

// Bài nộp / tiến độ của từng trainee trong một task
const assignmentSchema = new mongoose.Schema(
  {
    traineeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trainee",
      required: true,
    },
    status: {
      type: String,
      enum: TASK_ASSIGNMENT_STATUS,
      default: "assigned",
    },
    submissionUrl: { type: String, default: "" },
    submissionNote: { type: String, default: "" },
    submittedAt: { type: Date, default: null },
    // Mentor chấm: nhận xét + điểm (thang 10), rejected thì trainee nộp lại được
    feedback: { type: String, default: "" },
    score: { type: Number, min: 0, max: 10, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { _id: false },
);

// Task mentor giao cho team trong vòng training
const trainingTaskSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingGroup",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    attachmentUrl: { type: String, default: "" },
    deadline: { type: Date, default: null },
    assignments: [assignmentSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, collection: "training_tasks" },
);

trainingTaskSchema.index({ groupId: 1, createdAt: -1 });
trainingTaskSchema.index({ "assignments.traineeId": 1 });

const TrainingTask = mongoose.model("TrainingTask", trainingTaskSchema);
export default TrainingTask;
