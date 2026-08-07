import ApiError from "../utils/ApiError.js";
import TrainingProgram from "../models/trainingProgram.model.js";
import TrainingGroup from "../models/trainingGroup.model.js";
import Trainee from "../models/trainee.model.js";
import User from "../models/user.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";
import { hasRole, mongoRoleIn } from "../utils/roles.js";

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
  // Tân binh vẫn role candidate — không gán memberStatus (chỉ dùng khi đã Member)
  await User.updateOne(
    { _id: application.userId },
    { $unset: { memberStatus: 1 } },
  );
  // Gắn departmentId nếu Ban đã có trong danh mục
  try {
    const { syncUserDepartmentFromName } = await import("./department.service.js");
    await syncUserDepartmentFromName(application.userId, department);
  } catch (err) {
    console.warn("[training] sync departmentId failed:", err.message);
  }
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

export async function listTrainees(department, campaignId, user) {
  const filter = { status: { $ne: "removed" } };
  if (department) filter.department = department;
  if (campaignId) filter.campaignId = campaignId;
  if (user?.role !== "bcn" && user?.isMentor) {
    const groups = await TrainingGroup.find({ mentorId: user.id }).select("_id");
    filter.groupId = { $in: groups.map((group) => group._id) };
  }
  return Trainee.find(filter)
    .sort({ createdAt: -1 })
    .populate({
      path: "groupId",
      select: "name mentorId",
      populate: { path: "mentorId", select: "name" },
    });
}

// Pool thành viên chính thức để BCN chọn làm Mentor training.
export function listMentors() {
  return User.find({
    ...mongoRoleIn(["member", "leader"]),
    isActive: { $ne: false },
    clubStatus: "active",
    $or: [
      { memberStatus: "official" },
      { role: "leader" },
      { roles: "leader" },
    ],
  })
    .select("name email role roles isMentor memberStatus")
    .sort({ name: 1 });
}

// Danh sách TV CLB để BCN chọn làm Mentor training.
export function listMentorCandidates() {
  return listMentors();
}

// Mentor training là quyền độc lập, không liên quan role Leader Ban.
export async function setMentor(userId, isMentor) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("Không tìm thấy thành viên");
  if (!hasRole(user, "member") && !hasRole(user, "leader")) {
    throw ApiError.badRequest("Chỉ thành viên CLB mới làm Mentor training được");
  }
  user.isMentor = Boolean(isMentor);
  if (!user.isMentor) {
    await TrainingGroup.updateMany(
      { mentorId: user._id },
      { $set: { mentorId: null, mentorAccepted: false } },
    );
  }
  await user.save();
  return user;
}

// ---- Programs (lộ trình) ----

export function listPrograms(user) {
  // Mentor chỉ thấy lộ trình của mình; BCN xem tất cả để gắn đội (read-only).
  const filter = hasRole(user, "bcn") ? {} : { createdBy: user.id };
  return TrainingProgram.find(filter).sort({ createdAt: -1 });
}

export async function getProgram(id) {
  const program = await TrainingProgram.findById(id);
  if (!program) throw ApiError.notFound("Không tìm thấy lộ trình đào tạo");
  return program;
}

export async function createProgram(data, user) {
  if (!user?.isMentor) {
    throw ApiError.forbidden("Chỉ Mentor training được tạo lộ trình");
  }
  const createdBy = user.id;
  const program = await TrainingProgram.create({ ...data, createdBy });
  // Lộ trình mới nhất của mentor tự áp cho các team đang dẫn
  await TrainingGroup.updateMany(
    { mentorId: createdBy },
    { $set: { programId: program._id } },
  );
  return program;
}

/** Mentor chỉ cập nhật lộ trình do chính mình tạo. */
export async function updateProgram(id, data, user) {
  const program = await getProgram(id);
  if (!user?.isMentor || String(program.createdBy) !== String(user.id)) {
    throw ApiError.forbidden("Bạn chỉ sửa được lộ trình do mình tạo");
  }
  const fields = ["name", "department", "stages", "lessons", "passThresholdPercent"];
  for (const key of fields) {
    if (data[key] !== undefined) program[key] = data[key];
  }
  await program.save();
  return program;
}

// Mentor chỉ xóa lộ trình của mình.
export async function deleteProgram(id, user) {
  const program = await getProgram(id);
  if (!user?.isMentor || String(program.createdBy) !== String(user.id)) {
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

/** Thành viên chính thức CLB mới được chỉ định làm Mentor training. */
async function assertCanBeTrainingMentor(userId) {
  if (!userId) return null;
  const user = await User.findById(userId);
  if (!user || user.isActive === false || user.status === "disabled") {
    throw ApiError.badRequest("Thành viên không tồn tại hoặc đã bị khoá");
  }
  if (hasRole(user, "candidate") && !hasRole(user, "member") && !hasRole(user, "leader")) {
    throw ApiError.badRequest("Ứng viên chưa phải thành viên CLB");
  }
  if (!hasRole(user, "member") && !hasRole(user, "leader")) {
    throw ApiError.badRequest("Chỉ thành viên CLB mới làm Mentor training");
  }
  if (hasRole(user, "member") && user.memberStatus === "training") {
    throw ApiError.badRequest("Chỉ Member chính thức mới làm Mentor training");
  }
  return user;
}

/** Chỉ định Mentor training → bật isMentor, tuyệt đối không đổi role Leader Ban. */
async function grantTrainingMentor(userId) {
  const user = await assertCanBeTrainingMentor(userId);
  if (!user) return;
  user.isMentor = true;
  if (!user.memberStatus && hasRole(user, "member")) {
    user.memberStatus = "official";
  }
  await user.save();
  return user;
}

/**
 * Thu hồi Mentor training khi không còn phụ trách đội nào.
 * Không tác động role Leader Ban.
 */
async function maybeRevokeTrainingMentor(userId) {
  if (!userId) return;
  const stillMentor = await TrainingGroup.exists({ mentorId: userId });
  if (stillMentor) return;
  const user = await User.findById(userId);
  if (!user || !user.isMentor) return;
  user.isMentor = false;
  await user.save();
}

export function listGroups(campaignId, user) {
  const filter = {};
  if (campaignId) filter.campaignId = campaignId;
  if (user?.role !== "bcn") filter.mentorId = user.id;
  return TrainingGroup.find(filter)
    .sort({ createdAt: -1 })
    .populate("mentorId", "name email role isMentor");
}

export async function createGroup(data, createdBy) {
  if (data.programId) await getProgram(data.programId);
  if (data.mentorId) {
    await grantTrainingMentor(data.mentorId);
  }

  // Trainee phải tồn tại và chưa thuộc team khác
  const memberIds = data.memberIds ?? [];
  const trainees = memberIds.length
    ? await Trainee.find({ _id: { $in: memberIds } })
    : [];
  if (trainees.length !== memberIds.length) {
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
    programId: data.programId || null,
    department: data.department || "Tổng hợp",
    specialtyLabel: data.specialtyLabel ?? "",
    mentorId: data.mentorId || null,
    memberIds,
    mentorAccepted: Boolean(data.mentorId),
    createdBy,
    campaignId: data.campaignId || null,
  });

  if (memberIds.length) {
    await Trainee.updateMany(
      { _id: { $in: memberIds } },
      { $set: { groupId: group._id, status: "in_progress" } },
    );
  }

  const populated = await group.populate("mentorId", "name email role isMentor");
  if (trainees.length) await notifyGroupAssignment(populated, trainees);
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

  const isBcn = user.role === "bcn";
  const isAssignedMentor =
    user.isMentor && String(group.mentorId) === String(user.id);
  if (!isBcn && !isAssignedMentor) {
    throw ApiError.forbidden("Bạn không có quyền sửa nhóm này");
  }
  if (!isBcn && data.mentorId !== undefined) {
    throw ApiError.forbidden("Chỉ BCN được phân hoặc đổi Mentor phụ trách");
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
    const previousMentorId = group.mentorId ? String(group.mentorId) : null;
    const nextMentorId = data.mentorId || null;
    if (nextMentorId) {
      await grantTrainingMentor(nextMentorId);
    }
    group.mentorId = nextMentorId;
    group.mentorAccepted = Boolean(nextMentorId);
    await group.save();
    if (previousMentorId && previousMentorId !== String(nextMentorId || "")) {
      await maybeRevokeTrainingMentor(previousMentorId);
    }
  }

  await group.save();
  const populated = await group.populate("mentorId", "name email role isMentor");

  if (newlyAssigned.length || data.mentorId !== undefined) {
    const notifyList =
      newlyAssigned.length > 0
        ? newlyAssigned
        : await Trainee.find({ _id: { $in: group.memberIds } });
    await notifyGroupAssignment(populated, notifyList);
  }

  return populated;
}

/** BCN xóa đội training — gỡ trainee khỏi đội, xóa tin nhắn nhóm, thu hồi mentor nếu không còn đội. */
export async function deleteGroup(id) {
  const group = await TrainingGroup.findById(id);
  if (!group) throw ApiError.notFound("Không tìm thấy nhóm training");

  const mentorId = group.mentorId ? String(group.mentorId) : null;
  const { default: TrainingMessage } = await import(
    "../models/trainingMessage.model.js"
  );

  await Trainee.updateMany(
    { groupId: group._id },
    { $set: { groupId: null, status: "pending" } },
  );
  await TrainingMessage.deleteMany({ groupId: group._id });
  await group.deleteOne();

  if (mentorId) await maybeRevokeTrainingMentor(mentorId);
  return { id: String(id) };
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
  if (user.role === "bcn") return group;
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
        link =
          u?.role === "leader"
            ? "/leader/training/groups"
            : "/member/mentor/tasks";
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

  if (user.role !== "bcn") {
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
// Đạt training (qualified/certified) → mới nâng role Member chính thức.
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
  if (evalStatus === "qualified" || evalStatus === "certified") {
    trainee.status = "completed";
    if (evalStatus === "certified" && !trainee.certificateCode) {
      trainee.certificateCode = buildCertificateCode(trainee._id);
      trainee.certificateIssuedAt = new Date();
    }
    if (trainee.userId) {
      await promoteTraineeUserToOfficialMember(trainee.userId);
    }
  }
  await trainee.save();
  return trainee;
}

/** Tân binh hoàn thành training → Member chính thức */
async function promoteTraineeUserToOfficialMember(userId) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        role: "member",
        roles: ["member"],
        memberStatus: "official",
        isActive: true,
        status: "active",
      },
    },
  );
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
      await promoteTraineeUserToOfficialMember(trainee.userId);
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
