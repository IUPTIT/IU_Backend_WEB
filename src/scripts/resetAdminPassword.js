// Script tạm: force-reset password admin theo .env
import dotenv from "dotenv";
dotenv.config();

const { connectDatabase, disconnectDatabase } =
  await import("../config/database.js");
const { default: User } = await import("../models/user.model.js");
import bcrypt from "bcryptjs";

const email = process.env.ADMIN_EMAIL;
const newPassword = process.env.ADMIN_PASSWORD;

if (!email || !newPassword) {
  console.error("[reset] Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong .env");
  process.exit(1);
}

await connectDatabase();

try {
  const hashed = await bcrypt.hash(newPassword, 12);
  const res = await User.updateOne(
    { email: email.toLowerCase() },
    {
      $set: {
        password: hashed,
        role: "bcn",
        status: "active",
        emailVerified: true,
      },
    },
  );
  if (res.modifiedCount > 0) {
    console.log(`[reset] ✅ Đã reset password cho: ${email}`);
  } else {
    console.log(`[reset] ⚠️  Không tìm thấy user: ${email}`);
  }
} finally {
  await disconnectDatabase();
}
