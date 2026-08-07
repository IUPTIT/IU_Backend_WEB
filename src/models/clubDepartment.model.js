import mongoose from "mongoose";

export const DEPT_STATUS = ["active", "paused"];

const clubDepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    description: { type: String, default: "", trim: true },
    /** Lĩnh vực phụ trách */
    field: { type: String, default: "", trim: true },
    headcountTarget: { type: Number, min: 0, default: null },
    status: { type: String, enum: DEPT_STATUS, default: "active" },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    /** Trưởng ban hiện tại (exactly 1 khi có) */
    headUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Thời điểm Ban mất Trưởng ban — cảnh báo nếu > 7 ngày */
    headVacantSince: { type: Date, default: null },
  },
  { timestamps: true, collection: "club_departments" },
);

clubDepartmentSchema.index({ status: 1, sortOrder: 1 });

const ClubDepartment = mongoose.model("ClubDepartment", clubDepartmentSchema);
export default ClubDepartment;
