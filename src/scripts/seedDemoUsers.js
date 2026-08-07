/**
 * DEPRECATED — dữ liệu @example.com. Hệ thống dùng email thật: npm run seed:real
 * Chỉ chạy được khi ALLOW_FAKE_SEED=1.
 */
import dotenv from "dotenv";

dotenv.config();

if (process.env.ALLOW_FAKE_SEED !== "1") {
  console.error(
    "[seed:demo] Đã tắt. Dùng `npm run seed:real` (email thật).\n" +
      "Muốn chạy demo cũ: ALLOW_FAKE_SEED=1 npm run seed:demo",
  );
  process.exit(1);
}

/**
 * Seed tài khoản demo + dữ liệu training tối thiểu (idempotent).
 * Chạy: ALLOW_FAKE_SEED=1 npm run seed:demo
 *
 * Tài khoản (mật khẩu chung: Demo@12345):
 *   bcn      → lấy từ ADMIN_* trong .env (hoặc tạo nếu thiếu)
 *   leader@example.com
 *   mentor@example.com   (member + isMentor)
 *   trainee1@example.com … trainee3@example.com
 */
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

const DEMO_PASSWORD = "Demo@12345";

const ACCOUNTS = [
  {
    key: "leader",
    name: "Demo Leader",
    email: "leader@example.com",
    role: "leader",
    isMentor: true,
  },
  {
    key: "mentor",
    name: "Demo Mentor",
    email: "mentor@example.com",
    role: "member",
    isMentor: true,
  },
  {
    key: "trainee1",
    name: "Tân binh Demo 1",
    email: "trainee1@example.com",
    role: "member",
    isMentor: false,
  },
  {
    key: "trainee2",
    name: "Tân binh Demo 2",
    email: "trainee2@example.com",
    role: "member",
    isMentor: false,
  },
  {
    key: "trainee3",
    name: "Tân binh Demo 3",
    email: "trainee3@example.com",
    role: "member",
    isMentor: false,
  },
  {
    key: "candidate",
    name: "Ứng viên Demo",
    email: "candidate@example.com",
    role: "candidate",
    isMentor: false,
  },
];

async function upsertUser({ name, email, role, isMentor }) {
  const existing = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );
  if (existing) {
    existing.name = name;
    existing.role = role;
    existing.status = "active";
    existing.emailVerified = true;
    existing.isActive = true;
    existing.requirePasswordChange = false;
    existing.isMentor = Boolean(isMentor);
    existing.password = DEMO_PASSWORD;
    await existing.save();
    return existing;
  }
  return User.create({
    name,
    email,
    password: DEMO_PASSWORD,
    role,
    status: "active",
    emailVerified: true,
    isActive: true,
    requirePasswordChange: false,
    isMentor: Boolean(isMentor),
  });
}

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD || DEMO_PASSWORD;
  const name = process.env.ADMIN_NAME || "IU Club Admin";
  if (!email) {
    console.warn("[seed:demo] Không có ADMIN_EMAIL — bỏ qua seed BCN từ .env");
    return null;
  }
  const existing = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );
  if (existing) {
    existing.role = "bcn";
    existing.status = "active";
    existing.emailVerified = true;
    existing.isActive = true;
    existing.requirePasswordChange = false;
    // Giữ mật khẩu hiện tại nếu đã có; chỉ set lại khi env yêu cầu seed lại
    if (process.env.SEED_RESET_ADMIN_PASSWORD === "1") {
      existing.password = password;
    }
    await existing.save();
    console.log(`[seed:demo] BCN sẵn sàng: ${existing.email}`);
    return existing;
  }
  const user = await User.create({
    name,
    email,
    password,
    role: "bcn",
    status: "active",
    emailVerified: true,
    isActive: true,
  });
  console.log(`[seed:demo] Đã tạo BCN: ${user.email}`);
  return user;
}

await connectDatabase();

try {
  const admin = await ensureAdmin();
  const users = {};
  for (const acc of ACCOUNTS) {
    users[acc.key] = await upsertUser(acc);
    console.log(`[seed:demo] ${acc.role}${acc.isMentor ? "+mentor" : ""}: ${acc.email}`);
  }

  const mentor = users.mentor;
  const leader = users.leader;
  const traineeUsers = [users.trainee1, users.trainee2, users.trainee3];

  // Lộ trình demo (mentor tạo)
  let program = await TrainingProgram.findOne({
    name: "Lộ trình Demo Ban Chuyên môn",
    createdBy: mentor._id,
  });
  if (!program) {
    program = await TrainingProgram.create({
      name: "Lộ trình Demo Ban Chuyên môn",
      department: "Ban Chuyên môn",
      createdBy: mentor._id,
      stages: [
        {
          stageId: "st-demo-1",
          name: "Giai đoạn 1: Hội nhập",
          order: 1,
          weekLabel: "2 Tuần",
          durationWeeks: 2,
        },
        {
          stageId: "st-demo-2",
          name: "Giai đoạn 2: Thực hành",
          order: 2,
          weekLabel: "3 Tuần",
          durationWeeks: 3,
        },
      ],
      lessons: [
        {
          lessonId: "les-demo-1",
          stageId: "st-demo-1",
          title: "Văn hóa CLB",
          content: "Giới thiệu quy tắc và văn hóa IU Club",
          kind: "doc",
          durationLabel: "30 phút",
        },
        {
          lessonId: "les-demo-2",
          stageId: "st-demo-2",
          title: "Git cơ bản",
          content: "Clone, commit, push",
          kind: "practice",
          durationLabel: "1 giờ",
        },
      ],
    });
    console.log(`[seed:demo] Tạo lộ trình: ${program.name}`);
  } else {
    console.log(`[seed:demo] Lộ trình đã có: ${program.name}`);
  }

  // Trainee records
  const trainees = [];
  for (const [i, u] of traineeUsers.entries()) {
    let t = await Trainee.findOne({ userId: u._id });
    if (!t) {
      t = await Trainee.create({
        userId: u._id,
        fullName: u.name,
        email: u.email,
        department: "Ban Chuyên môn",
        status: "pending",
        evalStatus: "studying",
        cohortLabel: "Tân binh — Demo K20",
      });
    } else {
      t.fullName = u.name;
      t.email = u.email;
      t.department = "Ban Chuyên môn";
      if (t.status === "removed") t.status = "pending";
      await t.save();
    }
    trainees.push(t);
    console.log(`[seed:demo] Trainee: ${t.email}`);
  }

  // Nhóm training
  let group = await TrainingGroup.findOne({
    name: "Team Demo Mentor",
    mentorId: mentor._id,
  });
  if (!group) {
    group = await TrainingGroup.create({
      name: "Team Demo Mentor",
      programId: program._id,
      department: "Ban Chuyên môn",
      specialtyLabel: "Ban Chuyên môn",
      mentorId: mentor._id,
      memberIds: trainees.map((t) => t._id),
      mentorAccepted: true,
      createdBy: admin?._id ?? leader._id,
    });
  } else {
    group.programId = program._id;
    group.memberIds = trainees.map((t) => t._id);
    group.mentorId = mentor._id;
    group.mentorAccepted = true;
    await group.save();
  }

  await Trainee.updateMany(
    { _id: { $in: trainees.map((t) => t._id) } },
    { $set: { groupId: group._id, status: "in_progress" } },
  );
  console.log(`[seed:demo] Nhóm: ${group.name} (${trainees.length} TV)`);

  // Task demo
  let task = await TrainingTask.findOne({
    groupId: group._id,
    title: "Task Demo: Giới thiệu bản thân",
  });
  if (!task) {
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    task = await TrainingTask.create({
      groupId: group._id,
      title: "Task Demo: Giới thiệu bản thân",
      description: "Viết đoạn giới thiệu và nộp link Drive/GitHub.",
      deadline,
      createdBy: mentor._id,
      assignments: trainees.map((t) => ({
        traineeId: t._id,
        status: "assigned",
      })),
    });
    console.log(`[seed:demo] Task: ${task.title}`);
  } else {
    console.log(`[seed:demo] Task đã có: ${task.title}`);
  }

  console.log("\n========== TÀI KHOẢN DEMO ==========");
  if (admin) {
    console.log(
      `BCN      ${admin.email}  /  (mật khẩu trong .env ADMIN_PASSWORD)`,
    );
  }
  console.log(`Leader   leader@example.com     /  ${DEMO_PASSWORD}`);
  console.log(`Mentor   mentor@example.com     /  ${DEMO_PASSWORD}`);
  console.log(`Trainee  trainee1@example.com   /  ${DEMO_PASSWORD}`);
  console.log(`Trainee  trainee2@example.com   /  ${DEMO_PASSWORD}`);
  console.log(`Trainee  trainee3@example.com   /  ${DEMO_PASSWORD}`);
  console.log(`Candidate candidate@example.com /  ${DEMO_PASSWORD}`);
  console.log("====================================\n");
} finally {
  await disconnectDatabase();
}
