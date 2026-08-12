/**
 * Tạo / reset tài khoản candidate để login portal (MK = DOB DDMMYYYY).
 * Chạy: node src/scripts/ensureTestCandidateLogin.js
 */
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import User from "../models/user.model.js";
import Application from "../models/application.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";
import ApplicationForm from "../models/applicationForm.model.js";
import ClubDepartment from "../models/clubDepartment.model.js";
import config from "../config/env.js";
import { passwordFromDob } from "../jobs/createCandidateAccount.job.js";

const PASS_DOB = "2006-05-15"; // → MK 15052006

const ACCOUNTS = [
  {
    email: "candidate.passtest@gmail.com",
    name: "Ung vien Pass Test",
    dateOfBirth: PASS_DOB,
  },
];

/** Quotas đợt tuyển = danh sách Ban trong hệ thống (select NV ăn theo Ban) */
async function quotasFromDepartments() {
  const deps = await ClubDepartment.find().sort({ name: 1 }).select("name").lean();
  if (!deps.length) {
    return [{ department: "Chuyên môn", quota: 10 }];
  }
  return deps.map((d) => ({ department: d.name, quota: 10 }));
}

async function syncFormDepartmentOptions(campaign) {
  const form = await ApplicationForm.findOne({ campaignId: campaign._id });
  if (!form) {
    await ApplicationForm.create({
      campaignId: campaign._id,
      fields: ApplicationForm.seedFixedFields(campaign.quotas),
      publishedAt: new Date(),
    });
    return;
  }
  if (form.isLocked) {
    // Đã có hồ sơ — FE public dùng campaign.quotas, không bắt buộc sửa form
    console.warn(
      "[seed] Form đã khóa — bỏ qua sync options Ban; quotas đợt vẫn cập nhật.",
    );
    return;
  }
  const deptField = form.fields.find((f) => f.fieldId === "department_preferences");
  if (deptField) {
    deptField.options = campaign.quotas.map((q) => q.department);
    form.markModified("fields");
    await form.save();
  }
}

async function ensureCampaign(adminId) {
  const quotas = await quotasFromDepartments();
  let campaign = await RecruitmentCampaign.findOne().sort({ createdAt: -1 });
  if (!campaign) {
    campaign = await RecruitmentCampaign.create({
      name: "Dot test dat lich PV",
      description: "Seed cho candidate login",
      openAt: new Date(Date.now() - 86400000),
      closeAt: new Date(Date.now() + 30 * 86400000),
      status: "open",
      quotas,
      createdBy: adminId,
    });
  } else {
    // Đồng bộ quotas theo Ban hiện có — select NV public luôn khớp Ban
    campaign.quotas = quotas;
    await campaign.save();
  }
  await syncFormDepartmentOptions(campaign);
  return campaign;
}

async function upsertCandidate({ email, name, dateOfBirth }, adminId) {
  const rawPassword = passwordFromDob(dateOfBirth);
  const campaign = await ensureCampaign(adminId);

  let application = await Application.findOne({
    email: email.toLowerCase(),
    campaignId: campaign._id,
  });
  if (!application) {
    application = await Application.create({
      campaignId: campaign._id,
      fullName: name,
      email: email.toLowerCase(),
      phone: "0901234567",
      studentId: "B24TEST001",
      className: "D24CQCC01",
      faculty: "CNTT",
      dateOfBirth: new Date(dateOfBirth),
      status: "passed_cv",
      departmentPreferences: [{ department: "Chuyen mon", priority: 1 }],
      applicationCode: `TEST-${Date.now().toString(36).toUpperCase()}`,
      submittedAt: new Date(),
    });
  } else {
    application.status = "passed_cv";
    application.dateOfBirth = new Date(dateOfBirth);
    application.fullName = name;
    await application.save();
  }

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
    user.sourceApplicationId = application._id;
    await user.save();
    console.log(
      `UPDATED  ${email}  MK=${rawPassword}  requirePasswordChange=true`,
    );
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
      sourceApplicationId: application._id,
    });
    console.log(
      `CREATED  ${email}  MK=${rawPassword}  requirePasswordChange=true`,
    );
  }

  application.userId = user._id;
  await application.save();

  return { email, rawPassword, id: String(user._id) };
}

async function main() {
  await connectDatabase();
  const admin = await User.findOne({ role: "bcn" });
  if (!admin) {
    throw new Error("Chua co admin — chay npm run seed:admin truoc");
  }
  const results = [];
  for (const a of ACCOUNTS) {
    results.push(await upsertCandidate(a, admin._id));
  }

  const base = `http://127.0.0.1:${config.port}`;
  console.log("\n=== Thu login API ===");
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
      }
    } catch (err) {
      console.log(`LOGIN SKIP ${r.email} — BE chua chay: ${err.message}`);
    }
  }

  console.log(`\nPortal: ${config.clientUrl}/login`);
  console.log(`Email: ${ACCOUNTS[0].email}`);
  console.log(`Password (DOB): ${passwordFromDob(PASS_DOB)}`);
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
