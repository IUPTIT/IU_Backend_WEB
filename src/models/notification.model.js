import mongoose from "mongoose";

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
      enum: [
        "booking_reminder",
        "interview_result",
        "cv_result",
        "final_result",
        "booking_confirmed",
        "interview_assignment",
        "general",
      ],
      default: "general",
    },
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "notifications" },
);

notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
