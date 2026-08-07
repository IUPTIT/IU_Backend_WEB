import mongoose from "mongoose";

export const NOTIFICATION_TYPES = [
  "booking_reminder",
  "interview_result",
  "cv_result",
  "final_result",
  "booking_confirmed",
  "interview_assignment",
  "training_chat",
  "department_assigned",
  "department_transferred",
  "department_removed",
  "leader_appointed",
  "leader_revoked",
  "general",
];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      default: "general",
    },
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "notifications" },
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
