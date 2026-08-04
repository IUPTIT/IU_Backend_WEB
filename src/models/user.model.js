import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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
    require_password_change: { type: Boolean, default: false },
    sourceApplicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isActive: 1 });

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
