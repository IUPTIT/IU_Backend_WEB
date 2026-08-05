import ApiError from "../utils/ApiError.js";
import TrainingProgram from "../models/trainingProgram.model.js";
import TrainingGroup from "../models/trainingGroup.model.js";
import Trainee from "../models/trainee.model.js";
import User from "../models/user.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";

// Tạo trainee từ hồ sơ ứng tuyển (idempotent theo userId) — gọi khi TRÚNG TUYỂN
// (admitted): bàn giao sang luồng Đào tạo thành viên mới theo nghiệp vụ Phần 4
export async function createTraineeFromApplication(application) {
  if (!application?.userId) return null;
  const campaign = application.campaignId
    ? await RecruitmentCampaign.findById(application.campaignId).select("name")
    : null;
  // Ban chính thức: assignedDepartment (BCN có thể đổi sang NV2) hoặc NV ưu tiên cao nhất
  const department =
    application.assignedDepartment ||
    [...(application.departmentPreferences ?? [])].sort(
      (a, b) => a.priority - b.priority,
    )[0]?.department ||
    "Chưa phân ban";
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
  // Đồng bộ member_status = Đang training (Ch.2.4)
  await User.updateOne(
    { _id: application.userId, role: "member" },
    { $set: { memberStatus: "training" } },
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
  // Fallback: team chưa gắn lộ trình thì lấy lộ trình mới nhất của mentor —
  // mentor thêm/sửa/xóa lộ trình là mentee thấy bản mới ngay
  let program = group?.programId
    ? await TrainingProgram.findById(group.programId)
    : null;
  if (!program && group?.mentorId) {
    program = await TrainingProgram.findOne({
      createdBy: group.mentorId._id ?? group.mentorId,
    }).sort({ createdAt: -1 });
  }
  return { trainee, group, program };
}

export function listTrainees(department, campaignId) {
  const filter = { status: { $ne: "removed" } };
  if (department) filter.department = department;
  if (campaignId) filter.campaignId = campaignId;
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
export async function autoAssignGroups(
  fallbackProgramId,
  createdBy,
  campaignId,
) {
  const fallbackProgram = fallbackProgramId
    ? await getProgram(fallbackProgramId)
    : null;
  const mentors = await listMentors();
  if (!mentors.length) {
    throw ApiError.badRequest(
      "Chưa có mentor nào — đẩy quyền mentor cho member trước",
    );
  }
  // Chia đội theo ĐỢT TUYỂN: chỉ trộn tân binh của đợt được chọn
  const traineeFilter = { groupId: null, status: { $ne: "removed" } };
  if (campaignId) traineeFilter.campaignId = campaignId;
  const trainees = await Trainee.find(traineeFilter);
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

    // Đợt tuyển của team = đợt của các thành viên (campaignId truyền vào ưu tiên)
    const groupCampaignId =
      campaignId ?? members.find((t) => t.campaignId)?.campaignId ?? null;

    const group = await TrainingGroup.create({
      name: `Team ${mentor.name}`,
      programId: program?._id ?? null,
      campaignId: groupCampaignId,
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
    const populated = await group.populate("mentorId", "name email role");
    await notifyGroupAssignment(populated, members);
    groups.push(populated);
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

export async function createProgram(data, createdBy) {
  const program = await TrainingProgram.create({ ...data, createdBy });
  // Lộ trình mới nhất của mentor tự áp cho các team mentor đang dẫn —
  // mentee thấy update ngay, không phải chờ chia đội lại
  await TrainingGroup.updateMany(
    { mentorId: createdBy },
    { $set: { programId: program._id } },
  );
  return program;
}

/** Cập nhật lộ trình (BCN mọi lộ trình; mentor chỉ của mình) — UC 35 */
export async function updateProgram(id, data, user) {
  const program = await getProgram(id);
  const isManager = ["bcn", "leader"].includes(user.role);
  if (!isManager && String(program.createdBy) !== String(user.id)) {
    throw ApiError.forbidden("Bạn chỉ sửa được lộ trình do mình tạo");
  }
  const fields = ["name", "department", "stages", "lessons", "passThresholdPercent"];
  for (const key of fields) {
    if (data[key] !== undefined) program[key] = data[key];
  }
  await program.save();
  return program;
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

  // Team vừa mất lộ trình rơi về lộ trình mới nhất còn lại của mentor đó (nếu có)
  const orphans = await TrainingGroup.find({
    programId: null,
    mentorId: { $ne: null },
  });
  for (const group of orphans) {
    const latest = await TrainingProgram.findOne({
      createdBy: group.mentorId,
    }).sort({ createdAt: -1 });
    if (latest) {
      group.programId = latest._id;
      await group.save();
    }
  }
}

// ---- Groups (chia team) ----

export function listGroups(campaignId) {
  const filter = {};
  if (campaignId) filter.campaignId = campaignId;
  return TrainingGroup.find(filter)
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

  const populated = await group.populate("mentorId", "name email role");
  await notifyGroupAssignment(populated, trainees);
  return populated;
}

/** Email + in-app khi được chia nhóm / gán mentor (UC 39) */
async function notifyGroupAssignment(group, trainees) {
  const [emailService, notificationService] = await Promise.all([
    import("./email.service.js"),
    import("./notification.service.js"),
  ]);
  const mentorName = group.mentorId?.name ?? "Mentor sẽ được phân công sau";
  for (const t of trainees) {
    if (t.email) {
      await emailService.sendTrainingGroupAssignedEmail(t, group, mentorName);
    }
    if (t.userId) {
      await notificationService.createNotification({
        userId: t.userId,
        title: "Bạn đã được chia nhóm training",
        body: `Nhóm: ${group.name}. Mentor: ${mentorName}. Vào Training của tôi để xem lộ trình và task.`,
        type: "general",
        link: "/member/training/roadmap",
      });
    }
  }
}

/** Chỉnh sửa nhóm: mentor, thành viên, lộ trình (UC 37–38) */
export async function updateGroup(id, data, user) {
  const group = await TrainingGroup.findById(id);
  if (!group) throw ApiError.notFound("Không tìm thấy nhóm training");

  const isManager = ["bcn", "leader"].includes(user.role);
  if (!isManager && String(group.mentorId) !== String(user.id)) {
    throw ApiError.forbidden("Bạn không có quyền sửa nhóm này");
  }

  if (data.name !== undefined) group.name = data.name;
  if (data.programId !== undefined) {
    if (data.programId) await getProgram(data.programId);
    group.programId = data.programId || null;
  }
  if (data.department !== undefined) group.department = data.department;
  if (data.specialtyLabel !== undefined) {
    group.specialtyLabel = data.specialtyLabel;
  }

  let newlyAssigned = [];
  if (data.memberIds !== undefined) {
    const trainees = await Trainee.find({ _id: { $in: data.memberIds } });
    if (trainees.length !== data.memberIds.length) {
      throw ApiError.badRequest("Danh sách trainee có thành viên không tồn tại");
    }
    const taken = trainees.filter(
      (t) => t.groupId && String(t.groupId) !== String(group._id),
    );
    if (taken.length) {
      throw ApiError.badRequest(
        `Trainee đã thuộc team khác: ${taken.map((t) => t.fullName).join(", ")}`,
      );
    }
    const prev = new Set(group.memberIds.map(String));
    newlyAssigned = trainees.filter((t) => !prev.has(String(t._id)));

    // Gỡ trainee không còn trong nhóm
    await Trainee.updateMany(
      { groupId: group._id, _id: { $nin: data.memberIds } },
      { $set: { groupId: null, status: "pending" } },
    );
    await Trainee.updateMany(
      { _id: { $in: data.memberIds } },
      { $set: { groupId: group._id, status: "in_progress" } },
    );
    group.memberIds = data.memberIds;
  }

  if (data.mentorId !== undefined) {
    group.mentorId = data.mentorId || null;
    group.mentorAccepted = Boolean(data.mentorId);
  }

  await group.save();
  const populated = await group.populate("mentorId", "name email role");

  if (newlyAssigned.length || data.mentorId !== undefined) {
    const notifyList =
      newlyAssigned.length > 0
        ? newlyAssigned
        : await Trainee.find({ _id: { $in: group.memberIds } });
    await notifyGroupAssignment(populated, notifyList);
  }

  return populated;
}

/** Gửi lại thông báo phân nhóm (UC 39 — thao tác thủ công) */
export async function resendGroupNotifications(groupIds) {
  let sent = 0;
  for (const gid of groupIds) {
    const group = await TrainingGroup.findById(gid).populate(
      "mentorId",
      "name email role",
    );
    if (!group) continue;
    const trainees = await Trainee.find({
      _id: { $in: group.memberIds },
      status: { $ne: "removed" },
    });
    await notifyGroupAssignment(group, trainees);
    sent += trainees.length;
  }
  return { sent };
}

/** Tiến độ task của trainee hiện tại */
export async function getMyProgress(userId) {
  const TrainingTask = (await import("../models/trainingTask.model.js"))
    .default;
  const trainee = await Trainee.findOne({ userId });
  if (!trainee) throw ApiError.notFound("Bạn chưa ở vòng training");

  const tasks = await TrainingTask.find({
    "assignments.traineeId": trainee._id,
  });
  let completedTasks = 0;
  const totalTasks = tasks.length;
  for (const task of tasks) {
    const mine = task.assignments.find(
      (a) => String(a.traineeId) === String(trainee._id),
    );
    if (mine && (mine.status === "approved" || mine.status === "submitted")) {
      completedTasks += 1;
    }
  }
  const approvedOnly = tasks.filter((task) => {
    const mine = task.assignments.find(
      (a) => String(a.traineeId) === String(trainee._id),
    );
    return mine?.status === "approved";
  }).length;

  return {
    traineeId: trainee._id,
    percentComplete: totalTasks
      ? Math.round((approvedOnly / totalTasks) * 100)
      : 0,
    completedTasks: approvedOnly,
    totalTasks,
    submittedOrDone: completedTasks,
    evalStatus: trainee.evalStatus,
    status: trainee.status,
  };
}

/**
 * UC 42: nhắc lần cuối / gia hạn 1 lần / loại khỏi CLB
 * action: final_reminder | extend_once | remove_from_club
 */
export async function handleIncompleteTrainee(
  traineeId,
  { action, reason },
  actor,
) {
  const trainee = await Trainee.findById(traineeId);
  if (!trainee) throw ApiError.notFound("Không tìm thấy trainee");
  if (!reason?.trim()) throw ApiError.badRequest("Vui lòng nhập lý do");

  const [emailService, notificationService] = await Promise.all([
    import("./email.service.js"),
    import("./notification.service.js"),
  ]);

  if (action === "final_reminder") {
    await emailService.sendTrainingIncompleteReminderEmail(
      trainee,
      reason.trim(),
    );
    if (trainee.userId) {
      await notificationService.createNotification({
        userId: trainee.userId,
        title: "Nhắc hoàn thành training",
        body: reason.trim(),
        type: "general",
        link: "/member/training/progress",
      });
    }
    return { action, trainee };
  }

  if (action === "extend_once") {
    if (trainee.extendedOnce) {
      throw ApiError.badRequest(
        "Tân binh này đã được gia hạn 1 lần — không gia hạn thêm",
      );
    }
    const TrainingTask = (await import("../models/trainingTask.model.js"))
      .default;
    const EXTEND_DAYS = 7;
    const tasks = await TrainingTask.find({
      "assignments.traineeId": trainee._id,
    });
    const base = Date.now();
    for (const task of tasks) {
      if (!task.deadline) continue;
      const current = new Date(task.deadline).getTime();
      task.deadline = new Date(Math.max(current, base) + EXTEND_DAYS * 86400000);
      task.deadlineReminderSentAt = null;
      await task.save();
    }
    trainee.extendedOnce = true;
    trainee.extendedAt = new Date();
    if (trainee.evalStatus === "failed") trainee.evalStatus = "studying";
    await trainee.save();

    if (trainee.userId) {
      await notificationService.createNotification({
        userId: trainee.userId,
        title: "Đã gia hạn deadline training",
        body: `${reason.trim()} (thêm ${EXTEND_DAYS} ngày — chỉ 1 lần)`,
        type: "general",
        link: "/member/training/progress",
      });
      try {
        await emailService.sendTrainingIncompleteReminderEmail(
          trainee,
          `Đã gia hạn thêm ${EXTEND_DAYS} ngày. ${reason.trim()}`,
        );
      } catch (err) {
        console.warn("[training] extend email failed:", err.message);
      }
    }
    return { action, trainee, extendedDays: EXTEND_DAYS };
  }

  if (action === "remove_from_club") {
    trainee.status = "removed";
    trainee.evalStatus = "failed";
    trainee.groupId = null;
    await trainee.save();

    // Gỡ khỏi memberIds các nhóm
    await TrainingGroup.updateMany(
      { memberIds: trainee._id },
      { $pull: { memberIds: trainee._id } },
    );

    if (trainee.userId) {
      const user = await User.findById(trainee.userId);
      if (user && user.role === "member") {
        user.isActive = false;
        user.status = "disabled";
        await user.save();
        const tokenService = await import("./token.service.js");
        await tokenService.revokeAllRefreshTokens(user.id);
      }
      await notificationService.createNotification({
        userId: trainee.userId,
        title: "Bạn đã bị loại khỏi chương trình training",
        body: reason.trim(),
        type: "general",
        link: null,
      });
    }
    return { action, trainee, removedBy: actor.id };
  }

  throw ApiError.badRequest("Hình thức xử lý không hợp lệ");
}

/** Mentor xác nhận hoàn thành training (UC Leader #7) — gửi đánh giá lên BCN */
export async function confirmTrainingCompletion(traineeId, note, user) {
  return saveMentorReview(
    traineeId,
    {
      note: note ?? "",
      submit: true,
    },
    user,
  );
}

// ---- Chat nhóm training (UC Member #7) ----

async function assertGroupChatAccess(groupId, user) {
  const group = await TrainingGroup.findById(groupId);
  if (!group) throw ApiError.notFound("Không tìm thấy nhóm training");
  if (["bcn", "leader"].includes(user.role)) return group;
  if (String(group.mentorId) === String(user.id)) return group;
  const trainee = await Trainee.findOne({ userId: user.id });
  if (
    trainee &&
    group.memberIds.some((id) => String(id) === String(trainee._id))
  ) {
    return group;
  }
  throw ApiError.forbidden("Bạn không thuộc nhóm training này");
}

export async function listGroupMessages(groupId, user, { limit = 50 } = {}) {
  const TrainingMessage = (
    await import("../models/trainingMessage.model.js")
  ).default;
  await assertGroupChatAccess(groupId, user);
  return TrainingMessage.find({ groupId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .populate("senderId", "name role");
}

export async function postGroupMessage(groupId, content, user) {
  const TrainingMessage = (
    await import("../models/trainingMessage.model.js")
  ).default;
  const group = await assertGroupChatAccess(groupId, user);
  const text = String(content || "").trim();
  if (!text) throw ApiError.badRequest("Nội dung tin nhắn không được trống");
  if (text.length > 4000) {
    throw ApiError.badRequest("Tin nhắn tối đa 4000 ký tự");
  }
  const senderId = user._id ?? user.id;
  const msg = await TrainingMessage.create({
    groupId,
    senderId,
    content: text,
  });

  // In-app notify các thành viên khác trong nhóm (không gửi cho người gửi)
  try {
    const notificationService = await import("./notification.service.js");
    const User = (await import("../models/user.model.js")).default;
    const mentorUid = group.mentorId
      ? String(group.mentorId._id ?? group.mentorId)
      : null;
    const recipientIds = new Set();
    if (mentorUid) recipientIds.add(mentorUid);
    const trainees = await Trainee.find({
      _id: { $in: group.memberIds },
      status: { $ne: "removed" },
    }).select("userId");
    for (const t of trainees) {
      if (t.userId) recipientIds.add(String(t.userId));
    }
    recipientIds.delete(String(senderId));

    const users = await User.find({
      _id: { $in: [...recipientIds] },
    }).select("role isMentor");
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    const senderName = user.name || "Thành viên";
    for (const uid of recipientIds) {
      const u = byId.get(uid);
      let link = "/member/training/progress";
      if (mentorUid && uid === mentorUid) {
        if (u?.role === "leader") link = "/leader/training/groups";
        else link = "/member/mentor/tasks";
      } else if (u?.role === "leader") {
        link = "/leader/training/groups";
      }
      await notificationService.createNotification({
        userId: uid,
        title: `Tin nhắn mới — ${group.name}`,
        body: `${senderName}: ${preview}`,
        type: "training_chat",
        link,
      });
    }
  } catch (err) {
    console.warn("[training] chat notify failed:", err.message);
  }

  return msg.populate("senderId", "name role");
}

// ---- Đánh giá tổng kết ----

export async function getReviewSummary(campaignId) {
  const base = campaignId ? { campaignId } : {};
  const [total, done, needs] = await Promise.all([
    Trainee.countDocuments({ ...base, status: { $ne: "removed" } }),
    Trainee.countDocuments({
      ...base,
      $or: [
        { evalStatus: { $in: ["qualified", "certified"] } },
        { status: "completed" },
      ],
    }),
    Trainee.countDocuments({ ...base, evalStatus: "failed" }),
  ]);
  return {
    totalTrainees: total,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    needsAction: needs,
  };
}

// Tân binh trong các team user đang dẫn (mentor xem team mình để đánh giá)
export async function listMyTeamTrainees(userId) {
  const groups = await TrainingGroup.find({ mentorId: userId }).select("_id");
  return Trainee.find({
    groupId: { $in: groups.map((g) => g._id) },
    status: { $ne: "removed" },
  })
    .sort({ fullName: 1 })
    .populate("groupId", "name");
}

// Mentor lưu đánh giá QUÁ TRÌNH (note + điểm) cho tân binh team mình —
// không đụng evalStatus (Đạt/Trượt là quyết định của BCN)
export async function saveMentorReview(
  traineeId,
  { score, note, submit },
  user,
) {
  const trainee = await Trainee.findById(traineeId);
  if (!trainee) throw ApiError.notFound("Không tìm thấy trainee");

  if (!["bcn", "leader"].includes(user.role)) {
    const group = trainee.groupId
      ? await TrainingGroup.findById(trainee.groupId).select("mentorId")
      : null;
    if (!group || String(group.mentorId) !== String(user.id)) {
      throw ApiError.forbidden("Tân binh này không thuộc team của bạn");
    }
  }

  if (score !== undefined) trainee.mentorScore = score;
  if (note !== undefined) trainee.mentorNote = note;
  // submit=true → gửi kết quả lên BCN; không thì vẫn là nháp của mentor
  if (submit) {
    trainee.mentorReviewStatus = "submitted";
    trainee.mentorReviewSubmittedAt = new Date();
  }
  await trainee.save();
  return trainee;
}

// Chốt Đạt/Trượt vòng đào tạo thành viên mới — chỉ BCN.
// Trúng tuyển (admitted) đã xảy ra trước khi vào training; không admit lại từ đây.
export async function updateEvalStatus(traineeId, evalStatus) {
  const trainee = await Trainee.findById(traineeId);
  if (!trainee) throw ApiError.notFound("Không tìm thấy trainee");

  if (evalStatus === "qualified") {
    const { percent, threshold } =
      await getTraineePassProgress(trainee);
    if (percent < threshold) {
      throw ApiError.badRequest(
        `Chưa đạt ngưỡng hoàn thành ${threshold}% task (hiện ${percent}%)`,
      );
    }
  }

  trainee.evalStatus = evalStatus;
  if (evalStatus === "certified") {
    trainee.status = "completed";
    if (!trainee.certificateCode) {
      trainee.certificateCode = buildCertificateCode(trainee._id);
      trainee.certificateIssuedAt = new Date();
    }
    if (trainee.userId) {
      await User.updateOne(
        { _id: trainee.userId },
        { $set: { memberStatus: "official" } },
      );
    }
  }
  await trainee.save();
  return trainee;
}

function buildCertificateCode(traineeId) {
  const year = new Date().getFullYear();
  const suffix = String(traineeId).slice(-6).toUpperCase();
  return `IU-CERT-${year}-${suffix}`;
}

/** % task approved + ngưỡng từ lộ trình nhóm (mặc định 80) */
async function getTraineePassProgress(trainee) {
  const TrainingTask = (await import("../models/trainingTask.model.js"))
    .default;
  const tasks = await TrainingTask.find({
    "assignments.traineeId": trainee._id,
  });
  const total = tasks.length;
  const approved = tasks.filter((task) => {
    const mine = task.assignments.find(
      (a) => String(a.traineeId) === String(trainee._id),
    );
    return mine?.status === "approved";
  }).length;
  const percent = total ? Math.round((approved / total) * 100) : 0;

  let threshold = 80;
  if (trainee.groupId) {
    const group = await TrainingGroup.findById(trainee.groupId).select(
      "programId",
    );
    if (group?.programId) {
      const program = await TrainingProgram.findById(group.programId).select(
        "passThresholdPercent",
      );
      if (program?.passThresholdPercent != null) {
        threshold = program.passThresholdPercent;
      }
    }
  }
  return { percent, threshold, approved, total };
}

// Cấp chứng nhận hàng loạt — chỉ trainee đã "qualified"
export async function issueCertificates(traineeIds) {
  const trainees = await Trainee.find({
    _id: { $in: traineeIds },
    evalStatus: { $in: ["qualified", "certified"] },
  });
  let issued = 0;
  const notificationService = await import("./notification.service.js");
  for (const trainee of trainees) {
    const code =
      trainee.certificateCode || buildCertificateCode(trainee._id);
    trainee.evalStatus = "certified";
    trainee.status = "completed";
    trainee.certificateCode = code;
    trainee.certificateIssuedAt = trainee.certificateIssuedAt || new Date();
    await trainee.save();

    if (trainee.userId) {
      await User.updateOne(
        { _id: trainee.userId },
        { $set: { memberStatus: "official" } },
      );
      try {
        await notificationService.createNotification({
          userId: trainee.userId,
          title: "Đã cấp chứng nhận training",
          body: `Mã chứng nhận: ${code}. Bạn đã là thành viên chính thức.`,
          type: "general",
          link: "/member/training/progress",
        });
      } catch (err) {
        console.warn("[training] cert notify failed:", err.message);
      }
    }
    issued += 1;
  }
  return { issued };
}
