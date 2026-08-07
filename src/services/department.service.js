import ApiError from "../utils/ApiError.js";
import ClubDepartment from "../models/clubDepartment.model.js";
import DepartmentMembershipEvent from "../models/departmentMembershipEvent.model.js";
import DepartmentLeadershipEvent from "../models/departmentLeadershipEvent.model.js";
import User from "../models/user.model.js";
import { addRole, effectiveRoles, hasRole, removeRole } from "../utils/roles.js";
import { toAdminUserDto } from "./adminUser.service.js";
import * as notificationService from "./notification.service.js";
import * as emailService from "./email.service.js";

export const HEAD_VACANCY_DAYS = 7;

const TITLE_LABEL = { head: "Leader" };

function slugify(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function toDepartmentDto(dept, extras = {}) {
  if (!dept) return null;
  return {
    id: String(dept._id),
    name: dept.name,
    code: dept.code,
    description: dept.description || "",
    field: dept.field || "",
    headcountTarget: dept.headcountTarget ?? null,
    status: dept.status,
    sortOrder: dept.sortOrder ?? 0,
    headUserId: dept.headUserId ? String(dept.headUserId._id ?? dept.headUserId) : null,
    headUserName: dept.headUserId?.name ?? extras.headUserName ?? null,
    headVacantSince: dept.headVacantSince ?? null,
    memberCount: extras.memberCount ?? undefined,
    createdAt: dept.createdAt,
    updatedAt: dept.updatedAt,
  };
}

export async function listDepartments({ status } = {}) {
  const filter = {};
  if (status) filter.status = status;
  const depts = await ClubDepartment.find(filter)
    .sort({ sortOrder: 1, name: 1 })
    .populate("headUserId", "name email");
  const counts = await User.aggregate([
    { $match: { departmentId: { $ne: null } } },
    { $group: { _id: "$departmentId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  return depts.map((d) =>
    toDepartmentDto(d, { memberCount: countMap.get(String(d._id)) ?? 0 }),
  );
}

export async function getDepartment(id) {
  const dept = await ClubDepartment.findById(id).populate(
    "headUserId",
    "name email",
  );
  if (!dept) throw ApiError.notFound("Không tìm thấy Ban");
  const memberCount = await User.countDocuments({
    departmentId: dept._id,
    memberStatus: "official",
    role: { $ne: "candidate" },
  });
  return toDepartmentDto(dept, { memberCount });
}

export async function createDepartment(data, actorId) {
  const name = String(data.name || "").trim();
  if (!name) throw ApiError.badRequest("Tên ban bắt buộc");
  const code = (data.code?.trim() || slugify(name)).toLowerCase();
  if (!code) throw ApiError.badRequest("Mã ban không hợp lệ");

  const exists = await ClubDepartment.findOne({
    $or: [{ name }, { code }],
  });
  if (exists) throw ApiError.conflict("Tên hoặc mã Ban đã tồn tại");

  const memberIds = [
    ...new Set(
      [...(data.memberIds || []), data.headUserId]
        .filter(Boolean)
        .map(String),
    ),
  ];
  if (memberIds.length) {
    const members = await User.find({ _id: { $in: memberIds } });
    if (members.length !== memberIds.length) {
      throw ApiError.badRequest("Có thành viên được chọn không tồn tại");
    }
    for (const member of members) {
      if (
        (!hasRole(member, "member") && !hasRole(member, "leader")) ||
        member.memberStatus !== "official" ||
        member.clubStatus !== "active" ||
        member.isActive === false ||
        member.status === "disabled"
      ) {
        throw ApiError.badRequest(
          `${member.name} không phải thành viên chính thức đang hoạt động`,
        );
      }
      if (member.departmentId) {
        throw ApiError.badRequest(`${member.name} đã thuộc một Ban khác`);
      }
    }
  }

  const dept = await ClubDepartment.create({
    name,
    code,
    description: data.description?.trim() || "",
    field: data.field?.trim() || "",
    headcountTarget:
      data.headcountTarget === "" || data.headcountTarget == null
        ? null
        : Number(data.headcountTarget),
    status: data.status === "paused" ? "paused" : "active",
    sortOrder: Number(data.sortOrder) || 0,
    createdBy: actorId,
    headVacantSince: new Date(),
  });

  for (const memberId of memberIds) {
    await assignMemberToDepartment(
      memberId,
      {
        departmentId: String(dept._id),
        reason: "Phân công khi tạo Ban",
      },
      actorId,
    );
  }

  if (data.headUserId) {
    await appointLeader(
      String(dept._id),
      {
        userId: String(data.headUserId),
        startAt: new Date(),
        reason: "Chỉ định khi tạo Ban",
      },
      actorId,
    );
  }

  return getDepartment(dept._id);
}

export async function updateDepartment(id, data, actorId) {
  const dept = await ClubDepartment.findById(id);
  if (!dept) throw ApiError.notFound("Không tìm thấy Ban");

  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw ApiError.badRequest("Tên ban bắt buộc");
    const clash = await ClubDepartment.findOne({
      name,
      _id: { $ne: dept._id },
    });
    if (clash) throw ApiError.conflict("Tên Ban đã tồn tại");
    dept.name = name;
  }
  if (data.description !== undefined) dept.description = String(data.description).trim();
  if (data.field !== undefined) dept.field = String(data.field).trim();
  if (data.headcountTarget !== undefined) {
    dept.headcountTarget =
      data.headcountTarget === "" || data.headcountTarget == null
        ? null
        : Number(data.headcountTarget);
  }
  if (data.status !== undefined) {
    if (!["active", "paused"].includes(data.status)) {
      throw ApiError.badRequest("Trạng thái Ban không hợp lệ");
    }
    dept.status = data.status;
  }
  if (data.sortOrder !== undefined) dept.sortOrder = Number(data.sortOrder) || 0;
  await dept.save();

  // Đồng bộ tên denormalized trên User
  await User.updateMany(
    { departmentId: dept._id },
    { $set: { department: dept.name } },
  );

  if (data.memberIds !== undefined || data.headUserId !== undefined) {
    const currentMembers = await User.find({ departmentId: dept._id });
    const currentIds = currentMembers.map((member) => String(member._id));
    const requestedIds =
      data.memberIds !== undefined ? data.memberIds.map(String) : currentIds;
    const finalHeadId =
      data.headUserId !== undefined
        ? data.headUserId
          ? String(data.headUserId)
          : null
        : dept.headUserId && requestedIds.includes(String(dept.headUserId))
          ? String(dept.headUserId)
          : null;
    const targetIds = [
      ...new Set([...requestedIds, finalHeadId].filter(Boolean)),
    ];

    if (targetIds.length) {
      const targetMembers = await User.find({ _id: { $in: targetIds } });
      if (targetMembers.length !== targetIds.length) {
        throw ApiError.badRequest("Có thành viên được chọn không tồn tại");
      }
      for (const member of targetMembers) {
        const belongsHere =
          member.departmentId &&
          String(member.departmentId) === String(dept._id);
        if (
          (!hasRole(member, "member") && !hasRole(member, "leader")) ||
          member.memberStatus !== "official" ||
          member.clubStatus !== "active" ||
          member.isActive === false ||
          member.status === "disabled"
        ) {
          throw ApiError.badRequest(
            `${member.name} không phải thành viên chính thức đang hoạt động`,
          );
        }
        if (member.departmentId && !belongsHere) {
          throw ApiError.badRequest(`${member.name} đã thuộc một Ban khác`);
        }
      }
    }

    const currentHeadId = dept.headUserId ? String(dept.headUserId) : null;
    if (currentHeadId && currentHeadId !== finalHeadId) {
      await revokeLeader(dept._id, currentHeadId, actorId, {
        reason: finalHeadId ? "Thay Leader khi cập nhật Ban" : "Thu hồi khi cập nhật Ban",
      });
    }

    for (const member of currentMembers) {
      if (!targetIds.includes(String(member._id))) {
        await removeMemberFromDepartment(
          member._id,
          { reason: "Gỡ khỏi Ban khi cập nhật" },
          actorId,
        );
      }
    }
    for (const memberId of targetIds) {
      if (!currentIds.includes(memberId)) {
        await assignMemberToDepartment(
          memberId,
          { departmentId: String(dept._id), reason: "Thêm khi cập nhật Ban" },
          actorId,
        );
      }
    }
    if (finalHeadId && finalHeadId !== currentHeadId) {
      await appointLeader(
        dept._id,
        {
          userId: finalHeadId,
          startAt: new Date(),
          reason: "Chỉ định khi cập nhật Ban",
        },
        actorId,
      );
    }
  }

  return getDepartment(dept._id);
}

/** Chỉ được xóa Ban khi không còn thành viên. */
export async function deleteDepartment(id) {
  const dept = await ClubDepartment.findById(id);
  if (!dept) throw ApiError.notFound("Không tìm thấy Ban");
  const memberCount = await User.countDocuments({ departmentId: dept._id });
  if (memberCount > 0) {
    throw ApiError.badRequest(
      `Không thể xóa Ban khi còn ${memberCount} thành viên`,
    );
  }
  await DepartmentLeadershipEvent.updateMany(
    { departmentId: dept._id, isActive: true },
    { $set: { isActive: false, action: "term_end", endAt: new Date() } },
  );
  await dept.deleteOne();
}

export async function listDepartmentMembers(departmentId) {
  await getDepartment(departmentId);
  // Chỉ thành viên chính thức — tân binh (candidate / training) không thuộc roster Ban
  const users = await User.find({
    departmentId,
    memberStatus: "official",
    $or: [
      { roles: "member" },
      { role: "member" },
      { roles: "leader" },
      { role: "leader" },
    ],
    role: { $ne: "candidate" },
  })
    .sort({ name: 1 })
    .select(
      "name email role roles phone department departmentId departmentJoinedAt memberStatus clubStatus createdAt studentId generation",
    );
  const activeLeads = await DepartmentLeadershipEvent.find({
    departmentId,
    title: "head",
    isActive: true,
  }).select("userId title");
  const leadMap = new Map(
    activeLeads.map((l) => [String(l.userId), l.title]),
  );
  return users.map((u) => ({
    ...toAdminUserDto(u),
    leadershipTitle: leadMap.get(String(u._id)) ?? null,
  }));
}

/** Member chính thức chưa thuộc Ban */
export async function listUnassignedOfficialMembers({ q } = {}) {
  const filter = {
    $and: [
      {
        $or: [{ roles: "member" }, { role: "member" }],
      },
      {
        $or: [{ departmentId: null }, { departmentId: { $exists: false } }],
      },
      { memberStatus: "official" },
      { clubStatus: "active" },
      { isActive: { $ne: false } },
      { status: { $ne: "disabled" } },
    ],
  };
  if (q?.trim()) {
    const re = new RegExp(String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$and.push({ $or: [{ name: re }, { email: re }] });
  }
  const users = await User.find(filter).sort({ name: 1 });
  return users.map(toAdminUserDto);
}

async function notifyDepartment(user, type, title, body, link = "/member") {
  try {
    await notificationService.createNotification({
      userId: user._id,
      title,
      body,
      type,
      link,
    });
  } catch (err) {
    console.warn("[department] notif failed:", err.message);
  }
  if (user.email) {
    try {
      if (type.startsWith("department_")) {
        await emailService.sendDepartmentMembershipEmail(user, title, body);
      } else if (type.startsWith("leader_")) {
        await emailService.sendLeaderAppointmentEmail(user, title, body);
      }
    } catch (err) {
      console.warn("[department] email failed:", err.message);
    }
  }
}

/**
 * Gán hoặc chuyển Member vào Ban.
 * 1 Member chỉ thuộc 1 Ban — transfer ghi lịch sử.
 */
export async function assignMemberToDepartment(
  userId,
  { departmentId, joinedAt, reason },
  actorId,
) {
  const user = await User.findById(userId);
  if (!user || !hasRole(user, "member", "leader")) {
    throw ApiError.notFound("Không tìm thấy thành viên CLB");
  }
  if (hasRole(user, "candidate") && !hasRole(user, "member")) {
    throw ApiError.badRequest("Ứng viên chưa phải thành viên CLB");
  }

  const dept = await ClubDepartment.findById(departmentId);
  if (!dept) throw ApiError.notFound("Không tìm thấy Ban");
  if (dept.status === "paused") {
    throw ApiError.badRequest("Ban đang tạm ngưng — không thể gán thành viên");
  }

  const fromId = user.departmentId ? String(user.departmentId) : null;
  const toId = String(dept._id);
  if (fromId === toId) {
    throw ApiError.badRequest("Thành viên đã thuộc Ban này");
  }

  // Đang là Leader Ban khác → phải thu hồi trước (1 Ban)
  const otherLead = await DepartmentLeadershipEvent.findOne({
    userId: user._id,
    isActive: true,
    departmentId: { $ne: dept._id },
  });
  if (otherLead) {
    throw ApiError.badRequest(
      "Thành viên đang giữ vai trò Leader ở Ban khác — thu hồi trước khi chuyển Ban",
    );
  }

  // Nếu đang Leader Ban hiện tại mà chuyển đi → thu hồi leadership
  if (fromId) {
    await revokeAllLeadershipForUserInDepartment(user._id, user.departmentId, actorId, {
      reason: reason || "Chuyển ban",
    });
  }

  const effectiveAt = joinedAt ? new Date(joinedAt) : new Date();
  const action = fromId ? "transfer" : "assign";

  await DepartmentMembershipEvent.create({
    userId: user._id,
    departmentId: dept._id,
    action,
    fromDepartmentId: fromId,
    toDepartmentId: dept._id,
    reason: reason || "",
    actorId,
    effectiveAt,
  });

  user.departmentId = dept._id;
  user.department = dept.name;
  user.departmentJoinedAt = effectiveAt;
  if (!hasRole(user, "member")) addRole(user, "member");
  await user.save();

  const fromDept = fromId ? await ClubDepartment.findById(fromId) : null;
  const body = fromDept
    ? `Bạn đã được chuyển từ ${fromDept.name} sang ${dept.name}.`
    : `Bạn đã được xếp vào Ban ${dept.name}.`;
  await notifyDepartment(
    user,
    fromDept ? "department_transferred" : "department_assigned",
    fromDept ? `Đã chuyển sang Ban ${dept.name}` : `Bạn đã được xếp vào Ban ${dept.name}`,
    body,
    "/member",
  );

  return toAdminUserDto(user);
}

export async function removeMemberFromDepartment(
  userId,
  { reason } = {},
  actorId,
) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("Không tìm thấy thành viên");
  if (!user.departmentId) {
    throw ApiError.badRequest("Thành viên chưa thuộc Ban nào");
  }

  const deptId = user.departmentId;
  const dept = await ClubDepartment.findById(deptId);

  await revokeAllLeadershipForUserInDepartment(user._id, deptId, actorId, {
    reason: reason || "Gỡ khỏi ban",
  });

  await DepartmentMembershipEvent.create({
    userId: user._id,
    departmentId: deptId,
    action: "remove",
    fromDepartmentId: deptId,
    toDepartmentId: null,
    reason: reason || "",
    actorId,
    effectiveAt: new Date(),
  });

  user.departmentId = null;
  user.department = "";
  user.departmentJoinedAt = null;
  await user.save();

  if (dept) {
    await notifyDepartment(
      user,
      "department_removed",
      `Đã gỡ khỏi Ban ${dept.name}`,
      `Bạn không còn thuộc Ban ${dept.name}. Tài khoản vẫn hoạt động bình thường.`,
      "/member",
    );
  }

  return toAdminUserDto(user);
}

export async function getMemberDepartmentHistory(userId) {
  const events = await DepartmentMembershipEvent.find({ userId })
    .sort({ effectiveAt: -1 })
    .populate("fromDepartmentId", "name")
    .populate("toDepartmentId", "name")
    .populate("departmentId", "name")
    .populate("actorId", "name");
  return events.map((e) => ({
    id: String(e._id),
    action: e.action,
    fromDepartment: e.fromDepartmentId?.name ?? null,
    toDepartment: e.toDepartmentId?.name ?? null,
    department: e.departmentId?.name ?? null,
    reason: e.reason || "",
    actorName: e.actorId?.name ?? null,
    effectiveAt: e.effectiveAt,
    createdAt: e.createdAt,
  }));
}

async function revokeAllLeadershipForUserInDepartment(
  userId,
  departmentId,
  actorId,
  { reason } = {},
) {
  const active = await DepartmentLeadershipEvent.find({
    userId,
    departmentId,
    isActive: true,
  });
  for (const row of active) {
    await revokeLeadershipInternal(row, actorId, reason || "Thu hồi nhiệm kỳ");
  }
}

async function revokeLeadershipInternal(row, actorId, reason) {
  row.isActive = false;
  row.endAt = new Date();
  row.action = "revoke";
  row.reason = reason || row.reason || "";
  if (actorId) row.actorId = actorId;
  await row.save();

  const dept = await ClubDepartment.findById(row.departmentId);
  if (dept && row.title === "head" && String(dept.headUserId) === String(row.userId)) {
    dept.headUserId = null;
    dept.headVacantSince = new Date();
    await dept.save();
  }

  const user = await User.findById(row.userId);
  if (!user) return;

  const stillLead = await DepartmentLeadershipEvent.exists({
    userId: user._id,
    isActive: true,
  });
  if (!stillLead && hasRole(user, "leader")) {
    removeRole(user, "leader");
    if (!user.memberStatus && hasRole(user, "member")) {
      user.memberStatus = "official";
    }
    await user.save();
  }

  if (dept) {
    await notifyDepartment(
      user,
      "leader_revoked",
      `Đã thu hồi vai trò ${TITLE_LABEL[row.title]} Ban ${dept.name}`,
      `Bạn không còn giữ vai trò ${TITLE_LABEL[row.title]} của Ban ${dept.name}.`,
      "/member",
    );
  }
}

/**
 * Chỉ định Leader duy nhất của Ban.
 * User phải là Member chính thức thuộc Ban; 1 người chỉ Leader 1 Ban.
 */
export async function appointLeader(
  departmentId,
  { userId, startAt, endAt, termLabel, reason },
  actorId,
) {
  const title = "head";
  const dept = await ClubDepartment.findById(departmentId);
  if (!dept) throw ApiError.notFound("Không tìm thấy Ban");

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("Không tìm thấy thành viên");
  if (String(user.departmentId) !== String(dept._id)) {
    throw ApiError.badRequest("Thành viên phải thuộc Ban này trước khi chỉ định Leader");
  }
  if (!hasRole(user, "member") && !hasRole(user, "leader")) {
    throw ApiError.badRequest("Chỉ Member/Leader mới được chỉ định");
  }
  if (
    user.memberStatus !== "official" ||
    user.clubStatus !== "active" ||
    user.isActive === false ||
    user.status === "disabled"
  ) {
    throw ApiError.badRequest(
      "Leader phải là thành viên chính thức đang hoạt động",
    );
  }

  const leadElsewhere = await DepartmentLeadershipEvent.findOne({
    userId: user._id,
    isActive: true,
    departmentId: { $ne: dept._id },
  });
  if (leadElsewhere) {
    throw ApiError.badRequest("Thành viên đang là Leader của Ban khác");
  }

  // Dọn dữ liệu legacy Phó ban: nghiệp vụ hiện tại chỉ còn đúng 1 Leader/Ban.
  const legacyLeads = await DepartmentLeadershipEvent.find({
    departmentId: dept._id,
    title: { $ne: "head" },
    isActive: true,
  });
  for (const row of legacyLeads) {
    await revokeLeadershipInternal(row, actorId, "Chuẩn hóa một Leader mỗi Ban");
  }

  const currentHead = await DepartmentLeadershipEvent.findOne({
    departmentId: dept._id,
    title: "head",
    isActive: true,
  });
  if (currentHead && String(currentHead.userId) !== String(user._id)) {
    await revokeLeadershipInternal(
      currentHead,
      actorId,
      "Thay Leader mới",
    );
  }

  // Đã active cùng title → idempotent update
  let existing = await DepartmentLeadershipEvent.findOne({
    departmentId: dept._id,
    userId: user._id,
    title,
    isActive: true,
  });
  if (existing) {
    existing.startAt = startAt ? new Date(startAt) : existing.startAt;
    existing.endAt = endAt ? new Date(endAt) : existing.endAt;
    existing.termLabel = termLabel ?? existing.termLabel;
    await existing.save();
  } else {
    existing = await DepartmentLeadershipEvent.create({
      departmentId: dept._id,
      userId: user._id,
      action: "appoint",
      title,
      startAt: startAt ? new Date(startAt) : new Date(),
      endAt: endAt ? new Date(endAt) : null,
      termLabel: termLabel || "",
      reason: reason || "",
      actorId,
      isActive: true,
    });
  }

  addRole(user, "leader");
  if (!user.memberStatus) user.memberStatus = "official";
  await user.save();

  dept.headUserId = user._id;
  dept.headVacantSince = null;
  await dept.save();

  const startLabel = new Date(existing.startAt).toLocaleDateString("vi-VN");
  await notifyDepartment(
    user,
    "leader_appointed",
    `Chúc mừng, bạn đã được chỉ định làm ${TITLE_LABEL[title]} Ban ${dept.name}`,
    `Bạn được chỉ định làm ${TITLE_LABEL[title]} Ban ${dept.name}, kể từ ngày ${startLabel}. Đăng nhập portal Leader để dùng thêm tính năng điều hành Ban.`,
    "/leader",
  );

  return {
    appointment: {
      id: String(existing._id),
      title: existing.title,
      startAt: existing.startAt,
      endAt: existing.endAt,
      termLabel: existing.termLabel,
      isActive: existing.isActive,
    },
    member: toAdminUserDto(user),
    department: toDepartmentDto(dept),
  };
}

/** Xác định Ban mà user đang là Leader duy nhất. */
export async function getLedDepartment(userId) {
  const dept = await ClubDepartment.findOne({ headUserId: userId }).populate(
    "headUserId",
    "name email",
  );
  if (!dept) {
    throw ApiError.forbidden("Bạn chưa được chỉ định làm Leader của Ban nào");
  }
  const memberCount = await User.countDocuments({
    departmentId: dept._id,
    memberStatus: "official",
    role: { $ne: "candidate" },
  });
  return toDepartmentDto(dept, { memberCount });
}

export async function listMyDepartmentMembers(userId) {
  const dept = await getLedDepartment(userId);
  return {
    department: dept,
    members: await listDepartmentMembers(dept.id),
    unassigned: await listUnassignedOfficialMembers(),
  };
}

export async function assignMyDepartmentMember(
  leaderId,
  memberId,
  { joinedAt, reason } = {},
) {
  const dept = await getLedDepartment(leaderId);
  const target = await User.findById(memberId);
  if (!target) throw ApiError.notFound("Không tìm thấy thành viên");
  if (target.departmentId && String(target.departmentId) !== dept.id) {
    throw ApiError.forbidden(
      "Leader không được chuyển thành viên từ Ban khác",
    );
  }
  return assignMemberToDepartment(
    memberId,
    { departmentId: dept.id, joinedAt, reason },
    leaderId,
  );
}

export async function removeMyDepartmentMember(leaderId, memberId, reason) {
  const dept = await getLedDepartment(leaderId);
  if (String(leaderId) === String(memberId)) {
    throw ApiError.badRequest("Leader không thể tự gỡ mình khỏi Ban");
  }
  const target = await User.findById(memberId);
  if (!target || String(target.departmentId) !== dept.id) {
    throw ApiError.forbidden("Chỉ được gỡ thành viên thuộc Ban của bạn");
  }
  return removeMemberFromDepartment(memberId, { reason }, leaderId);
}

export async function updateMyDepartmentMember(leaderId, memberId, data) {
  const dept = await getLedDepartment(leaderId);
  const target = await User.findById(memberId);
  if (!target || String(target.departmentId) !== dept.id) {
    throw ApiError.forbidden("Chỉ được sửa thành viên thuộc Ban của bạn");
  }
  if (String(target._id) === String(leaderId)) {
    throw ApiError.badRequest("Hãy sửa hồ sơ cá nhân trong Cài đặt");
  }
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw ApiError.badRequest("Họ tên không được để trống");
    target.name = name;
  }
  if (data.phone !== undefined) target.phone = String(data.phone || "").trim();
  await target.save();
  return toAdminUserDto(target);
}

export async function revokeLeader(departmentId, userId, actorId, { reason } = {}) {
  const rows = await DepartmentLeadershipEvent.find({
    departmentId,
    userId,
    isActive: true,
  });
  if (!rows.length) {
    throw ApiError.notFound("Thành viên không đang giữ vai trò Leader ở Ban này");
  }
  for (const row of rows) {
    await revokeLeadershipInternal(row, actorId, reason || "Thu hồi vai trò Leader");
  }
  const user = await User.findById(userId);
  return { member: toAdminUserDto(user) };
}

export async function getLeadershipHistory(departmentId) {
  await getDepartment(departmentId);
  const events = await DepartmentLeadershipEvent.find({ departmentId })
    .sort({ startAt: -1 })
    .populate("userId", "name email")
    .populate("actorId", "name");
  return events.map((e) => ({
    id: String(e._id),
    action: e.action,
    title: e.title,
    titleLabel: TITLE_LABEL[e.title] ?? "Leader (lịch sử)",
    userId: e.userId ? String(e.userId._id ?? e.userId) : null,
    userName: e.userId?.name ?? null,
    startAt: e.startAt,
    endAt: e.endAt,
    termLabel: e.termLabel || "",
    reason: e.reason || "",
    isActive: e.isActive,
    actorName: e.actorId?.name ?? null,
    createdAt: e.createdAt,
  }));
}

/** Ban active thiếu Trưởng ban quá X ngày */
export async function listLeaderVacancies({ days = HEAD_VACANCY_DAYS } = {}) {
  const threshold = new Date(Date.now() - Number(days) * 86400000);
  const depts = await ClubDepartment.find({
    status: "active",
    $or: [
      { headUserId: null },
      { headUserId: { $exists: false } },
    ],
  }).sort({ headVacantSince: 1 });

  return depts.map((d) => {
    const since = d.headVacantSince || d.updatedAt || d.createdAt;
    const vacantDays = Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
    return {
      ...toDepartmentDto(d),
      vacantDays,
      overdue: since <= threshold,
    };
  });
}

export async function backfillUserRolesAndDepartments() {
  const users = await User.find({});
  let rolesUpdated = 0;
  let deptLinked = 0;

  const depts = await ClubDepartment.find({});
  const byName = new Map();
  for (const d of depts) {
    byName.set(d.name.toLowerCase(), d);
    byName.set(d.name.replace(/^Ban\s+/i, "").toLowerCase(), d);
  }

  for (const user of users) {
    const before = JSON.stringify(user.roles || []);
    if (!user.roles?.length && user.role) {
      user.roles = [user.role];
      if (user.role === "leader") {
        user.roles = ["member", "leader"];
        if (!user.memberStatus) user.memberStatus = "official";
      }
      await user.save();
      rolesUpdated += 1;
    } else if (before !== JSON.stringify(user.roles || [])) {
      rolesUpdated += 1;
    }

    if (!user.departmentId && user.department?.trim()) {
      const key = user.department.trim().toLowerCase();
      const short = key.replace(/^ban\s+/, "");
      const match = byName.get(key) || byName.get(short);
      if (match) {
        user.departmentId = match._id;
        user.department = match.name;
        if (!user.departmentJoinedAt) user.departmentJoinedAt = user.createdAt;
        await user.save();
        deptLinked += 1;
      }
    }
  }

  return { rolesUpdated, deptLinked, users: users.length };
}

/** Resolve ClubDepartment từ tên string (admission sync) */
export async function resolveDepartmentByName(name) {
  if (!name || name === "Chưa phân ban") return null;
  const raw = String(name).trim();
  const short = raw.replace(/^Ban\s+/i, "");
  return ClubDepartment.findOne({
    $or: [
      { name: raw },
      { name: `Ban ${short}` },
      { name: new RegExp(`^Ban\\s+${short}$`, "i") },
      { code: slugify(raw) },
      { code: slugify(short) },
    ],
  });
}

export async function syncUserDepartmentFromName(userId, departmentName) {
  if (!userId || !departmentName) return null;
  const dept = await resolveDepartmentByName(departmentName);
  if (!dept) return null;

  const user = await User.findById(userId).select(
    "role roles memberStatus",
  );
  if (!user) return null;

  // Tân binh / candidate: chỉ biết Ban qua Trainee — chưa gắn departmentId roster Member
  const isCandidate =
    user.role === "candidate" ||
    (Array.isArray(user.roles) && user.roles.includes("candidate"));
  const isOfficial = user.memberStatus === "official";
  if (isCandidate || !isOfficial) {
    return dept;
  }

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        departmentId: dept._id,
        department: dept.name,
        departmentJoinedAt: new Date(),
      },
    },
  );
  return dept;
}

export { effectiveRoles };
