import ApiError from "../utils/ApiError.js";
import ClubDepartment from "../models/clubDepartment.model.js";
import User from "../models/user.model.js";
import * as tokenService from "./token.service.js";
import {
  applyRoles,
  effectiveRoles,
  hasRole,
  mongoRoleIn,
} from "../utils/roles.js";

const CLUB_ROLES = ["member", "leader", "bcn"];
const ROSTER_ROLES = ["member", "leader"];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Gắn department string + departmentId nếu Ban tồn tại trong danh mục */
async function attachDepartmentFields(user, { departmentId, department } = {}) {
  const nameHint = String(department || "").trim();
  if (departmentId) {
    const dept = await ClubDepartment.findById(departmentId);
    if (dept) {
      user.departmentId = dept._id;
      user.department = dept.name;
      user.departmentJoinedAt = user.departmentJoinedAt || new Date();
      return;
    }
  }
  if (nameHint) {
    user.department = nameHint;
    const dept = await ClubDepartment.findOne({
      name: new RegExp(`^${escapeRegex(nameHint)}$`, "i"),
    });
    if (dept) {
      user.departmentId = dept._id;
      user.department = dept.name;
      user.departmentJoinedAt = user.departmentJoinedAt || new Date();
    }
  }
}

/** DTO chung cho Members / Accounts — không lộ password */
export function toAdminUserDto(user) {
  if (!user) return null;
  const id = String(user._id ?? user.id);
  const roles = effectiveRoles(user);
  return {
    id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    roles,
    department: user.department || "",
    departmentId: user.departmentId ? String(user.departmentId) : null,
    departmentJoinedAt: user.departmentJoinedAt ?? null,
    studentId: user.studentId || "",
    generation: user.generation || "",
    clubStatus: user.clubStatus || "active",
    memberStatus: user.memberStatus ?? null,
    isTrainingMember:
      roles.includes("member") && user.memberStatus === "training",
    isActive: user.isActive !== false,
    status: user.status,
    createdAt: user.createdAt,
  };
}

async function findByEmail(email) {
  return User.findOne({ email: String(email).trim().toLowerCase() });
}

async function countActiveBcn(excludeUserId) {
  const filter = {
    ...mongoRoleIn("bcn"),
    isActive: { $ne: false },
    status: { $ne: "disabled" },
  };
  if (excludeUserId) {
    filter._id = { $ne: excludeUserId };
  }
  return User.countDocuments(filter);
}

async function assertCanChangeBcn(user, actorId, actionLabel) {
  if (!hasRole(user, "bcn")) return;
  if (String(user._id) === String(actorId)) {
    throw ApiError.badRequest(
      `Không thể ${actionLabel} chính tài khoản của bạn`,
    );
  }
  const others = await countActiveBcn(user._id);
  if (others < 1) {
    throw ApiError.badRequest("Không thể hạ/khoá Ban Chủ nhiệm cuối cùng");
  }
}

function roleFilter(role) {
  if (!role || !CLUB_ROLES.includes(role)) return mongoRoleIn(CLUB_ROLES);
  return mongoRoleIn(role);
}

// ---- Members (roster) ----
// Chỉ thành viên chính thức (memberStatus=official hoặc Leader).
// Tân binh (memberStatus=training) thuộc màn "Tân binh training", chưa vào roster này.

export async function listMembers({
  role,
  clubStatus,
  department,
  q,
  page = 1,
  limit,
} = {}) {
  const filter = {
    ...mongoRoleIn(ROSTER_ROLES.includes(role) ? role : ROSTER_ROLES),
    isActive: { $ne: false },
    status: { $ne: "disabled" },
    // Loại tân binh đang training — chưa phải thành viên chính thức
    memberStatus: { $ne: "training" },
  };
  if (clubStatus) filter.clubStatus = clubStatus;
  if (department) filter.department = department;
  if (q?.trim()) {
    const re = new RegExp(escapeRegex(q.trim()), "i");
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ name: re }, { email: re }] },
    ];
  }
  const numericPage = Math.max(Number(page) || 1, 1);
  const numericLimit =
    limit != null ? Math.min(Math.max(Number(limit) || 20, 1), 200) : null;

  if (!numericLimit) {
    const users = await User.find(filter).sort({ createdAt: -1 });
    return {
      members: users.map(toAdminUserDto),
      total: users.length,
      page: 1,
      limit: users.length,
    };
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((numericPage - 1) * numericLimit)
      .limit(numericLimit),
    User.countDocuments(filter),
  ]);
  return {
    members: users.map(toAdminUserDto),
    total,
    page: numericPage,
    limit: numericLimit,
  };
}

export async function createMember(data) {
  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  const name = String(data.name || "").trim();
  const role = data.role;
  const studentId = String(data.studentId || "").trim();
  if (!name || !email) {
    throw ApiError.badRequest(
      "Thiếu họ tên hoặc email",
    );
  }

  if (!studentId) {
    throw ApiError.badRequest(
      "MSSV (studentId) là bắt buộc để tạo tài khoản thành viên",
    );
  }

  if (role === "leader") {
    throw ApiError.badRequest(
      "Leader chỉ được chỉ định từ màn Quản lý Ban sau khi thành viên đã thuộc Ban",
    );
  }

  if (!ROSTER_ROLES.includes(role)) {
    throw ApiError.badRequest(
      "Chỉ tạo Member hoặc Leader từ Quản lý thành viên",
    );
  }

  if (await findByEmail(email)) {
    throw ApiError.conflict(
      "Email đã tồn tại trong hệ thống",
    );
  }

  const roles = role === "leader" ? ["member", "leader"] : ["member"];

  /**
   * Mật khẩu tạm thời: studentId
   */
  const temporaryPassword = studentId;
  const user = new User({
    name,
    email,
    password: temporaryPassword,
    status: "active",
    isActive: true,
    emailVerified: true,
    requirePasswordChange: true,
    clubStatus: "active",
    memberStatus: "official",
    department: "",
    phone: data.phone?.trim() || "",
    studentId,
    generation: data.generation?.trim() || "",
  });
  applyRoles(user, roles);
  await attachDepartmentFields(user, {
    departmentId: data.departmentId,
    department: data.department,
  });
  await user.save();

  /**
   * Chuyển sang DTO để trả về cho controller
   */
  const member = toAdminUserDto(user);
  try {
    const emailService = await import("./email.service.js");
    await emailService.sendOfficialMemberAccountEmail(
      member,
      {
        department:
          user.department ||
          data.department ||
          "",
        temporaryPassword,
      },
    );
  } catch (error) {
    console.error(
      `[official-member-email] Không thể gửi email tới ${user.email}:`,
      error,
    );
  }
  return member;
}

/**
 * Legacy exclusive role switch for Members UI.
 * Leader → dual [member, leader]; Member-only → [member] (gỡ leader).
 */
export async function updateMemberRole(id, role, actorId) {
  if (!ROSTER_ROLES.includes(role)) {
    throw ApiError.badRequest("Chỉ chuyển giữa Member và Leader");
  }
  const user = await User.findById(id);
  if (!user || hasRole(user, "candidate")) {
    throw ApiError.notFound("Không tìm thấy thành viên");
  }
  if (hasRole(user, "bcn")) {
    throw ApiError.badRequest(
      "Không đổi role BCN từ Quản lý thành viên — dùng Phân quyền",
    );
  }
  if (String(user._id) === String(actorId)) {
    throw ApiError.badRequest("Không thể đổi role chính mình tại đây");
  }
  if (role === "leader" || hasRole(user, "leader")) {
    throw ApiError.badRequest(
      "Vai trò Leader chỉ được chỉ định hoặc thu hồi tại màn Quản lý Ban",
    );
  }

  if (role === "leader") {
    applyRoles(user, ["member", "leader"]);
    if (!user.memberStatus) user.memberStatus = "official";
  } else {
    applyRoles(user, ["member"]);
    user.memberStatus = user.memberStatus || "official";
  }
  await user.save();
  return toAdminUserDto(user);
}

export async function updateMemberClubStatus(id, clubStatus) {
  if (!["active", "inactive", "alumni"].includes(clubStatus)) {
    throw ApiError.badRequest("Trạng thái CLB không hợp lệ");
  }
  const user = await User.findById(id);
  if (!user || hasRole(user, "candidate")) {
    throw ApiError.notFound("Không tìm thấy thành viên");
  }
  user.clubStatus = clubStatus;
  await user.save();
  return toAdminUserDto(user);
}

export async function updateMemberInfo(id, data) {
  const user = await User.findById(id);
  if (!user || hasRole(user, "candidate")) {
    throw ApiError.notFound("Không tìm thấy thành viên");
  }
  if (data.email !== undefined) {
    const email = String(data.email).trim().toLowerCase();
    const clash = await User.findOne({ email, _id: { $ne: user._id } });
    if (clash) throw ApiError.conflict("Email đã tồn tại");
    user.email = email;
  }
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw ApiError.badRequest("Họ tên không được để trống");
    user.name = name;
  }
  if (data.phone !== undefined) user.phone = String(data.phone || "").trim();
  if (data.studentId !== undefined) {
    user.studentId = String(data.studentId || "").trim();
  }
  if (data.generation !== undefined) {
    user.generation = String(data.generation || "").trim();
  }
  await user.save();
  return toAdminUserDto(user);
}

// ---- Accounts (portal access) ----

export async function listAccounts({ role, q, includeDisabled } = {}) {
  const filter = { ...roleFilter(role) };
  if (!includeDisabled) {
    filter.isActive = { $ne: false };
    filter.status = { $ne: "disabled" };
  }
  if (q?.trim()) {
    const re = new RegExp(escapeRegex(q.trim()), "i");
    filter.$or = [{ name: re }, { email: re }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 });
  return users.map(toAdminUserDto);
}

export async function createAccount(data) {
  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  const name = String(data.name || "").trim();
  const role = data.role;
  const temporaryPassword = String(data.temporaryPassword || "").trim();

  if (!name || !email) throw ApiError.badRequest("Thiếu họ tên hoặc email");
  if (!CLUB_ROLES.includes(role)) {
    throw ApiError.badRequest("Role không hợp lệ");
  }
  if (role === "leader") {
    throw ApiError.badRequest(
      "Hãy tạo tài khoản Member, sau đó chỉ định Leader tại màn Quản lý Ban",
    );
  }
  if (temporaryPassword.length < 6) {
    throw ApiError.badRequest("Mật khẩu tạm thời tối thiểu 6 ký tự");
  }
  if (await findByEmail(email)) {
    throw ApiError.conflict("Email đã tồn tại trong hệ thống");
  }

  const isTraining =
    role === "member" &&
    (data.isTrainingMember === true || data.isTrainingMember === "true");

  let roles = [role];
  if (role === "leader") roles = ["member", "leader"];

  const user = new User({
    name,
    email,
    password: temporaryPassword,
    status: "active",
    isActive: true,
    emailVerified: true,
    requirePasswordChange: true,
    clubStatus: "active",
    memberStatus: roles.includes("member")
      ? isTraining || role === "member"
        ? isTraining
          ? "training"
          : "official"
        : "official"
      : undefined,
    department: "",
    phone: data.phone?.trim() || "",
  });
  applyRoles(user, roles);
  if (role === "bcn") {
    user.memberStatus = undefined;
  }
  await attachDepartmentFields(user, {
    departmentId: data.departmentId,
    department: data.department,
  });
  await user.save();
  return toAdminUserDto(user);
}

export async function updateAccountRole(id, role, actorId) {
  if (!CLUB_ROLES.includes(role)) {
    throw ApiError.badRequest("Role không hợp lệ");
  }
  const user = await User.findById(id);
  if (!user || hasRole(user, "candidate")) {
    throw ApiError.notFound("Không tìm thấy tài khoản");
  }
  if (String(user._id) === String(actorId)) {
    throw ApiError.badRequest("Không thể đổi role chính mình");
  }
  if (role === "leader" || hasRole(user, "leader")) {
    throw ApiError.badRequest(
      "Vai trò Leader chỉ được chỉ định hoặc thu hồi tại màn Quản lý Ban",
    );
  }
  if (hasRole(user, "bcn") && role !== "bcn") {
    await assertCanChangeBcn(user, actorId, "hạ quyền");
  }

  if (role === "bcn") {
    applyRoles(user, ["bcn"]);
    user.memberStatus = undefined;
  } else if (role === "leader") {
    applyRoles(user, ["member", "leader"]);
    if (!user.memberStatus) user.memberStatus = "official";
  } else {
    applyRoles(user, ["member"]);
    user.memberStatus = user.memberStatus || "official";
  }
  await user.save();
  return toAdminUserDto(user);
}

export async function deactivateAccount(id, actorId) {
  const user = await User.findById(id);
  if (!user || hasRole(user, "candidate")) {
    throw ApiError.notFound("Không tìm thấy tài khoản");
  }
  if (String(user._id) === String(actorId)) {
    throw ApiError.badRequest("Không thể khoá chính tài khoản của bạn");
  }
  await assertCanChangeBcn(user, actorId, "khoá");

  user.isActive = false;
  user.status = "disabled";
  await user.save();
  await tokenService.revokeAllRefreshTokens(user.id);
  return toAdminUserDto(user);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{9}$/;

function normalizeImportRow(raw, index) {
  return {
    rowIndex: Number.isFinite(Number(raw?.rowIndex))
      ? Number(raw.rowIndex)
      : index + 1,
    fullName: String(raw?.fullName ?? raw?.name ?? "").trim(),
    email: String(raw?.email ?? "")
      .trim()
      .toLowerCase(),
    phone: String(raw?.phone ?? "").trim(),
    studentId: String(raw?.studentId ?? "").trim(),
    generation: String(raw?.generation ?? "").trim(),
    departmentName: String(raw?.departmentName ?? raw?.department ?? "").trim(),
  };
}

/**
 * Validate rows đã map từ Excel (FE parse). Không tạo user.
 * @returns {{ valid: object[], invalid: { rowIndex, data, errors }[] }}
 */
export async function validateMemberImportRows(rows) {
  if (!Array.isArray(rows)) {
    throw ApiError.badRequest("rows phải là mảng");
  }
  if (rows.length > 500) {
    throw ApiError.badRequest("Tối đa 500 dòng mỗi lần import");
  }

  const normalized = rows.map((raw, i) => normalizeImportRow(raw, i));

  const emailCounts = new Map();
  for (const row of normalized) {
    if (!row.email) continue;
    emailCounts.set(row.email, (emailCounts.get(row.email) || 0) + 1);
  }

  const emails = [...new Set(normalized.map((r) => r.email).filter(Boolean))];
  const existing = emails.length
    ? await User.find({ email: { $in: emails } }).select("email")
    : [];
  const existingSet = new Set(existing.map((u) => u.email));

  const activeDepts = await ClubDepartment.find({ status: "active" }).select(
    "name",
  );
  const deptByName = new Map(
    activeDepts.map((d) => [d.name.trim().toLowerCase(), d]),
  );

  const valid = [];
  const invalid = [];

  for (const row of normalized) {
    const errors = [];
    if (!row.fullName || row.fullName.length < 2) {
      errors.push("Họ tên phải có ít nhất 2 ký tự");
    } else if (row.fullName.length > 100) {
      errors.push("Họ tên tối đa 100 ký tự");
    }

    if (!row.email) {
      errors.push("Email là bắt buộc");
    } else if (!EMAIL_RE.test(row.email)) {
      errors.push("Email không hợp lệ");
    } else if (existingSet.has(row.email)) {
      errors.push("Email đã tồn tại trong hệ thống");
    } else if ((emailCounts.get(row.email) || 0) > 1) {
      errors.push("Email trùng trong file");
    }

    if (row.phone && !PHONE_RE.test(row.phone)) {
      errors.push("Số điện thoại phải gồm 10 số và bắt đầu bằng 0");
    }

    let departmentId = null;
    if (row.departmentName) {
      const dept = deptByName.get(row.departmentName.toLowerCase());
      if (!dept) {
        errors.push("Ban không tồn tại hoặc không hoạt động");
      } else {
        departmentId = String(dept._id);
      }
    }

    const data = { ...row, departmentId };
    if (errors.length) {
      invalid.push({ rowIndex: row.rowIndex, data: row, errors });
    } else {
      valid.push(data);
    }
  }

  return { valid, invalid };
}

/**
 * Tạo Member chính thức từ các row hợp lệ (sau validate).
 * @param {object[]} rows
 * @param {{ skipInvalid?: boolean }} options — mặc định bỏ qua invalid
 */
export async function importMembers(rows, { skipInvalid = true } = {}) {
  const { valid, invalid } = await validateMemberImportRows(rows);
  if (!skipInvalid && invalid.length > 0) {
    throw ApiError.badRequest(
      "Tồn tại dữ liệu không hợp lệ — không thể import toàn bộ",
    );
  }

  const created = [];
  for (const row of valid) {
    const member = await createMember({
      name: row.fullName,
      email: row.email,
      phone: row.phone || undefined,
      role: "member",
      departmentId: row.departmentId || undefined,
      department: row.departmentName || undefined,
      studentId: row.studentId || undefined,
      generation: row.generation || undefined,
    });
    created.push(member);
  }

  return {
    created,
    createdCount: created.length,
    skippedCount: invalid.length,
    invalid,
  };
}
