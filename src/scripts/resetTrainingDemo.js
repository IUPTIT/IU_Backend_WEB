/**
 * DEPRECATED — tạo member/trainee @example.com. Dùng npm run seed:real.
 * Chỉ chạy khi ALLOW_FAKE_SEED=1.
 */
import dotenv from "dotenv";

dotenv.config();

if (process.env.ALLOW_FAKE_SEED !== "1") {
  console.error(
    "[reset:training-demo] Đã tắt. Dùng `npm run seed:real`.\n" +
      "Muốn chạy demo cũ: ALLOW_FAKE_SEED=1 npm run reset:training-demo",
  );
  process.exit(1);
}

/**
 * Reset demo data for the Training Teams screen.
 *
 * Keeps BCN accounts, removes all other users and all training data, then creates:
 * - 3 official club members (mentor candidates)
 * - 3 trainees linked to candidate accounts
 * - 1 active recruitment campaign so the UI campaign filter loads the trainees
 *
 * Run: ALLOW_FAKE_SEED=1 npm run reset:training-demo
 */
const { connectDatabase, disconnectDatabase } =
  await import("../config/database.js");
const { default: User } = await import("../models/user.model.js");
const { default: Trainee } = await import("../models/trainee.model.js");
const { default: TrainingGroup } =
  await import("../models/trainingGroup.model.js");
const { default: TrainingProgram } =
  await import("../models/trainingProgram.model.js");
const { default: TrainingTask } =
  await import("../models/trainingTask.model.js");
const { default: TrainingMessage } =
  await import("../models/trainingMessage.model.js");
const { default: RecruitmentCampaign } =
  await import("../models/recruitmentCampaign.model.js");
const { default: Token } = await import("../models/token.model.js");
const { default: Notification } =
  await import("../models/notification.model.js");
const { default: ClubDepartment } =
  await import("../models/clubDepartment.model.js");
const { default: DepartmentMembershipEvent } =
  await import("../models/departmentMembershipEvent.model.js");
const { default: DepartmentLeadershipEvent } =
  await import("../models/departmentLeadershipEvent.model.js");

const PASSWORD = "Demo@12345";
const CAMPAIGN_NAME = "Training Demo - 3 Tan binh";

async function createUser(data) {
  return User.create({
    ...data,
    password: PASSWORD,
    status: "active",
    emailVerified: true,
    isActive: true,
    requirePasswordChange: false,
    clubStatus: "active",
    department: "",
    departmentId: null,
  });
}

async function main() {
  await connectDatabase();

  const removableUsers = await User.find({
    $nor: [{ role: "bcn" }, { roles: "bcn" }],
  }).select("_id");
  const removableUserIds = removableUsers.map((user) => user._id);

  await Promise.all([
    TrainingMessage.deleteMany({}),
    TrainingTask.deleteMany({}),
    TrainingGroup.deleteMany({}),
    TrainingProgram.deleteMany({}),
    Trainee.deleteMany({}),
    Token.deleteMany({ user: { $in: removableUserIds } }),
    Notification.deleteMany({ userId: { $in: removableUserIds } }),
    DepartmentMembershipEvent.deleteMany({ userId: { $in: removableUserIds } }),
    DepartmentLeadershipEvent.deleteMany({ userId: { $in: removableUserIds } }),
  ]);
  await ClubDepartment.updateMany(
    { headUserId: { $in: removableUserIds } },
    { $set: { headUserId: null, headVacantSince: new Date() } },
  );
  await User.deleteMany({ _id: { $in: removableUserIds } });

  await RecruitmentCampaign.updateMany(
    { status: "open" },
    { $set: { status: "closed" } },
  );
  await RecruitmentCampaign.deleteMany({ name: CAMPAIGN_NAME });

  const admin = await User.findOne({
    $or: [{ role: "bcn" }, { roles: "bcn" }],
  });
  if (!admin) {
    throw new Error("BCN account is required. Run npm run seed:admin first.");
  }

  const now = Date.now();
  const campaign = await RecruitmentCampaign.create({
    name: CAMPAIGN_NAME,
    description: "Minimal demo data for the Training Teams screen.",
    openAt: new Date(now - 24 * 60 * 60 * 1000),
    closeAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    quotas: [{ department: "Training Demo", quota: 3 }],
    status: "open",
    createdBy: admin._id,
  });

  const clubMembers = [];
  for (let index = 1; index <= 3; index += 1) {
    clubMembers.push(
      await createUser({
        name: `Member CLB ${index}`,
        email: `member${index}@example.com`,
        role: "member",
        roles: ["member"],
        memberStatus: "official",
        isMentor: false,
      }),
    );
  }

  const trainees = [];
  for (let index = 1; index <= 3; index += 1) {
    const user = await createUser({
      name: `Tan binh ${index}`,
      email: `trainee${index}@example.com`,
      role: "candidate",
      roles: ["candidate"],
      memberStatus: "training",
      isMentor: false,
    });
    trainees.push(
      await Trainee.create({
        userId: user._id,
        campaignId: campaign._id,
        fullName: user.name,
        email: user.email,
        department: "Training Demo",
        status: "pending",
        evalStatus: "studying",
        groupId: null,
        cohortLabel: "Training Demo",
      }),
    );
  }

  console.log("Training demo reset complete:");
  console.log(` - Club members: ${clubMembers.length}`);
  console.log(` - Trainees: ${trainees.length}`);
  console.log(` - Campaign: ${campaign.name}`);
  console.log(` - Password: ${PASSWORD}`);
}

try {
  await main();
} finally {
  await disconnectDatabase();
}
