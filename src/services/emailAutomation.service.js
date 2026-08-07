import EmailAutomationRule from "../models/emailAutomationRule.model.js";
import EmailTemplate from "../models/emailTemplate.model.js";
import ApiError from "../utils/ApiError.js";
import { ensureDefaultTemplates } from "./emailTemplate.service.js";

/**
 * Seed mặc định IU CLUB — idempotent theo ruleKey.
 * P0: lưu cấu hình; P1+ jobs đọc qua resolve().
 */
export const DEFAULT_AUTOMATION_RULES = [
  {
    ruleKey: "cv_pass",
    eventKey: "cv_pass",
    name: "Pass vòng đơn",
    enabled: true,
    templateSlug: "tpl-cv-pass",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 10,
  },
  {
    ruleKey: "cv_fail",
    eventKey: "cv_fail",
    name: "Trượt vòng đơn",
    enabled: true,
    templateSlug: "tpl-cv-fail",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 20,
  },
  {
    ruleKey: "book_slot_remind",
    eventKey: "book_slot_remind",
    name: "Nhắc đăng ký lịch phỏng vấn",
    enabled: true,
    templateSlug: "tpl-book-slot",
    timing: "delay_after_event",
    timingValue: 3,
    timingUnit: "days",
    params: { bookingWindowDays: 7 },
    sortOrder: 30,
  },
  {
    ruleKey: "booking_confirmed",
    eventKey: "booking_confirmed",
    name: "Xác nhận đã đăng ký lịch PV",
    enabled: true,
    templateSlug: "tpl-interview",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 40,
  },
  {
    ruleKey: "interview_remind_24h",
    eventKey: "interview_remind",
    name: "Nhắc lịch PV — trước 24 giờ",
    enabled: true,
    templateSlug: "tpl-reminder",
    timing: "before_slot",
    timingValue: 24,
    timingUnit: "hours",
    params: {},
    sortOrder: 50,
  },
  {
    ruleKey: "interview_remind_2h",
    eventKey: "interview_remind",
    name: "Nhắc lịch PV — trước 2 giờ",
    enabled: true,
    templateSlug: "tpl-reminder",
    timing: "before_slot",
    timingValue: 2,
    timingUnit: "hours",
    params: {},
    sortOrder: 55,
  },
  {
    ruleKey: "interview_pass",
    eventKey: "interview_pass",
    name: "Đạt vòng phỏng vấn",
    enabled: true,
    templateSlug: "tpl-passed",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 60,
  },
  {
    ruleKey: "interview_fail",
    eventKey: "interview_fail",
    name: "Trượt vòng phỏng vấn",
    enabled: true,
    templateSlug: "tpl-rejected",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 70,
  },
  {
    ruleKey: "final_pass",
    eventKey: "final_pass",
    name: "Trúng tuyển",
    enabled: true,
    templateSlug: "tpl-passed",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 80,
  },
  {
    ruleKey: "final_fail",
    eventKey: "final_fail",
    name: "Từ chối cuối",
    enabled: true,
    templateSlug: "tpl-rejected",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 90,
  },
  {
    ruleKey: "welcome_member",
    eventKey: "welcome_member",
    name: "Chào mừng thành viên",
    enabled: true,
    templateSlug: "tpl-welcome",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 100,
  },
];

function toDto(doc) {
  return {
    id: String(doc._id),
    ruleKey: doc.ruleKey,
    eventKey: doc.eventKey,
    name: doc.name,
    enabled: Boolean(doc.enabled),
    templateSlug: doc.templateSlug,
    timing: doc.timing,
    timingValue: doc.timingValue ?? 0,
    timingUnit: doc.timingUnit || "days",
    params: doc.params && typeof doc.params === "object" ? doc.params : {},
    sortOrder: doc.sortOrder ?? 100,
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
  };
}

export async function ensureDefaultAutomationRules() {
  await ensureDefaultTemplates();
  for (const rule of DEFAULT_AUTOMATION_RULES) {
    await EmailAutomationRule.updateOne(
      { ruleKey: rule.ruleKey },
      { $setOnInsert: rule },
      { upsert: true },
    );
  }
}

export async function listAutomationRules() {
  await ensureDefaultAutomationRules();
  const rows = await EmailAutomationRule.find().sort({ sortOrder: 1, name: 1 });
  return rows.map(toDto);
}

export async function getAutomationRule(id) {
  const doc = await EmailAutomationRule.findById(id);
  if (!doc) throw ApiError.notFound("Không tìm thấy quy tắc gửi tự động");
  return toDto(doc);
}

/**
 * Cập nhật rule — không cho đổi eventKey / ruleKey.
 */
export async function updateAutomationRule(id, data, userId) {
  const doc = await EmailAutomationRule.findById(id);
  if (!doc) throw ApiError.notFound("Không tìm thấy quy tắc gửi tự động");

  if (data.enabled !== undefined) doc.enabled = Boolean(data.enabled);
  if (data.name !== undefined) {
    const name = String(data.name).trim();
    if (!name) throw ApiError.badRequest("Tên quy tắc không được để trống");
    doc.name = name;
  }
  if (data.templateSlug !== undefined) {
    const slug = String(data.templateSlug).trim();
    if (!slug) throw ApiError.badRequest("templateSlug là bắt buộc");
    const tpl = await EmailTemplate.findOne({ slug, status: "active" });
    if (!tpl) {
      throw ApiError.badRequest(
        `Template "${slug}" không tồn tại hoặc không active`,
      );
    }
    doc.templateSlug = slug;
  }
  if (data.timing !== undefined) doc.timing = data.timing;
  if (data.timingValue !== undefined) {
    const v = Number(data.timingValue);
    if (!Number.isFinite(v) || v < 0) {
      throw ApiError.badRequest("timingValue phải ≥ 0");
    }
    doc.timingValue = v;
  }
  if (data.timingUnit !== undefined) doc.timingUnit = data.timingUnit;
  if (data.params !== undefined) {
    if (data.params === null || typeof data.params !== "object") {
      throw ApiError.badRequest("params phải là object");
    }
    doc.params = data.params;
  }

  // Validate: book_slot — window ≥ remind delay (days)
  if (doc.eventKey === "book_slot_remind") {
    const windowDays = Number(doc.params?.bookingWindowDays ?? 7);
    const remindDays =
      doc.timingUnit === "days" ? Number(doc.timingValue || 0) : 0;
    if (windowDays < remindDays) {
      throw ApiError.badRequest(
        "Hạn đăng ký lịch (bookingWindowDays) phải ≥ số ngày nhắc",
      );
    }
  }

  if (doc.timing !== "immediate" && Number(doc.timingValue) <= 0) {
    throw ApiError.badRequest(
      "timingValue phải > 0 khi không gửi ngay (immediate)",
    );
  }

  if (userId) doc.updatedBy = userId;
  await doc.save();
  return toDto(doc);
}

/** Khôi phục toàn bộ rule về seed IU CLUB (ghi đè). */
export async function restoreDefaultAutomationRules(userId) {
  await ensureDefaultTemplates();
  for (const rule of DEFAULT_AUTOMATION_RULES) {
    await EmailAutomationRule.findOneAndUpdate(
      { ruleKey: rule.ruleKey },
      {
        $set: {
          ...rule,
          updatedBy: userId || null,
        },
      },
      { upsert: true, new: true },
    );
  }
  return listAutomationRules();
}

/**
 * P1+: jobs gọi hàm này.
 * @returns {Promise<object[]>} rules enabled cho eventKey
 */
export async function resolveEnabledRules(eventKey) {
  await ensureDefaultAutomationRules();
  const rows = await EmailAutomationRule.find({
    eventKey,
    enabled: true,
  }).sort({ sortOrder: 1 });
  return rows.map(toDto);
}

function renderPlaceholders(template, data) {
  return String(template || "").replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key) => {
      const v = data[key];
      return v == null ? "" : String(v);
    },
  );
}

/** Wrap body cho client mail (Gmail nền trắng) — tránh chữ xám/trắng khó đọc */
function bodyToHtml(body) {
  const raw = String(body || "");
  const wrap = (inner) =>
    `<div style="margin:0;padding:16px 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;background:#ffffff">${inner}</div>`;

  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return wrap(raw);
  }
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return wrap(
    `<div style="white-space:pre-wrap">${escaped.replace(/\n/g, "<br/>")}</div>`,
  );
}

function toHours(value, unit) {
  const n = Number(value) || 0;
  return unit === "days" ? n * 24 : n;
}

function toDays(value, unit) {
  const n = Number(value) || 0;
  return unit === "hours" ? n / 24 : n;
}

/**
 * Gửi email theo quy tắc DB.
 * @returns {{ sent: boolean, skipped: boolean, count: number, reason?: string }}
 * reason: missing_to | disabled | template_missing
 */
export async function dispatchAutomatedEmail(eventKey, opts = {}) {
  const { to, data = {}, ruleKey } = opts;
  if (!to) {
    console.warn(`[email-automation] Skip ${eventKey}: missing to`);
    return { sent: false, skipped: true, count: 0, reason: "missing_to" };
  }

  let rules = await resolveEnabledRules(eventKey);
  if (ruleKey) rules = rules.filter((r) => r.ruleKey === ruleKey);
  if (!rules.length) {
    console.warn(
      `[email-automation] No enabled rules for ${eventKey}${ruleKey ? `/${ruleKey}` : ""} — skip`,
    );
    return { sent: false, skipped: true, count: 0, reason: "disabled" };
  }

  const emailService = await import("./email.service.js");
  const base = {
    club_name: "IU CLUB",
    contact_name: "Ban Chủ nhiệm",
    ...Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ),
  };

  let count = 0;
  for (const rule of rules) {
    const tpl = await EmailTemplate.findOne({
      slug: rule.templateSlug,
      status: "active",
    });
    if (!tpl) {
      console.warn(
        `[email-automation] Template "${rule.templateSlug}" missing/inactive for ${rule.ruleKey}`,
      );
      continue;
    }
    const subject = renderPlaceholders(tpl.subject, base);
    const body = renderPlaceholders(tpl.body, base);
    await emailService.sendRawEmail({
      to,
      subject,
      html: bodyToHtml(body),
      text: body.replace(/<[^>]+>/g, " "),
    });
    count += 1;
  }

  if (count === 0) {
    return {
      sent: false,
      skipped: true,
      count: 0,
      reason: "template_missing",
    };
  }
  return { sent: true, skipped: false, count };
}

/** Cấu hình nhắc đăng ký lịch — null nếu rule tắt */
export async function getBookSlotRemindConfig() {
  await ensureDefaultAutomationRules();
  const rule = await EmailAutomationRule.findOne({
    ruleKey: "book_slot_remind",
    enabled: true,
  });
  if (!rule) return null;
  return {
    remindAfterDays: toDays(rule.timingValue, rule.timingUnit),
    bookingWindowDays: Number(rule.params?.bookingWindowDays ?? 7),
    templateSlug: rule.templateSlug,
    rule: toDto(rule),
  };
}

/** Các mốc nhắc trước slot (giờ), đã sort giảm dần */
export async function getInterviewRemindOffsetsHours() {
  const rules = await resolveEnabledRules("interview_remind");
  return rules
    .filter((r) => r.timing === "before_slot")
    .map((r) => ({
      hours: toHours(r.timingValue, r.timingUnit),
      ruleKey: r.ruleKey,
      templateSlug: r.templateSlug,
    }))
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

/** Context chuẩn từ Application document */
export function applicationEmailData(application, extra = {}) {
  const dept =
    application.assignedDepartment ||
    application.departmentPreferences?.[0]?.department ||
    "";
  return {
    candidate_name: application.fullName || "",
    email: application.email || "",
    department: dept,
    score:
      application.cvScore != null
        ? String(application.cvScore)
        : application.interviewScore != null
          ? String(application.interviewScore)
          : "—",
    result: extra.result || "—",
    application_code: application.applicationCode || "",
    club_name: "IU CLUB",
    ...extra,
  };
}
