import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// candidate = Ứng viên (tự tạo khi Pass vòng đơn) — chỉ xem hồ sơ, đặt lịch PV
export const ROLES = ["bcn", "leader", "member", "candidate"];
export const USER_STATUS = ["pending", "active", "disabled"];
/** Trạng thái phụ Member (Ch.2.4) — không phải Role */
export const MEMBER_STATUS = ["training", "official"];
/** Trạng thái hoạt động trong CLB (roster) — tách với login status */
export const CLUB_STATUS = ["active", "inactive", "alumni"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Optional: Google-only accounts have no local password.
    password: { type: String, select: false },
    googleId: { type: String, index: { unique: true, sparse: true } },
    /** Primary portal role (bcn/leader/member/candidate) */
    role: { type: String, enum: ROLES, default: "member" },
    /** Additive capabilities — luôn gồm `role`; dual Member+Leader = ["member","leader"] */
    roles: {
      type: [{ type: String, enum: ROLES }],
      default: undefined,
    },
    status: { type: String, enum: USER_STATUS, default: "pending" },
    // Khi có member trong roles: Đang training → Chính thức (Ch.2.4)
    memberStatus: {
      type: String,
      enum: MEMBER_STATUS,
      required: false,
    },
    emailVerified: { type: Boolean, default: false },
    avatar: { type: String, default: "" },
    requirePasswordChange: { type: Boolean, default: false },
    sourceApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      default: null,
    },
    isActive: { type: Boolean, default: true },
    isMentor: { type: Boolean, default: false },
    // Denormalized tên ban (cache) — nguồn chính là departmentId
    department: { type: String, trim: true, default: "" },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClubDepartment",
      default: null,
    },
    departmentJoinedAt: { type: Date, default: null },
    phone: { type: String, trim: true, default: "" },
    bio: { type: String, trim: true, default: "", maxlength: 200 },
    studentId: { type: String, trim: true, default: "" },
    generation: { type: String, trim: true, default: "" },
    clubStatus: {
      type: String,
      enum: CLUB_STATUS,
      default: "active",
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ role: 1, clubStatus: 1 });
userSchema.index({ roles: 1 });
userSchema.index({ departmentId: 1 });

userSchema.pre("save", async function hashPassword(next) {
  if (!this.roles?.length && this.role) {
    this.roles = [this.role];
  }
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(plain, this.password);
};

userSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.password;
    delete ret.__v;
    if (!ret.roles?.length && ret.role) ret.roles = [ret.role];
    return ret;
  },
});

const User = mongoose.model("User", userSchema);
export default User;
