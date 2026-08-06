/**
 * Tạo / reset tài khoản candidate để login portal (MK = DOB DDMMYYYY).
 * Chạy: node src/scripts/ensureTestCandidateLogin.js
 */
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import User from "../models/user.model.js";
import config from "../config/env.js";

const PASS_DOB = new Date("2006-05-15"); // 15052006

function passwordFromDob(dateOfBirth) {
  const d = new Date(dateOfBirth);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getFullYear()}`;
}

const ACCOUNTS = [
  {
    email: "lethithao.ptit@gmail.com",
    name: "Lê Thị Thảo (Pass test)",
    dateOfBirth: PASS_DOB,
  },
];

async function upsertCandidate({ email, name, dateOfBirth }) {
  const rawPassword = passwordFromDob(dateOfBirth);
  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.name = name;
    user.role = "candidate";
    user.roles = ["candidate"];
    user.status = "active";
    user.isActive = true;
    user.emailVerified = true;
    user.requirePasswordChange = true;
    user.password = rawPassword;
    await user.save();
    console.log(`UPDATED  ${email}  MK=${rawPassword}  requirePasswordChange=true`);
  } else {
    user = await User.create({
      name,
      email: email.toLowerCase(),
      password: rawPassword,
      role: "candidate",
      roles: ["candidate"],
      status: "active",
      emailVerified: true,
      requirePasswordChange: true,
    });
    console.log(`CREATED  ${email}  MK=${rawPassword}  requirePasswordChange=true`);
  }
  return { email, rawPassword, id: String(user._id) };
}

async function main() {
  await connectDatabase();
  const results = [];
  for (const a of ACCOUNTS) {
    results.push(await upsertCandidate(a));
  }

  const base = `http://127.0.0.1:${config.port}`;
  console.log("\n=== Thử login API ===");
  for (const r of results) {
    try {
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: r.email, password: r.rawPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(
          `LOGIN OK  ${r.email}  requirePasswordChange=${body?.data?.user?.requirePasswordChange ?? "?"}`,
        );
      } else {
        console.log(
          `LOGIN FAIL ${r.email}  HTTP ${res.status}  ${body?.message || JSON.stringify(body)}`,
        );
        console.log(
          `  (Nếu server chưa chạy: cd IU_Backend_WEB && npm run dev)`,
        );
      }
    } catch (err) {
      console.log(`LOGIN SKIP ${r.email} — BE chưa chạy: ${err.message}`);
      console.log(`  Mở: ${config.clientUrl}/login`);
      console.log(`  Email: ${r.email}`);
      console.log(`  Password: ${r.rawPassword}`);
    }
  }

  console.log(`\nPortal: ${config.clientUrl}/login`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
