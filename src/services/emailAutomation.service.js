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
    templateSlug: "tpl-interview-pass",
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
    templateSlug: "tpl-interview-fail",
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
    templateSlug: "tpl-final-pass",
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
    templateSlug: "tpl-final-fail",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 90,
  },
  {
    ruleKey: "welcome_member",
    eventKey: "welcome_member",
    name: "Chào mừng thành viên chính thức",
    enabled: true,
    templateSlug: "tpl-welcome",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 100,
  },
  {
    ruleKey: "official_member_created",
    eventKey: "official_member_created",
    name: "Cấp tài khoản thành viên chính thức",
    enabled: true,
    templateSlug: "tpl-official-member-account",
    timing: "immediate",
    timingValue: 0,
    timingUnit: "days",
    params: {},
    sortOrder: 110,
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
    await EmailAutomationRule.findOneAndUpdate(
      { ruleKey: rule.ruleKey },
      {
        $set: {
          eventKey: rule.eventKey,
          name: rule.name,
          templateSlug: rule.templateSlug,
          timing: rule.timing,
          sortOrder: rule.sortOrder,
        },
        $setOnInsert: {
          enabled: rule.enabled,
          timingValue: rule.timingValue,
          timingUnit: rule.timingUnit,
          params: rule.params,
        },
      },
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
  const normalized = {
    ...data,
    name: data.candidate_name || data.name || data.fullName || "",
    candidate_name: data.candidate_name || data.name || data.fullName || "",
    full_name: data.candidate_name || data.name || data.fullName || "",
    department: data.department || data.assignedDepartment || "",
    login_url: data.login_url || "https://portal.iuptit.com/login",
    portal_url: data.login_url || "https://portal.iuptit.com/login",
    portal_link: data.login_url || "https://portal.iuptit.com/login",
    temp_password: data.temp_password || data.tempPassword || data.rawPassword || "",
  };
  return String(template || "").replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key) => {
      const v = normalized[key];
      return v == null ? "" : String(v);
    },
  );
}

/** Wrap body cho client mail với chuẩn layout editorial "HẢI TRÌNH 2026" 600px */
function bodyToHtml(body, opts = {}) {
  const raw = String(body || "");
  const formattedBody = /<[a-z][\s\S]*>/i.test(raw)
    ? raw
    : raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .split(/\n\n+/)
        .map((p) => `<p style="margin:0 0 16px;line-height:1.7;">${p.replace(/\n/g, "<br/>")}</p>`)
        .join("");

  const title = opts.title || "";
  const preheader = opts.preheader || "";
  const badge = opts.badge || "HẢI TRÌNH 2026";

  return `<!doctype html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    html, body { margin: 0 auto !important; padding: 0 !important; height: 100% !important; width: 100% !important; }
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
    table { border-spacing: 0 !important; border-collapse: collapse !important; table-layout: fixed !important; margin: 0 auto !important; }
    img { -ms-interpolation-mode: bicubic; }
    a { text-decoration: none; }
    a[x-apple-data-detectors], .unstyle-auto-detected-links a, a[href^="tel"], a[href^="sms"] {
      color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important;
    }
    @media (prefers-color-scheme: dark) {
      body, .email-page { background-color: #0d0a14 !important; }
      .email-card { background-color: #171322 !important; border-color: #2b243d !important; }
      .email-title { color: #f4f4fb !important; }
      .email-content, .email-intro, .email-text, p { color: #cfcde0 !important; }
      .email-footer-text { color: #7f7a95 !important; }
      .email-badge { background-color: #2d1f4a !important; color: #c4b5fd !important; }
      .email-wordmark { color: #f4f4fb !important; }
    }
  </style>
</head>
<body class="email-page" style="margin:0;padding:0;background-color:#f4f4fb;-webkit-font-smoothing:antialiased;">
  <!-- Preheader text preview -->
  <div style="display:none;font-size:1px;color:#f4f4fb;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    ${preheader || raw.replace(/<[^>]+>/g, " ").trim().slice(0, 100)}
    ${"&zwnj;&nbsp;".repeat(30)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-page" style="background-color:#f4f4fb;padding:36px 12px 48px;">
    <tr>
      <td align="center">
        <!-- Main Card Container (600px max) -->
        <table role="presentation" width="600" class="email-card" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:18px;border:1px solid #eaeaf4;box-shadow:0 8px 30px rgba(25,26,44,0.04);overflow:hidden;">
          
          <!-- Top Route Accent Line (Hải trình) -->
          <tr>
            <td height="4" style="height:4px;line-height:4px;font-size:4px;background:linear-gradient(90deg,#6e2ce6 0%,#7c3aed 50%,#e0348c 100%);">&nbsp;</td>
          </tr>

          <!-- Header: Brand & Checkpoint Badge -->
          <tr>
            <td style="padding:28px 36px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <span class="email-wordmark" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:1.5px;color:#191a2c;">IU <span style="color:#7c3aed;">CLUB</span></span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span class="email-badge" style="display:inline-block;padding:5px 13px;background-color:#f1e9fe;color:#6d28d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;border-radius:999px;">${badge}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hairline Divider -->
          <tr>
            <td style="padding:0 36px;">
              <div style="height:1px;background-color:#f0f1f8;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td class="email-content" style="padding:28px 36px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#4d536b;">
              
              <!-- Route Waypoint indicator -->
              <div style="margin-bottom:14px;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#7c3aed;margin-right:6px;vertical-align:middle;"></span>
                <span style="font-size:11px;font-weight:800;letter-spacing:1px;color:#7c3aed;text-transform:uppercase;vertical-align:middle;">CHECKPOINT</span>
              </div>

              ${formattedBody}

            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="padding:0 36px 28px;">
              <div style="height:1px;background-color:#f0f1f8;line-height:1px;font-size:1px;margin-bottom:20px;">&nbsp;</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p class="email-footer-text" style="margin:0;font-size:13px;font-weight:700;color:#4d536b;letter-spacing:0.5px;">IU CLUB · Shine and Thrive</p>
                    <p class="email-footer-text" style="margin:4px 0 0;font-size:12px;color:#9aa0b4;">Câu lạc bộ IT — Học viện Công nghệ Bưu chính Viễn thông</p>
                    <p class="email-footer-text" style="margin:8px 0 0;font-size:11px;color:#9aa0b4;line-height:1.5;">Email tự động gửi từ hệ thống tuyển dụng IU CLUB · Vui lòng không trả lời thư này.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
  const config = (await import("../config/env.js")).default;
  const base = {
    club_name: "IU CLUB",
    contact_name: "Ban Chủ nhiệm",
    login_url: config.candidatePortalUrl || "https://portal.iuptit.com/login",
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
      html: bodyToHtml(body, { title: subject }),
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
    login_url: "https://portal.iuptit.com/login",
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
