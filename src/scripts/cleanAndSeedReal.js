/**
 * Xóa toàn bộ data DB rồi seed Admin + danh sách thành viên thật.
 * Chạy: npm run seed:real
 *
 * Admin: ADMIN_* trong .env
 * Member: mật khẩu chung SEED_REAL_PASSWORD (mặc định IuClub@2026)
 */
import dotenv from "dotenv";

dotenv.config();

const { connectDatabase, disconnectDatabase } =
  await import("../config/database.js");
const { default: User } = await import("../models/user.model.js");
const { default: Trainee } = await import("../models/trainee.model.js");
const { default: TrainingProgram } =
  await import("../models/trainingProgram.model.js");
const { default: TrainingGroup } =
  await import("../models/trainingGroup.model.js");
const { default: TrainingTask } =
  await import("../models/trainingTask.model.js");
const { default: TrainingMessage } =
  await import("../models/trainingMessage.model.js");
const { default: ClubDepartment } =
  await import("../models/clubDepartment.model.js");
const { default: DepartmentMembershipEvent } = await import(
  "../models/departmentMembershipEvent.model.js"
);
const { default: DepartmentLeadershipEvent } = await import(
  "../models/departmentLeadershipEvent.model.js"
);
const { default: RecruitmentCampaign } = await import(
  "../models/recruitmentCampaign.model.js"
);
const { default: ApplicationForm } =
  await import("../models/applicationForm.model.js");
const { default: Application } =
  await import("../models/application.model.js");
const { default: ApplicationScore } =
  await import("../models/applicationScore.model.js");
const { default: InterviewSlot } =
  await import("../models/interviewSlot.model.js");
const { default: InterviewBooking } =
  await import("../models/interviewBooking.model.js");
const { default: SlotHold } = await import("../models/slotHold.model.js");
const { default: Notification } =
  await import("../models/notification.model.js");
const { default: Token } = await import("../models/token.model.js");
const { default: Counter } = await import("../models/counter.model.js");
const { default: EmailTemplate } =
  await import("../models/emailTemplate.model.js");

const SHARED_PASSWORD =
  process.env.SEED_REAL_PASSWORD || "IuClub@2026";

const ADMIN = {
  name: process.env.ADMIN_NAME || "IU Club Admin",
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
};

/** Chỉ các thành viên chính thức được cung cấp — không seed thêm fake/ứng viên. */
const MEMBERS = [
  {
    name: "Nguyễn Huy Hoàng",
    email: "hoang03072005@gmail.com",
    phone: "0989540702",
    studentId: "B23DCCC074",
    generation: "D23CQCC02-B",
  },
  {
    name: "Nguyễn Quang Đức",
    email: "quangduc2006nl@gmail.com",
    phone: "0866083137",
    studentId: "B24DCCC069",
    generation: "D24CQCC03-B",
  },
  {
    name: "An Văn Thành",
    email: "anvanthanh180406@gmail.com",
    phone: "0971548606",
    studentId: "B24DCCC249",
    generation: "D24CQCC03-B",
  },
  {
    name: "Tống Quang Việt",
    email: "quangviet790@gmail.com",
    phone: "0865088261",
    studentId: "B24DCCC288",
    generation: "B24CQCC06-B",
  },
  {
    name: "Trần Lê Minh Đức",
    email: "tranleminhduc1809@gmail.com",
    phone: "0985436542",
    studentId: "B24DCCC073",
    generation: "D24CQCC01-B",
  },
];

async function wipeAll() {
  const jobs = [
    ["TrainingMessage", TrainingMessage.deleteMany({})],
    ["TrainingTask", TrainingTask.deleteMany({})],
    ["TrainingGroup", TrainingGroup.deleteMany({})],
    ["TrainingProgram", TrainingProgram.deleteMany({})],
    ["Trainee", Trainee.deleteMany({})],
    ["ApplicationScore", ApplicationScore.deleteMany({})],
    ["InterviewBooking", InterviewBooking.deleteMany({})],
    ["SlotHold", SlotHold.deleteMany({})],
    ["InterviewSlot", InterviewSlot.deleteMany({})],
    ["Application", Application.deleteMany({})],
    ["ApplicationForm", ApplicationForm.deleteMany({})],
    ["RecruitmentCampaign", RecruitmentCampaign.deleteMany({})],
    ["DepartmentMembershipEvent", DepartmentMembershipEvent.deleteMany({})],
    ["DepartmentLeadershipEvent", DepartmentLeadershipEvent.deleteMany({})],
    ["ClubDepartment", ClubDepartment.deleteMany({})],
    ["Notification", Notification.deleteMany({})],
    ["Token", Token.deleteMany({})],
    ["Counter", Counter.deleteMany({})],
    ["EmailTemplate", EmailTemplate.deleteMany({})],
    ["User", User.deleteMany({})],
  ];

  console.log("[seed:real] Đang xóa toàn bộ collection…");
  for (const [label, promise] of jobs) {
    const res = await promise;
    console.log(`  - ${label}: ${res.deletedCount}`);
  }
}

async function createAdmin() {
  if (!ADMIN.email || !ADMIN.password) {
    throw new Error("Thiếu ADMIN_EMAIL hoặc ADMIN_PASSWORD trong .env");
  }
  if (ADMIN.password.length < 8) {
    throw new Error("ADMIN_PASSWORD phải từ 8 ký tự trở lên");
  }
  const user = await User.create({
    name: ADMIN.name,
    email: ADMIN.email.toLowerCase(),
    password: ADMIN.password,
    role: "bcn",
    roles: ["bcn"],
    status: "active",
    emailVerified: true,
    isActive: true,
    requirePasswordChange: false,
    isMentor: false,
    clubStatus: "active",
  });
  console.log(`[seed:real] Admin (bcn): ${user.email}`);
  return user;
}

async function createMember(m) {
  const user = await User.create({
    name: m.name,
    email: m.email.toLowerCase(),
    password: SHARED_PASSWORD,
    role: "member",
    roles: ["member"],
    status: "active",
    emailVerified: true,
    isActive: true,
    requirePasswordChange: false,
    isMentor: false,
    memberStatus: "official",
    clubStatus: "active",
    phone: m.phone || "",
    studentId: m.studentId || "",
    generation: m.generation || "",
  });
  console.log(
    `[seed:real] Member: ${user.email} | ${user.name} | ${user.studentId} | ${user.generation}`,
  );
  return user;
}

async function main() {
  if (SHARED_PASSWORD.length < 8) {
    throw new Error("SEED_REAL_PASSWORD phải từ 8 ký tự trở lên");
  }

  await connectDatabase();
  try {
    await wipeAll();
    await createAdmin();
    for (const m of MEMBERS) await createMember(m);

    // Template email mặc định (trống cũng được; seed để Admin Settings không rỗng)
    const emailTplService = await import("../services/emailTemplate.service.js");
    await emailTplService.ensureDefaultTemplates();

    console.log("\n========== DB sạch — chỉ Admin + 5 thành viên ==========");
    console.log(`Admin     ${ADMIN.email}  /  (ADMIN_PASSWORD trong .env)`);
    console.log(`Members mật khẩu chung: ${SHARED_PASSWORD}`);
    for (const m of MEMBERS) {
      console.log(`  ${m.email}  —  ${m.name}`);
    }
    console.log("Không còn Ban / đợt tuyển / hồ sơ / đội training / ứng viên cũ.");
    console.log("========================================================");
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (err) => {
  console.error("[seed:real]", err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
