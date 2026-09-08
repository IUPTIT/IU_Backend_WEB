import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import dns from "node:dns/promises";
import config from "../config/env.js";

// Lazily built SMTP transport (chỉ dùng khi không có SendGrid).
let transporter = null;
let sendgridReady = false;

function ensureSendgrid() {
  if (!config.sendgrid.enabled) return false;
  if (!sendgridReady) {
    sgMail.setApiKey(config.sendgrid.apiKey);
    sendgridReady = true;
  }
  return true;
}

function getSmtpTransporter() {
  if (!config.smtp.enabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

async function send({ to, subject, html, text }) {
  const from = config.emailFrom;
  // SendGrid bắt buộc ít nhất 1 content block — không gửi html/text rỗng
  const safeText =
    (text && String(text).trim()) ||
    (html
      ? String(html)
          .replace(/<[^>]+>/g, " ")
          .trim()
      : "") ||
    "(không có nội dung)";
  const safeHtml =
    (html && String(html).trim()) ||
    `<div style="font-family:Arial,sans-serif;color:#1a1a1a;white-space:pre-wrap">${safeText}</div>`;

  // 1) SendGrid Web API — ổn định trên PaaS (không phụ thuộc SMTP outbound)
  if (ensureSendgrid()) {
    try {
      await sgMail.send({
        to,
        from,
        subject,
        text: safeText,
        html: safeHtml,
      });
      return { delivered: true, logged: false, provider: "sendgrid" };
    } catch (err) {
      const detail = err?.response?.body
        ? JSON.stringify(err.response.body)
        : err.message;
      const tx = getSmtpTransporter();
      // Sender chưa verify trên SendGrid → fallback SMTP nếu còn cấu hình (local)
      if (tx && /verified Sender Identity/i.test(detail)) {
        console.warn(
          `[email:sendgrid] Sender chưa verify — fallback SMTP. Chi tiết: ${detail}`,
        );
        await tx.sendMail({
          from,
          to,
          subject,
          html: safeHtml,
          text: safeText,
        });
        return {
          delivered: true,
          logged: false,
          provider: "smtp-fallback",
        };
      }
      console.error(`[email:sendgrid] To: ${to} | ${subject} — ${detail}`);
      throw new Error(`SendGrid gửi thất bại: ${detail}`);
    }
  }

  // 2) SMTP (local / legacy)
  const tx = getSmtpTransporter();
  if (!tx) {
    console.log(`[email:dev] To: ${to} | ${subject}\n${safeText}`);
    return { delivered: false, logged: true, provider: "console" };
  }
  await tx.sendMail({
    from,
    to,
    subject,
    html: safeHtml,
    text: safeText,
  });
  return { delivered: true, logged: false, provider: "smtp" };
}

/** TLD reserved / không nhận mail thật (RFC 2606 + local) */
const RESERVED_TLDS = new Set([
  "test",
  "invalid",
  "localhost",
  "example",
  "local",
  "onion",
]);

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * Kiểm tra địa chỉ trước khi gọi SendGrid/SMTP.
 * - Chặn TLD giả (.test, .invalid, …)
 * - Domain chắc chắn không tồn tại (NXDOMAIN) → fail rõ
 * - DNS mạng lỗi/timeout → không chặn (để provider quyết định)
 * Không phát hiện được mailbox ảo trên domain thật (vd. xxx@gmail.com).
 */
export async function assertRecipientAddress(to) {
  const email = String(to || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_SHAPE.test(email)) {
    throw new Error(`Email không hợp lệ: ${to || "(trống)"}`);
  }
  const domain = email.split("@")[1];
  const tld = domain.split(".").pop();
  if (RESERVED_TLDS.has(tld)) {
    throw new Error(
      `Domain .${tld} không nhận được mail thật (${email}) — dùng email thật (Gmail, …)`,
    );
  }

  const SOFT_DNS = new Set([
    "ETIMEOUT",
    "ECONNREFUSED",
    "ECONNRESET",
    "ESERVFAIL",
    "EREFUSED",
    "EAI_AGAIN",
  ]);

  const tryResolve = async (fn) => {
    try {
      const rows = await Promise.race([
        fn(domain),
        new Promise((_, reject) => {
          const err = new Error("DNS timeout");
          err.code = "ETIMEOUT";
          setTimeout(() => reject(err), 4000);
        }),
      ]);
      return {
        ok: Array.isArray(rows) && rows.length > 0,
        soft: false,
      };
    } catch (err) {
      const code = err?.code || "";
      if (SOFT_DNS.has(code) || /timeout/i.test(String(err?.message || ""))) {
        return { ok: false, soft: true };
      }
      // ENOTFOUND / ENODATA / … → domain không resolve được
      return { ok: false, soft: false };
    }
  };

  const mx = await tryResolve((d) => dns.resolveMx(d));
  if (mx.ok || mx.soft) return email;
  const a = await tryResolve((d) => dns.resolve4(d));
  if (a.ok || a.soft) return email;
  const aaaa = await tryResolve((d) => dns.resolve6(d));
  if (aaaa.ok || aaaa.soft) return email;

  throw new Error(
    `Domain không tồn tại hoặc không nhận mail: ${domain} (${email})`,
  );
}

/** Gửi email tùy chỉnh (subject/html đã render sẵn từ FE). */
export async function sendRawEmail({ to, subject, html, text }) {
  if (!to) throw new Error("Thiếu địa chỉ email người nhận");
  if (!subject?.trim()) throw new Error("Subject không được trống");
  const normalizedTo = await assertRecipientAddress(to);
  return send({ to: normalizedTo, subject, html, text });
}

/**
 * Gửi hàng loạt. Mỗi phần tử đã có subject/html riêng (FE render placeholder).
 * Không dừng cả batch khi 1 thư lỗi — trả chi tiết từng địa chỉ.
 */
export async function sendBulkEmails(messages) {
  let sent = 0;
  let failed = 0;
  let logged = 0;
  const errors = [];
  const results = [];
  for (const msg of messages) {
    const to = msg?.to;
    try {
      const result = await sendRawEmail(msg);
      if (result.delivered) {
        sent += 1;
        results.push({ to, status: "sent" });
      } else if (result.logged) {
        // SMTP tắt — chỉ ghi log console, không tính là đã gửi thật
        logged += 1;
        results.push({
          to,
          status: "logged",
          message: "Chưa gửi thật (SMTP/SendGrid tắt)",
        });
      } else {
        failed += 1;
        const message = "Không gửi được email";
        errors.push({ to, message });
        results.push({ to, status: "failed", message });
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Gửi thất bại";
      errors.push({ to, message });
      results.push({ to, status: "failed", message });
    }
  }
  return { sent, failed, logged, errors, results };
}

/* =====================================================================
 * Template email chuẩn — IU CLUB “HẢI TRÌNH 2026” Campaign Visual Identity
 * (Editorial, Clean, Premium, Table-based, Dark-mode safe, Client-compatible)
 * ===================================================================== */

export const BRAND_COLORS = {
  canvas: "#f4f4fb",
  surface: "#ffffff",
  surfaceAlt: "#f9fafd",
  border: "#eaeaf4",
  borderSubtle: "#f0f1f8",
  ink: "#191a2c",
  sub: "#4d536b",
  muted: "#8f94a6",
  faint: "#9aa0b4",
  primary: "#7c3aed",
  primaryStrong: "#6d28d9",
  primaryTint: "#f1e9fe",
  gradFrom: "#6e2ce6",
  gradTo: "#e0348c",
};

const COLORS = {
  ...BRAND_COLORS,
  text: BRAND_COLORS.ink,
  accent: BRAND_COLORS.primary,
};

/**
 * Render email HTML chuẩn chiến dịch "HẢI TRÌNH" IU CLUB 2026.
 *
 * @param {Object} opts
 * @param {string} opts.title Tiêu đề lớn trong email
 * @param {string} [opts.intro] Đoạn mở đầu / nội dung chính (HTML)
 * @param {Array<{label: string, value: string}>} [opts.rows] Bảng thông tin / chi tiết
 * @param {{label: string, url: string}} [opts.cta] Nút hành động chính
 * @param {string} [opts.note] Ghi chú / cảnh báo cuối email (HTML)
 * @param {string} [opts.preheader] Văn bản preheader xem trước trong hòm thư
 * @param {string} [opts.badge] Nhãn định vị chiến dịch
 */
export function renderEmail({
  title,
  intro = "",
  rows = [],
  cta = null,
  note = "",
  preheader = "",
  badge = "HẢI TRÌNH 2026",
}) {
  const preheaderText =
    preheader ||
    (typeof intro === "string"
      ? intro
          .replace(/<[^>]+>/g, " ")
          .trim()
          .slice(0, 100)
      : title);

  const rowsHtml =
    rows && rows.length
      ? `<table role="presentation" class="email-info-card" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-radius:14px;background-color:${BRAND_COLORS.surfaceAlt};border:1px solid ${BRAND_COLORS.border};overflow:hidden;">
${rows
  .map(
    (
      r,
      i,
    ) => `      <tr class="email-info-row"${i > 0 ? ` style="border-top:1px solid ${BRAND_COLORS.borderSubtle};"` : ""}>
        <td class="email-info-label" style="padding:13px 18px;color:${BRAND_COLORS.muted};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;${i > 0 ? `border-top:1px solid ${BRAND_COLORS.borderSubtle};` : ""}">${r.label}</td>
        <td class="email-info-value" align="right" style="padding:13px 18px;color:${BRAND_COLORS.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;${i > 0 ? `border-top:1px solid ${BRAND_COLORS.borderSubtle};` : ""}">${r.value}</td>
      </tr>`,
  )
  .join("\n")}
    </table>`
      : "";

  const ctaHtml = cta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 24px;">
        <tr>
          <td align="center" style="padding:10px 0;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta.url}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="50%" fillcolor="${BRAND_COLORS.primary}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${cta.label}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" bgcolor="${BRAND_COLORS.primary}" style="border-radius:999px;background:linear-gradient(135deg,${BRAND_COLORS.gradFrom} 0%,${BRAND_COLORS.primary} 100%);">
                  <a href="${cta.url}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;border-radius:999px;box-shadow:0 4px 14px rgba(124,58,237,0.25);">${cta.label}</a>
                </td>
              </tr>
            </table>
            <!--<![endif]-->
          </td>
        </tr>
      </table>`
    : "";

  const noteHtml = note
    ? `<div class="email-note" style="margin:20px 0 0;padding:14px 18px;background-color:#fafafd;border-radius:12px;border-left:3px solid ${BRAND_COLORS.primary};color:${BRAND_COLORS.sub};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.65;">${note}</div>`
    : "";

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
    div[style*="margin: 16px 0"] { margin: 0 !important; }
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
      .email-intro, .email-text { color: #cfcde0 !important; }
      .email-info-card { background-color: #201a30 !important; border-color: #2f2746 !important; }
      .email-info-label { color: #9d98b3 !important; }
      .email-info-value { color: #f4f4fb !important; }
      .email-info-row { border-color: #2b243d !important; }
      .email-note { background-color: #201a30 !important; color: #a5a1ba !important; border-left-color: #9061f9 !important; }
      .email-footer-text { color: #7f7a95 !important; }
      .email-badge { background-color: #2d1f4a !important; color: #c4b5fd !important; }
      .email-wordmark { color: #f4f4fb !important; }
    }
  </style>
</head>
<body class="email-page" style="margin:0;padding:0;background-color:${BRAND_COLORS.canvas};-webkit-font-smoothing:antialiased;">
  <!-- Preheader text preview -->
  <div style="display:none;font-size:1px;color:${BRAND_COLORS.canvas};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    ${preheaderText}
    ${"&zwnj;&nbsp;".repeat(30)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-page" style="background-color:${BRAND_COLORS.canvas};padding:36px 12px 48px;">
    <tr>
      <td align="center">
        <!-- Main Card Container (600px max) -->
        <table role="presentation" width="600" class="email-card" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND_COLORS.surface};border-radius:18px;border:1px solid ${BRAND_COLORS.border};box-shadow:0 8px 30px rgba(25,26,44,0.04);overflow:hidden;">
          
          <!-- Top Route Accent Line (Hải trình) -->
          <tr>
            <td height="4" style="height:4px;line-height:4px;font-size:4px;background:linear-gradient(90deg,${BRAND_COLORS.gradFrom} 0%,${BRAND_COLORS.primary} 50%,${BRAND_COLORS.gradTo} 100%);">&nbsp;</td>
          </tr>

          <!-- Header: Brand & Checkpoint Badge -->
          <tr>
            <td style="padding:28px 36px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <span class="email-wordmark" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:1.5px;color:${BRAND_COLORS.ink};">IU <span style="color:${BRAND_COLORS.primary};">CLUB</span></span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span class="email-badge" style="display:inline-block;padding:5px 13px;background-color:${BRAND_COLORS.primaryTint};color:${BRAND_COLORS.primaryStrong};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;border-radius:999px;">${badge}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hairline Divider -->
          <tr>
            <td style="padding:0 36px;">
              <div style="height:1px;background-color:${BRAND_COLORS.borderSubtle};line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding:28px 36px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              
              <!-- Route Waypoint indicator -->
              <div style="margin-bottom:12px;">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:${BRAND_COLORS.primary};margin-right:6px;vertical-align:middle;"></span>
                <span style="font-size:11px;font-weight:800;letter-spacing:1px;color:${BRAND_COLORS.primary};text-transform:uppercase;vertical-align:middle;">CHECKPOINT</span>
              </div>

              <!-- Main Heading H1 -->
              <h1 class="email-title" style="margin:0 0 16px;color:${BRAND_COLORS.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:23px;line-height:1.35;font-weight:800;letter-spacing:-0.3px;">${title}</h1>

              <!-- Intro / Body text -->
              <div class="email-intro" style="color:${BRAND_COLORS.sub};font-size:15px;line-height:1.7;">
                ${intro}
              </div>

              <!-- Detail / Information Card -->
              ${rowsHtml}

              <!-- Primary Bulletproof CTA Button -->
              ${ctaHtml}

              <!-- Additional Notice / Note -->
              ${noteHtml}

            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="padding:0 36px 28px;">
              <div style="height:1px;background-color:${BRAND_COLORS.borderSubtle};line-height:1px;font-size:1px;margin-bottom:20px;">&nbsp;</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p class="email-footer-text" style="margin:0;font-size:13px;font-weight:700;color:${BRAND_COLORS.sub};letter-spacing:0.5px;">IU CLUB · Shine and Thrive</p>
                    <p class="email-footer-text" style="margin:4px 0 0;font-size:12px;color:${BRAND_COLORS.faint};">Câu lạc bộ IT — Học viện Công nghệ Bưu chính Viễn thông</p>
                    <p class="email-footer-text" style="margin:8px 0 0;font-size:11px;color:${BRAND_COLORS.faint};line-height:1.5;">Email tự động gửi từ hệ thống tuyển dụng IU CLUB · Vui lòng không trả lời thư này.</p>
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

/* ===================================================================== */

export function sendVerificationEmail(to, otp) {
  return send({
    to,
    subject: "[IU CLUB] Mã xác thực tài khoản của bạn",
    text: `Xin chào,\n\nBạn đang thực hiện xác thực tài khoản tại hệ thống IU CLUB.\n\nMã xác thực của bạn: ${otp}\n\nMã có hiệu lực trong 10 phút.\n\nVui lòng không chia sẻ mã này cho bất kỳ ai.\n\nNếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.\n\nIU CLUB — Shine and Thrive\nEmail được gửi tự động, vui lòng không trả lời thư này.`,
    html: renderEmail({
      title: "Xác thực tài khoản 🔐",
      intro:
        "Bạn đang thực hiện xác thực tài khoản tại hệ thống IU CLUB.<br>Dùng mã dưới đây để hoàn tất xác thực:",
      rows: [{ label: "Mã xác thực", value: otp }],
      note: "Mã có hiệu lực trong 10 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.",
    }),
  });
}

// Email xác nhận đã nhận hồ sơ ứng tuyển (nghiệp vụ 1.4) — chưa kèm thông tin đăng nhập
export function sendApplicationReceivedEmail(application) {
  const lookupUrl = `${config.clientUrl}/tra-cuu`;
  const departments = (application.departmentPreferences ?? [])
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((p) => p.department);
  return send({
    to: application.email,
    subject: `[IU CLUB] Đã nhận đơn ứng tuyển của bạn — ${application.applicationCode}`,
    text: `ĐƠN ỨNG TUYỂN ĐÃ ĐƯỢC GHI NHẬN! 🎉\n\nChào ${application.fullName},\n\nCảm ơn bạn đã lựa chọn tham gia hành trình tuyển thành viên của IU CLUB.\n\nĐơn ứng tuyển của bạn đã được hệ thống ghi nhận thành công.\n\nMã hồ sơ: ${application.applicationCode}\nHọ tên: ${application.fullName}\nMSSV: ${application.studentId}\nBan nguyện vọng: ${departments.join(", ")}\n\nTra cứu hồ sơ: ${lookupUrl}\n\nVui lòng lưu lại mã hồ sơ để theo dõi trạng thái và chỉnh sửa đơn trong thời gian đợt tuyển còn mở.\n\nThe journey has begun. See you on the next checkpoint! 🧭\n\nTrân trọng,\nBan Tuyển thành viên IU CLUB`,
    html: renderEmail({
      title: "Đơn ứng tuyển đã được ghi nhận! 🎉",
      intro: `Chào <b style="color:${COLORS.text}">${application.fullName}</b>,<br><br>Cảm ơn bạn đã lựa chọn tham gia hành trình tuyển thành viên của IU CLUB. Đơn ứng tuyển của bạn đã được hệ thống ghi nhận thành công.`,
      rows: [
        { label: "Mã hồ sơ", value: application.applicationCode },
        { label: "Họ tên", value: application.fullName },
        { label: "MSSV", value: application.studentId },
        { label: "Ban nguyện vọng", value: departments.join(", ") },
      ],
      cta: { label: "Tra cứu hồ sơ", url: lookupUrl },
      note: "Vui lòng lưu lại mã hồ sơ để theo dõi trạng thái và chỉnh sửa đơn trong thời gian đợt tuyển còn mở.<br><br><em>The journey has begun. See you on the next checkpoint! 🧭</em>",
    }),
  });
}

// Email gửi link tiếp tục điền đơn nháp cho Guest (nghiệp vụ 1.2)
export function sendDraftLinkEmail(application, draftToken) {
  const url = `${config.clientUrl}/tuyen-thanh-vien?token=${draftToken}`;
  return send({
    to: application.email,
    subject: "[IU CLUB] Đơn ứng tuyển của bạn đang chờ hoàn thiện",
    text: `Chào bạn,\n\nĐơn ứng tuyển IU CLUB của bạn hiện đang được lưu dưới dạng bản nháp.\n\nBạn có thể tiếp tục hoàn thiện đơn bằng liên kết dưới đây:\n\nTiếp tục điền đơn: ${url}\n\nLiên kết có hiệu lực cho đến khi đợt tuyển đóng đơn.\n\nVui lòng không chia sẻ liên kết này cho người khác.\n\nYour journey is saved. Come back when you're ready. 💙\n\nTrân trọng,\nBan Tuyển thành viên IU CLUB`,
    html: renderEmail({
      title: "Đơn ứng tuyển đang chờ hoàn thiện 📝",
      intro:
        "Đơn ứng tuyển IU CLUB của bạn hiện đang được lưu dưới dạng bản nháp. Bạn có thể tiếp tục hoàn thiện đơn bất cứ lúc nào trước khi đợt tuyển chính thức đóng đơn.",
      cta: { label: "Tiếp tục điền đơn", url },
      note: "Liên kết có hiệu lực cho đến khi đợt tuyển đóng đơn. Vui lòng không chia sẻ liên kết này cho người khác.<br><br><em>Your journey is saved. Come back when you're ready. 💙</em>",
    }),
  });
}

// Pass vòng đơn — Auto Rule `cv_pass` (tắt rule = không gửi)
export async function sendCandidateAccountEmail(application, rawPassword) {
  const loginUrl =
    config.candidatePortalUrl || "https://portal.iuptit.com/login";
  const automation = await import("./emailAutomation.service.js");
  // Lúc Pass CV thường chưa có lịch — placeholder mặc định; Admin sửa template trong Settings
  return automation.dispatchAutomatedEmail("cv_pass", {
    to: application.email,
    data: automation.applicationEmailData(application, {
      result: "ĐẠT vòng đơn — vào Vòng Phỏng vấn",
      temp_password: rawPassword,
      login_url: loginUrl,
      interview_time: "Đăng nhập portal để chọn ca phỏng vấn phù hợp",
      location: "Sẽ hiển thị khi bạn đăng ký lịch (hoặc Ban Tuyển thông báo)",
      interview_date: "—",
    }),
  });
}

// Thông báo bị loại — map status → eventKey automation
export async function sendApplicationRejectedEmail(application, round) {
  const automation = await import("./emailAutomation.service.js");
  const eventKey =
    round === "failed_cv"
      ? "cv_fail"
      : round === "failed_interview"
        ? "interview_fail"
        : "final_fail";
  const roundLabel =
    round === "failed_cv"
      ? "vòng đơn"
      : round === "failed_interview"
        ? "vòng phỏng vấn"
        : "vòng xét duyệt cuối";
  return automation.dispatchAutomatedEmail(eventKey, {
    to: application.email,
    data: automation.applicationEmailData(application, {
      result: `Không đạt ${roundLabel}`,
    }),
  });
}

// Đạt vòng phỏng vấn
export async function sendInterviewPassedEmail(application) {
  const automation = await import("./emailAutomation.service.js");
  const loginUrl =
    config.candidatePortalUrl || "https://portal.iuptit.com/login";
  return automation.dispatchAutomatedEmail("interview_pass", {
    to: application.email,
    data: automation.applicationEmailData(application, {
      result: "ĐẠT vòng phỏng vấn",
      login_url: loginUrl,
    }),
  });
}

// Trúng tuyển (admitted) — chỉ final_pass.
// welcome_member gửi khi promote Member chính thức (sau training).
export async function sendAdmittedEmail(application) {
  const automation = await import("./emailAutomation.service.js");
  const loginUrl =
    config.candidatePortalUrl || "https://portal.iuptit.com/login";
  return automation.dispatchAutomatedEmail("final_pass", {
    to: application.email,
    data: automation.applicationEmailData(application, {
      result: "TRÚNG TUYỂN",
      login_url: loginUrl,
    }),
  });
}

/** Chào mừng Member chính thức — sau khi hoàn thành training / BCN chốt Đạt */
export async function sendWelcomeMemberEmail(user, extra = {}) {
  if (!user?.email) return null;
  const automation = await import("./emailAutomation.service.js");
  const loginUrl =
    config.candidatePortalUrl || "https://portal.iuptit.com/login";
  return automation.dispatchAutomatedEmail("welcome_member", {
    to: user.email,
    data: {
      candidate_name: user.name || "",
      email: user.email || "",
      department: extra.department || "",
      result: "THÀNH VIÊN CHÍNH THỨC",
      club_name: "IU CLUB",
      login_url: loginUrl,
      ...extra,
    },
  });
}

/**
 * Gửi thông tin tài khoản cho Member chính thức
 * sau khi hoàn thành Training.
 * Account: email
 * Password: studentId
 */
export async function sendOfficialMemberAccountEmail(
  user,
  { department = "", temporaryPassword = "" } = {},
) {
  if (!user?.email) return null;
  const automation = await import("./emailAutomation.service.js");
  const loginUrl = `${config.clientUrl}/login`;
  return automation.dispatchAutomatedEmail("official_member_created", {
    to: user.email,
    data: {
      candidate_name: user.name || user.fullName || "",
      email: user.email || "",
      department: department || "",
      temporary_password: temporaryPassword,
      login_url: loginUrl,
      result: "THÀNH VIÊN CHÍNH THỨC",
      club_name: "IU CLUB",
    },
  });
}

// Xác nhận đặt / đổi lịch phỏng vấn
export async function sendBookingConfirmedEmail(application, slot) {
  const date = new Date(slot.date).toLocaleDateString("vi-VN");
  const automation = await import("./emailAutomation.service.js");
  return automation.dispatchAutomatedEmail("booking_confirmed", {
    to: application.email,
    data: automation.applicationEmailData(application, {
      interview_date: date,
      interview_time: `${slot.startTime} - ${slot.endTime}`,
      location: slot.location || "—",
      meeting_link: slot.meetingLink || "",
      result: "Đã xác nhận lịch",
    }),
  });
}

/** Thông báo Leader/BCN được phân công phụ trách một ca phỏng vấn */
export function sendInterviewerAssignedEmail(user, slot) {
  const date = new Date(slot.date).toLocaleDateString("vi-VN");
  const slotId = slot._id ?? slot.id;
  const path =
    user.role === "bcn"
      ? `/admin/recruitment/interviews/slots/${slotId}`
      : user.role === "member"
        ? `/member/recruitment/interviews/slots/${slotId}`
        : `/leader/recruitment/interviews/slots/${slotId}`;
  const url = `${config.clientUrl}${path}`;
  return send({
    to: user.email,
    subject: `[IU CLUB] Phân công phỏng vấn — ${date} ${slot.startTime}`,
    text: `Chào ${user.name},\n\nBan Chủ nhiệm đã phân công bạn phụ trách ca phỏng vấn sau:\n- Ngày: ${date}\n- Thời gian: ${slot.startTime} – ${slot.endTime}\n- Địa điểm / Hình thức: ${slot.location}\n- Số ứng viên: ${slot.bookedCount ?? 0}/${slot.capacity ?? "—"}\n\nXem chi tiết: ${url}\n\nVui lòng kiểm tra thông tin và chuẩn bị trước giờ phỏng vấn.\n\nMỗi cuộc gặp là một điểm dừng mới trong hành trình tìm kiếm những thành viên tiếp theo của IU CLUB.\n\nTrân trọng,\nBan Chủ nhiệm IU CLUB`,
    html: renderEmail({
      title: "Phân công ca phỏng vấn 🧭",
      intro: `Chào <b style="color:${COLORS.text}">${user.name}</b>! Ban Chủ nhiệm đã phân công bạn phụ trách ca phỏng vấn sau:`,
      rows: [
        { label: "Ngày", value: date },
        { label: "Thời gian", value: `${slot.startTime} – ${slot.endTime}` },
        { label: "Địa điểm / Hình thức", value: slot.location },
        {
          label: "Số ứng viên",
          value: `${slot.bookedCount ?? 0}/${slot.capacity ?? "—"} ứng viên`,
        },
      ],
      cta: { label: "Xem chi tiết ca phỏng vấn", url },
      note: "Vui lòng kiểm tra thông tin và chuẩn bị trước giờ phỏng vấn.<br><br><em>Mỗi cuộc gặp là một điểm dừng mới trong hành trình tìm kiếm những thành viên tiếp theo của IU CLUB.</em>",
    }),
  });
}

/** Nhắc lịch PV — truyền ruleKey (vd. interview_remind_24h) để chỉ gửi 1 mốc */
export async function sendInterviewReminderEmail(
  application,
  slot,
  timeLeftLabel,
  { ruleKey } = {},
) {
  const date = new Date(slot.date).toLocaleDateString("vi-VN");
  const automation = await import("./emailAutomation.service.js");
  return automation.dispatchAutomatedEmail("interview_remind", {
    to: application.email,
    ruleKey,
    data: automation.applicationEmailData(application, {
      interview_date: date,
      interview_time: `${slot.startTime} - ${slot.endTime}`,
      location: slot.location || "—",
      time_left: timeLeftLabel,
      result: `Nhắc lịch — còn ${timeLeftLabel}`,
    }),
  });
}

export function sendPasswordResetEmail(to, resetToken) {
  const url = `${config.clientUrl}/reset-password?token=${resetToken}`;
  return send({
    to,
    subject: "[IU CLUB] Đặt lại mật khẩu tài khoản",
    text: `Xin chào,\n\nBạn hoặc một người có quyền truy cập tài khoản này vừa yêu cầu đặt lại mật khẩu IU CLUB.\n\nĐặt lại mật khẩu: ${url}\n\nLiên kết có hiệu lực trong 30 phút.\n\nNếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email và không chia sẻ liên kết cho người khác.\n\nMột bước nhỏ để tiếp tục hành trình.\n\nIU CLUB — Shine and Thrive\nEmail được gửi tự động, vui lòng không trả lời thư này.`,
    html: renderEmail({
      title: "Đặt lại mật khẩu 🔐",
      intro:
        "Bạn hoặc một người có quyền truy cập tài khoản này vừa yêu cầu đặt lại mật khẩu IU CLUB.",
      cta: { label: "Đặt lại mật khẩu", url },
      note: "Liên kết có hiệu lực trong 30 phút. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email và không chia sẻ liên kết cho người khác.<br><br>Một bước nhỏ để tiếp tục hành trình.",
    }),
  });
}

/** Thông báo tân binh đã được chia nhóm training + mentor */
export function sendTrainingGroupAssignedEmail(trainee, group, mentorName) {
  const url = `${config.clientUrl}/candidate/training`;
  return send({
    to: trainee.email,
    subject: `[IU CLUB] Bạn đã được chia nhóm Training — ${group.name}`,
    text: `Chào ${trainee.fullName},\n\nBạn đã được phân vào nhóm Training ${group.name}.\n\nMentor: ${mentorName}\n\nThông tin chi tiết về chương trình Training và các nhiệm vụ sẽ được cập nhật trên Portal.\n\nPortal Training: ${url}\n\nChặng training chính thức bắt đầu — hãy sẵn sàng khám phá và đồng hành cùng những người bạn mới! 🧭\n\nTrân trọng,\nIU CLUB`,
    html: renderEmail({
      title: "Bạn đã được chia nhóm Training 🎓",
      intro: `Chào <b style="color:${COLORS.text}">${trainee.fullName}</b>!<br><br>Bạn đã được phân vào nhóm Training <b style="color:${COLORS.accent}">${group.name}</b>.<br>Mentor phụ trách: <b>${mentorName}</b>.`,
      cta: { label: "Vào Portal Training", url },
      note: "Chặng training chính thức bắt đầu — hãy sẵn sàng khám phá và đồng hành cùng những người bạn mới! 🧭",
    }),
  });
}

/** Nhắc lần cuối khi chưa hoàn thành training đúng hạn */
export function sendTrainingIncompleteReminderEmail(trainee, reason) {
  const url = `${config.clientUrl}/candidate/training`;
  return send({
    to: trainee.email,
    subject: "[IU CLUB] Nhắc bạn hoàn thành chương trình Training",
    text: `Chào ${trainee.fullName},\n\nHệ thống ghi nhận rằng bạn chưa hoàn thành chương trình Training theo yêu cầu.\n\nLý do / Nội dung: ${reason}\n\nVui lòng hoàn thiện các nội dung còn thiếu trước thời hạn để tiếp tục hành trình Training cùng IU CLUB.\n\nViệc không hoàn thành đúng yêu cầu có thể ảnh hưởng đến kết quả Training và quá trình đánh giá thành viên.\n\nNếu bạn gặp khó khăn, vui lòng liên hệ Mentor hoặc Ban phụ trách để được hỗ trợ.\n\nĐừng bỏ lỡ chặng đường của mình.\n\nXem tiến độ: ${url}\n\nTrân trọng,\nIU CLUB`,
    html: renderEmail({
      title: "Nhắc hoàn thành chương trình Training ⏰",
      intro: `Chào <b style="color:${COLORS.text}">${trainee.fullName}</b>!<br><br>Hệ thống ghi nhận rằng bạn chưa hoàn thành chương trình Training theo yêu cầu.<br>Lý do / Nội dung: <b>${reason}</b>`,
      cta: { label: "Xem tiến độ của tôi", url },
      note: "Vui lòng hoàn thiện các nội dung còn thiếu trước thời hạn. Việc không hoàn thành đúng hạn có thể ảnh hưởng đến kết quả Training và quá trình đánh giá thành viên.<br><br><em>Đừng bỏ lỡ chặng đường của mình.</em>",
    }),
  });
}

/** Nhắc deadline task training sắp tới / quá hạn */
export function sendTaskDeadlineReminderEmail(trainee, task, timeLeftLabel) {
  const url = `${config.clientUrl}/candidate/training`;
  return send({
    to: trainee.email,
    subject: `[IU CLUB] Nhắc deadline Task Training — ${task.title}`,
    text: `Chào ${trainee.fullName},\n\nĐây là lời nhắc về Task Training bạn cần hoàn thành:\n\nTask: ${task.title}\nThời gian còn lại: ${timeLeftLabel}\n\nHãy hoàn thành và nộp bài trước thời hạn để đảm bảo tiến độ Training.\n\nXem và nộp bài tại: ${url}\n\nEvery checkpoint counts. Keep moving forward. 🧭\n\nTrân trọng,\nIU CLUB`,
    html: renderEmail({
      title: "Nhắc deadline Task Training ⏰",
      intro: `Chào <b style="color:${COLORS.text}">${trainee.fullName}</b>!<br><br>Đây là lời nhắc về Task Training: <b style="color:${COLORS.accent}">${task.title}</b> (còn ${timeLeftLabel}).`,
      rows: [
        { label: "Task", value: task.title },
        { label: "Thời gian còn lại", value: timeLeftLabel },
      ],
      cta: { label: "Xem & nộp bài", url },
      note: "Hãy hoàn thành và nộp bài trước thời hạn để đảm bảo tiến độ Training.<br><br><em>Every checkpoint counts. Keep moving forward. 🧭</em>",
    }),
  });
}

/** Nhắc đăng ký lịch PV — Auto Rule book_slot_remind */
export async function sendUnbookedReminderEmail(
  application,
  { deadlineLabel } = {},
) {
  const loginUrl =
    config.candidatePortalUrl || "https://portal.iuptit.com/login";
  const deadline =
    deadlineLabel || "trước khi hết hạn đăng ký lịch (xem portal ứng viên)";
  const automation = await import("./emailAutomation.service.js");
  return automation.dispatchAutomatedEmail("book_slot_remind", {
    to: application.email,
    data: automation.applicationEmailData(application, {
      booking_deadline: deadline,
      login_url: loginUrl,
      result: "Chưa đăng ký lịch PV",
    }),
  });
}

/** Thông báo gán / chuyển / gỡ Ban */
export function sendDepartmentMembershipEmail(user, title, body) {
  const url = `${config.clientUrl}/member`;
  return send({
    to: user.email,
    subject: `IU CLUB — ${title}`,
    text: `${body} Xem: ${url}`,
    html: renderEmail({
      title,
      intro: `Chào <b style="color:${COLORS.text}">${user.name}</b>! ${body}`,
      cta: { label: "Vào Member Portal", url },
    }),
  });
}

/** Thông báo chỉ định / thu hồi Leader */
export function sendLeaderAppointmentEmail(user, title, body) {
  const url = `${config.clientUrl}/leader`;
  return send({
    to: user.email,
    subject: `IU CLUB — ${title}`,
    text: `${body} Xem: ${url}`,
    html: renderEmail({
      title,
      intro: `Chào <b style="color:${COLORS.text}">${user.name}</b>! ${body}`,
      cta: { label: "Vào Leader Portal", url },
      note: "Tài khoản và mật khẩu của bạn không đổi. Menu Leader sẽ xuất hiện khi đăng nhập.",
    }),
  });
}

/**
 * Gửi email chào mừng thành viên chính thức CLB mới được tạo bởi admin.
 * Chứa mật khẩu tạm — thành viên bắt buộc đổi ngay khi đăng nhập lần đầu.
 *
 * @param {{ name: string, email: string, tempPassword: string }} opts
 */
export function sendMemberWelcome({ name, email, tempPassword }) {
  const loginUrl =
    config.candidatePortalUrl || "https://portal.iuptit.com/login";
  return send({
    to: email,
    subject: "IU CLUB — Tài khoản thành viên của bạn đã được tạo",
    text:
      `Xin chào ${name},\n\n` +
      `Tài khoản thành viên IU CLUB của bạn đã được Ban Chủ nhiệm tạo thành công.\n\n` +
      `Email: ${email}\n` +
      `Mật khẩu tạm thời: ${tempPassword}\n` +
      `Đăng nhập: ${loginUrl}\n\n` +
      `Vui lòng đăng nhập và đổi mật khẩu ngay trong lần truy cập đầu tiên để đảm bảo an toàn cho tài khoản.\n\n` +
      `Chào mừng bạn đến với hành trình cùng IU CLUB. 🧭\n\n` +
      `IU CLUB — Shine and Thrive\n` +
      `Email được gửi tự động, vui lòng không trả lời thư này.`,
    html: renderEmail({
      title: "Chào mừng bạn đến với IU CLUB! 🎉",
      intro:
        `Xin chào <b style="color:${COLORS.text}">${name}</b>!<br><br>` +
        `Tài khoản thành viên IU CLUB của bạn đã được Ban Chủ nhiệm tạo thành công. ` +
        `Dưới đây là thông tin đăng nhập của bạn:`,
      rows: [
        { label: "Email đăng nhập", value: email },
        {
          label: "Mật khẩu tạm thời",
          value: `<code style="font-family:monospace;letter-spacing:1px">${tempPassword}</code>`,
        },
      ],
      cta: { label: "Đăng nhập ngay →", url: loginUrl },
      note:
        `⚠️ Vui lòng đăng nhập và <b style="color:${COLORS.text}">đổi mật khẩu ngay</b> trong lần truy cập đầu tiên để đảm bảo an toàn cho tài khoản.<br><br>` +
        `Chào mừng bạn đến với hành trình cùng IU CLUB. 🧭`,
    }),
  });
}
