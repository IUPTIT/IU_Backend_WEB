import mongoose from "mongoose";

export const AUTOMATION_TIMINGS = [
  "immediate",
  "delay_after_event",
  "before_deadline",
  "before_slot",
];

export const AUTOMATION_UNITS = ["days", "hours"];

/** Catalog eventKey — ổn định trong code; Admin không đổi key */
export const AUTOMATION_EVENT_KEYS = [
  "cv_pass",
  "cv_fail",
  "book_slot_remind",
  "booking_confirmed",
  "interview_remind",
  "interview_pass",
  "interview_fail",
  "final_pass",
  "final_fail",
  "welcome_member",
];

const emailAutomationRuleSchema = new mongoose.Schema(
  {
    eventKey: {
      type: String,
      required: true,
      enum: AUTOMATION_EVENT_KEYS,
      index: true,
    },
    /** Phân biệt nhiều rule cùng event (vd. nhắc 24h vs 2h) */
    ruleKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    enabled: { type: Boolean, default: true },
    templateSlug: { type: String, required: true, trim: true },
    timing: {
      type: String,
      enum: AUTOMATION_TIMINGS,
      default: "immediate",
    },
    timingValue: { type: Number, default: 0, min: 0 },
    timingUnit: {
      type: String,
      enum: AUTOMATION_UNITS,
      default: "days",
    },
    /** Tham số phụ: bookingWindowDays, … */
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    sortOrder: { type: Number, default: 100 },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

emailAutomationRuleSchema.index({ eventKey: 1, enabled: 1 });

const EmailAutomationRule = mongoose.model(
  "EmailAutomationRule",
  emailAutomationRuleSchema,
);

export default EmailAutomationRule;
