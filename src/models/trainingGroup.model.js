import mongoose from "mongoose";

// Team training — mỗi team 1 mentor (member/leader được đẩy lên dẫn dắt)
const trainingGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingProgram",
      required: true,
    },
    department: { type: String, required: true, trim: true },
    specialtyLabel: { type: String, default: "" },
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Trainee" }],
    mentorAccepted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "training_groups" },
);

trainingGroupSchema.index({ department: 1 });
trainingGroupSchema.index({ mentorId: 1 });

const TrainingGroup = mongoose.model("TrainingGroup", trainingGroupSchema);
export default TrainingGroup;
