// Seed tài khoản admin (role bcn) đầu tiên — chạy: npm run seed:admin
// Đọc ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD từ .env. Idempotent:
// email đã tồn tại thì chỉ nâng quyền/kích hoạt, không tạo trùng, không đổi mật khẩu.
import dotenv from "dotenv";

dotenv.config();

const { connectDatabase, disconnectDatabase } =
  await import("../config/database.js");
const { default: User } = await import("../models/user.model.js");

const name = process.env.ADMIN_NAME || "IU Club Admin";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("[seed] Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong .env");
  process.exit(1);
}
if (password.length < 8) {
  console.error("[seed] ADMIN_PASSWORD phải từ 8 ký tự trở lên");
  process.exit(1);
}

await connectDatabase();

try {
  const existing = await User.findOne({ email: email.toLowerCase() });

  if (existing) {
    if (
      existing.role === "bcn" &&
      existing.status === "active" &&
      existing.emailVerified
    ) {
      console.log(`[seed] Admin đã tồn tại: ${existing.email} — bỏ qua`);
    } else {
      existing.role = "bcn";
      existing.status = "active";
      existing.emailVerified = true;
      await existing.save();
      console.log(`[seed] Đã nâng tài khoản ${existing.email} lên admin (bcn)`);
    }
  } else {
    const user = await User.create({
      name,
      email,
      password,
      role: "bcn",
      status: "active",
      emailVerified: true,
    });
    console.log(`[seed] Đã tạo admin: ${user.email} (role bcn)`);
  }
} finally {
  await disconnectDatabase();
}
