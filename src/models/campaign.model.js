import mongoose from "mongoose";

// Vòng đời đợt tuyển: Nháp → Đang mở → Đã đóng → Đã hoàn tất
export const CAMPAIGN_STATUS = ["draft", "open", "closed", "completed"];

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "file",
  "scale",
];

const questionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    options: { type: [String], default: undefined },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: true },
);

const quotaSchema = new mongoose.Schema(
  {
    team: { type: String, required: true, trim: true },
    count: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    openAt: { type: Date, required: true },
    closeAt: { type: Date, required: true },
    // Chỉ tiêu theo từng ban — danh sách ban của đợt tuyển suy ra từ đây
    quotas: {
      type: [quotaSchema],
      validate: [(v) => v.length > 0, "At least one team quota is required"],
    },
    status: { type: String, enum: CAMPAIGN_STATUS, default: "draft" },
    customQuestions: { type: [questionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

campaignSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

const Campaign = mongoose.model("Campaign", campaignSchema);
export default Campaign;
