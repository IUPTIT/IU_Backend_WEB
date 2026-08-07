import mongoose from "mongoose";

export const LEADERSHIP_ACTIONS = ["appoint", "revoke", "term_end"];
export const LEADERSHIP_TITLES = ["head"];

/** Appointment đang hiệu lực hoặc lịch sử nhiệm kỳ */
const departmentLeadershipEventSchema = new mongoose.Schema(
  {
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClubDepartment",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: { type: String, enum: LEADERSHIP_ACTIONS, required: true },
    title: { type: String, enum: LEADERSHIP_TITLES, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, default: null },
    termLabel: { type: String, default: "", trim: true },
    reason: { type: String, default: "", trim: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    /** true = đang giữ chức */
    isActive: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: "department_leadership_events" },
);

departmentLeadershipEventSchema.index({
  departmentId: 1,
  title: 1,
  isActive: 1,
});

const DepartmentLeadershipEvent = mongoose.model(
  "DepartmentLeadershipEvent",
  departmentLeadershipEventSchema,
);
export default DepartmentLeadershipEvent;
