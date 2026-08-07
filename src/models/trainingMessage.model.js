import mongoose from "mongoose";

/** Tin nhắn trao đổi mentor ↔ tân binh trong kênh nhóm training */
const trainingMessageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingGroup",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: true, collection: "training_messages" },
);

trainingMessageSchema.index({ groupId: 1, createdAt: -1 });

const TrainingMessage = mongoose.model(
  "TrainingMessage",
  trainingMessageSchema,
);
export default TrainingMessage;
