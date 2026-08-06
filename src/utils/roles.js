import { ROLES } from "../models/user.model.js";

/** roles[] nếu có; không thì [role] — luôn unique */
export function effectiveRoles(user) {
  if (!user) return [];
  const list = Array.isArray(user.roles) && user.roles.length
    ? user.roles
    : user.role
      ? [user.role]
      : [];
  return [...new Set(list.filter((r) => ROLES.includes(r)))];
}

export function hasRole(user, ...wanted) {
  const set = new Set(effectiveRoles(user));
  return wanted.some((w) => set.has(w));
}

/**
 * Đồng bộ primary `role` + `roles[]`.
 * Dual member+leader → primary = leader (portal Leader).
 */
export function applyRoles(user, nextRoles, { primary } = {}) {
  const cleaned = [...new Set((nextRoles || []).filter((r) => ROLES.includes(r)))];
  if (!cleaned.length) {
    throw new Error("roles không được rỗng");
  }
  let nextPrimary = primary && cleaned.includes(primary) ? primary : cleaned[0];
  if (cleaned.includes("leader") && cleaned.includes("member") && !primary) {
    nextPrimary = "leader";
  }
  if (cleaned.includes("bcn")) {
    nextPrimary = "bcn";
  }
  if (cleaned.includes("candidate") && cleaned.length === 1) {
    nextPrimary = "candidate";
  }
  user.roles = cleaned;
  user.role = nextPrimary;
  return user;
}

/** Thêm capability; dual member+leader giữ memberStatus */
export function addRole(user, role) {
  const next = effectiveRoles(user);
  if (!next.includes(role)) next.push(role);
  applyRoles(user, next);
  if (role === "leader" && next.includes("member") && !user.memberStatus) {
    user.memberStatus = "official";
  }
  return user;
}

/** Gỡ capability; nếu hết leader → primary member */
export function removeRole(user, role) {
  const next = effectiveRoles(user).filter((r) => r !== role);
  if (!next.length) {
    next.push(role === "leader" ? "member" : user.role || "member");
  }
  applyRoles(user, next);
  return user;
}

/** Filter Mongo: user có role X (legacy role hoặc roles[]) */
export function mongoHasRole(role) {
  return {
    $or: [{ roles: role }, { role, roles: { $in: [null, []] } }, { role, roles: { $size: 0 } }],
  };
}

/** Đơn giản hơn cho query: roles chứa X HOẶC (không có roles và role=X) */
export function mongoRoleIn(roles) {
  const list = Array.isArray(roles) ? roles : [roles];
  return {
    $or: [
      { roles: { $in: list } },
      {
        $and: [
          {
            $or: [
              { roles: { $exists: false } },
              { roles: null },
              { roles: { $size: 0 } },
            ],
          },
          { role: { $in: list } },
        ],
      },
    ],
  };
}
