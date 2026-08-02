import mongoose from "mongoose";

export const TOKEN_TYPES = {
  REFRESH: "refresh",
  VERIFY_EMAIL: "verify_email",
  RESET_PASSWORD: "reset_password",
};

const tokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Stored hashed (SHA-256), never raw.
    token: { type: String, required: true, index: true },
    type: { type: String, enum: Object.values(TOKEN_TYPES), required: true },
    expiresAt: { type: Date, required: true },
    blacklisted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// TTL: auto-remove expired docs.
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Token = mongoose.model("Token", tokenSchema);
export default Token;
