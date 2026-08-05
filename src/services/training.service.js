import ApiError from "../utils/ApiError.js";
import TrainingProgram from "../models/trainingProgram.model.js";
import TrainingGroup from "../models/trainingGroup.model.js";
import Trainee from "../models/trainee.model.js";
import User from "../models/user.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";

// Tạo trainee từ hồ sơ ứng tuyển (idempotent theo userId) — gọi khi ứng viên
// ĐẠT PHỎNG VẤN: vòng training là vòng loại cuối trước khi thành member chính thức
export async function createTraineeFromApplication(application) {
  if (!application?.userId) return null;
  const campaign = application.campaignId
    ? await RecruitmentCampaign.findById(application.campaignId).select("name")
    : null;
  const department =
    [...(application.departmentPreferences ?? [])].sort(
      (a, b) => a.priority - b.priority,
    )[0]?.department ?? "Chưa phân ban";
  await Trainee.updateOne(
    { userId: application.userId },
    {
      $setOnInsert: {
        userId: application.userId,
        applicationId: application._id,
        campaignId: application.campaignId ?? null,
        fullName: application.fullName,
        email: application.email,
        department,
        status: "pending",
        evalStatus: "studying",
        cohortLabel: campaign ? `Tân binh — ${campaign.name}` : "Tân binh",
      },
    },
    { upsert: true },
  );
  return Trainee.findOne({ userId: application.userId });
}

// ---- Trainees ----

// Trainee xem vòng training của CHÍNH MÌNH: team, mentor, lộ trình
export async function getMyTraining(userId) {
  const trainee = await Trainee.findOne({ userId });
  if (!trainee) {
    throw ApiError.notFound("Bạn chưa ở vòng training");
  }
  const group = trainee.groupId
    ? await TrainingGroup.findById(trainee.groupId).populate(
        "mentorId",
        "name email",
      )
    : null;
  const program = group?.programId
    ? await TrainingProgram.findById(group.programId)
    : null;
  return { trainee, group, program };
}

export function listTrainees(department) {
  const filter = { status: { $ne: "removed" } };
  if (department) filter.department = department;
  return Trainee.find(filter)
    .sort({ createdAt: -1 })
    .populate({
      path: "groupId",
      select: "name mentorId",
      populate: { path: "mentorId", select: "name" },
    });
}

// Mentor thực thụ: member đã được đẩy quyền (isMentor) hoặc leader
export function listMentors() {
  return User.find({
    $or: [{ isMentor: true }, { role: "leader" }],
    role: { $in: ["leader", "member"] },
    isActive: { $ne: false },
  })
    .select("name email role isMentor")
    .sort({ name: 1 });
}

// Ứng viên mentor: mọi member/leader đang hoạt động kèm cờ isMentor để BCN bật/tắt
export function listMentorCandidates() {
  return User.find({
    role: { $in: ["leader", "member"] },
    isActive: { $ne: false },
  })
    .select("name email role isMentor")
    .sort({ name: 1 });
}

// Đẩy / hạ quyền mentor cho member
export async function setMentor(userId, isMentor) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("Không tìm thấy thành viên");
  if (!["member", "leader"].includes(user.role)) {
    throw ApiError.badRequest("Chỉ member/leader mới làm mentor được");
  }
  user.isMentor = Boolean(isMentor);
  await user.save();
  return user;
}

// Chia team TỰ ĐỘNG: random trộn tân binh chưa có team rồi chia đều cho các mentor.
// Mỗi team dùng LỘ TRÌNH RIÊNG của mentor đó (mentor tự tạo cách train của mình);
// mentor chưa có lộ trình thì dùng lộ trình fallback được chọn.
export async function autoAssignGroups(fallbackProgramId, createdBy) {
  const fallbackProgram = fallbackProgramId
    ? await getProgram(fallbackProgramId)
    : null;
  const mentors = await listMentors();
  if (!mentors.length) {
    throw ApiError.badRequest(
      "Chưa có mentor nào — đẩy quyền mentor cho member trước",
    );
  }
  const trainees = await Trainee.find({
    groupId: null,
    status: { $ne: "removed" },
  });
  if (!trainees.length) {
    throw ApiError.badRequest("Không có tân binh nào chưa được chia team");
  }

  // Fisher–Yates shuffle rồi chia round-robin → chênh lệch tối đa 1 người/team
  const shuffled = [...trainees];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const buckets = mentors.map(() => []);
  shuffled.forEach((t, i) => buckets[i % mentors.length].push(t));

  const groups = [];
  for (const [i, mentor] of mentors.entries()) {
    const members = buckets[i];
    if (!members.length) continue;

    // Lộ trình của chính mentor (mới nhất) — không có thì dùng fallback
    const mentorProgram = await TrainingProgram.findOne({
      createdBy: mentor._id,
    }).sort({
      createdAt: -1,
    });
    // Không có lộ trình nào cũng vẫn chia đội được — mentor gán lộ trình sau
    const program = mentorProgram ?? fallbackProgram;

    // Ban của team = ban phổ biến nhất trong nhóm
    const deptCount = new Map();
    for (const t of members) {
      deptCount.set(t.department, (deptCount.get(t.department) ?? 0) + 1);
    }
    const department =
      [...deptCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "Tổng hợp";

    const group = await TrainingGroup.create({
      name: `Team ${mentor.name}`,
      programId: program?._id ?? null,
      department,
      specialtyLabel: department,
      mentorId: mentor._id,
      memberIds: members.map((t) => t._id),
      mentorAccepted: true,
      createdBy,
    });
    await Trainee.updateMany(
      { _id: { $in: members.map((t) => t._id) } },
      { $set: { groupId: group._id, status: "in_progress" } },
    );
    groups.push(group);
  }

  return { groups, assigned: shuffled.length, mentors: mentors.length };
}

// ---- Programs (lộ trình) ----

export function listPrograms() {
  return TrainingProgram.find().sort({ createdAt: -1 });
}

export async function getProgram(id) {
  const program = await TrainingProgram.findById(id);
  if (!program) throw ApiError.notFound("Không tìm thấy lộ trình đào tạo");
  return program;
}

export function createProgram(data, createdBy) {
  return TrainingProgram.create({ ...data, createdBy });
}

// Xóa lộ trình: mentor chỉ xóa lộ trình của mình, BCN/Leader xóa được tất cả.
// Team đang dùng lộ trình này được gỡ về null (không chặn xóa) — mentor gán lại sau
export async function deleteProgram(id, user) {
  const program = await getProgram(id);
  const isManager = ["bcn", "leader"].includes(user.role);
  if (!isManager && String(program.createdBy) !== String(user.id)) {
    throw ApiError.forbidden("Bạn chỉ xóa được lộ trình do mình tạo");
  }
  await TrainingGroup.updateMany(
    { programId: program._id },
    { $set: { programId: null } },
  );
  await program.deleteOne();
}

// ---- Groups (chia team) ----

export function listGroups() {
  return TrainingGroup.find()
    .sort({ createdAt: -1 })
    .populate("mentorId", "name email role");
}

export async function createGroup(data, createdBy) {
  await getProgram(data.programId);

  // Trainee phải tồn tại và chưa thuộc team khác
  const trainees = await Trainee.find({ _id: { $in: data.memberIds } });
  if (trainees.length !== data.memberIds.length) {
    throw ApiError.badRequest("Danh sách trainee có thành viên không tồn tại");
  }
  const taken = trainees.filter((t) => t.groupId);
  if (taken.length) {
    throw ApiError.badRequest(
      `Trainee đã thuộc team khác: ${taken.map((t) => t.fullName).join(", ")}`,
    );
  }

  const group = await TrainingGroup.create({
    name: data.name,
    programId: data.programId,
    department: data.department,
    specialtyLabel: data.specialtyLabel ?? "",
    mentorId: data.mentorId ?? null,
    memberIds: data.memberIds,
    mentorAccepted: Boolean(data.mentorId),
    createdBy,
  });

  // Gán team + chuyển trạng thái sang "đang training"
  await Trainee.updateMany(
    { _id: { $in: data.memberIds } },
    { $set: { groupId: group._id, status: "in_progress" } },
  );

  return group.populate("mentorId", "name email role");
}

// ---- Đánh giá tổng kết ----

export async function getReviewSummary() {
  const [total, done, needs] = await Promise.all([
    Trainee.countDocuments({ status: { $ne: "removed" } }),
    Trainee.countDocuments({
      $or: [
        { evalStatus: { $in: ["qualified", "certified"] } },
        { status: "completed" },
      ],
    }),
    Trainee.countDocuments({ evalStatus: "failed" }),
  ]);
  return {
    totalTrainees: total,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    needsAction: needs,
  };
}

export async function updateEvalStatus(traineeId, evalStatus) {
  const trainee = await Trainee.findById(traineeId);
  if (!trainee) throw ApiError.notFound("Không tìm thấy trainee");
  trainee.evalStatus = evalStatus;
  if (evalStatus === "certified") trainee.status = "completed";
  await trainee.save();
  return trainee;
}

// Cấp chứng nhận hàng loạt — chỉ trainee đã "qualified"
export async function issueCertificates(traineeIds) {
  const result = await Trainee.updateMany(
    {
      _id: { $in: traineeIds },
      evalStatus: { $in: ["qualified", "certified"] },
    },
    { $set: { evalStatus: "certified", status: "completed" } },
  );
  return { issued: result.modifiedCount };
}
