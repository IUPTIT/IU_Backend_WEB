import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// candidate = Ứng viên (tự tạo khi Pass vòng đơn) — chỉ xem hồ sơ, đặt lịch PV
export const ROLES = ["bcn", "leader", "member", "candidate"];
export const USER_STATUS = ["pending", "active", "disabled"];

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
    role: { type: String, enum: ROLES, default: "member" },
    status: { type: String, enum: USER_STATUS, default: "pending" },
    emailVerified: { type: Boolean, default: false },
    avatar: { type: String, default: "" },
    // Bắt buộc đổi mật khẩu ở lần đăng nhập đầu (tài khoản Ứng viên sinh tự động,
    // password mặc định là ngày sinh DDMMYYYY) — không cho bỏ qua.
    requirePasswordChange: { type: Boolean, default: false },
  },
  { timestamps: true },
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(plain, this.password);
};

// Strip sensitive fields from JSON output.
userSchema.set("toJSON", {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);
export default User;
