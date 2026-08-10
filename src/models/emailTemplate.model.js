import mongoose from "mongoose";

export const EMAIL_TEMPLATE_CATEGORIES = [
  "recruitment",
  "training",
  "general",
  "event",
];
export const EMAIL_TEMPLATE_STATUSES = ["active", "inactive"];

const emailTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: EMAIL_TEMPLATE_CATEGORIES,
      default: "general",
    },
    subject: { type: String, required: true, trim: true, maxlength: 500 },
    body: { type: String, required: true, default: "" },
    status: {
      type: String,
      enum: EMAIL_TEMPLATE_STATUSES,
      default: "active",
    },
    /** Ổn định cho FE seed (tpl-passed, …) — unique sparse */
    slug: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
      default: undefined,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

emailTemplateSchema.index({ category: 1, status: 1 });

const EmailTemplate = mongoose.model("EmailTemplate", emailTemplateSchema);
export default EmailTemplate;
