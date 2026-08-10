import mongoose from "mongoose";

export const MEMBERSHIP_ACTIONS = ["assign", "transfer", "remove"];

const departmentMembershipEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClubDepartment",
      default: null,
    },
    action: { type: String, enum: MEMBERSHIP_ACTIONS, required: true },
    fromDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClubDepartment",
      default: null,
    },
    toDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClubDepartment",
      default: null,
    },
    reason: { type: String, default: "", trim: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    effectiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "department_membership_events" },
);

departmentMembershipEventSchema.index({ departmentId: 1, createdAt: -1 });

const DepartmentMembershipEvent = mongoose.model(
  "DepartmentMembershipEvent",
  departmentMembershipEventSchema,
);
export default DepartmentMembershipEvent;
