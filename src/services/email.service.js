import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
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

  // 1) SendGrid Web API — ổn định trên PaaS (không phụ thuộc SMTP outbound)
  if (ensureSendgrid()) {
    try {
      await sgMail.send({
        to,
        from,
        subject,
        text: text || undefined,
        html: html || undefined,
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
        await tx.sendMail({ from, to, subject, html, text });
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
    console.log(`[email:dev] To: ${to} | ${subject}\n${text ?? html}`);
    return { delivered: false, logged: true, provider: "console" };
  }
  await tx.sendMail({ from, to, subject, html, text });
  return { delivered: true, logged: false, provider: "smtp" };
}

/** Gửi email tùy chỉnh (subject/html đã render sẵn từ FE). */
export async function sendRawEmail({ to, subject, html, text }) {
  if (!to) throw new Error("Thiếu địa chỉ email người nhận");
  if (!subject?.trim()) throw new Error("Subject không được trống");
  return send({ to, subject, html, text });
}

/**
 * Gửi hàng loạt. Mỗi phần tử đã có subject/html riêng (FE render placeholder).
 * Không dừng cả batch khi 1 thư lỗi.
 */
export async function sendBulkEmails(messages) {
  let sent = 0;
  let failed = 0;
  let logged = 0;
  const errors = [];
  for (const msg of messages) {
    try {
      const result = await sendRawEmail(msg);
      if (result.delivered) {
        sent += 1;
      } else if (result.logged) {
        // SMTP tắt — chỉ ghi log console, không tính là đã gửi thật
        logged += 1;
      } else {
        failed += 1;
        errors.push({ to: msg.to, message: "Không gửi được email" });
      }
    } catch (err) {
      failed += 1;
      errors.push({
        to: msg.to,
        message: err instanceof Error ? err.message : "Gửi thất bại",
      });
    }
  }
  return { sent, failed, logged, errors };
}

/* =====================================================================
 * Template email chung — theme tối + gradient tím theo landing page
 * (inline CSS + table layout để tương thích Gmail/Outlook)
 * ===================================================================== */

const COLORS = {
  page: "#0a0312", // hsl(260 87% 3%)
  card: "#1b1330", // hsl(258 45% 11%)
  cardBottom: "#120a1f", // hsl(260 55% 7%)
  text: "#f2f1ee", // hsl(40 6% 95%)
  sub: "#cfcdc7", // hsl(40 6% 82%)
  muted: "#8f8ca0",
  accent: "#a78bfa",
  gradFrom: "#6366f1",
  gradTo: "#a855f7",
  divider: "rgba(255,255,255,0.08)",
};

/**
 * @param {Object} opts
 * @param {string} opts.title Tiêu đề lớn trong mail
 * @param {string} [opts.intro] Đoạn mở đầu (HTML)
 * @param {Array<{label: string, value: string}>} [opts.rows] Bảng thông tin
 * @param {{label: string, url: string}} [opts.cta] Nút hành động chính
 * @param {string} [opts.note] Ghi chú cuối (HTML)
 */
function renderEmail({ title, intro = "", rows = [], cta = null, note = "" }) {
  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-radius:16px;background:rgba(255,255,255,0.04);">
${rows
  .map(
    (r, i) => `        <tr>
          <td style="padding:12px 18px;color:${COLORS.muted};font-size:13px;${i > 0 ? `border-top:1px solid ${COLORS.divider};` : ""}">${r.label}</td>
          <td align="right" style="padding:12px 18px;color:${COLORS.text};font-size:14px;font-weight:700;${i > 0 ? `border-top:1px solid ${COLORS.divider};` : ""}">${r.value}</td>
        </tr>`,
  )
  .join("\n")}
      </table>`
    : "";

  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr>
          <td align="center" bgcolor="${COLORS.gradFrom}" style="border-radius:999px;background:linear-gradient(to right,${COLORS.gradFrom},${COLORS.gradTo});">
            <a href="${cta.url}" target="_blank" style="display:inline-block;padding:14px 34px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:999px;">${cta.label}</a>
          </td>
        </tr>
      </table>`
    : "";

  const noteHtml = note
    ? `<p style="margin:0 0 8px;color:${COLORS.muted};font-size:13px;line-height:1.6;">${note}</p>`
    : "";

  return `<!doctype html>
<html lang="vi">
<body style="margin:0;padding:0;background-color:${COLORS.page};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.page};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding:8px 0 24px;">
              <span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;letter-spacing:2px;color:${COLORS.text};">IU <span style="color:${COLORS.accent};">CLUB</span></span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="border-radius:24px;background:linear-gradient(160deg,${COLORS.card} 0%,${COLORS.cardBottom} 100%);background-color:${COLORS.card};padding:36px 32px;font-family:Arial,Helvetica,sans-serif;">
              <h1 style="margin:0 0 16px;color:${COLORS.text};font-size:22px;line-height:1.35;">${title}</h1>
              <p style="margin:0 0 8px;color:${COLORS.sub};font-size:15px;line-height:1.7;">${intro}</p>
              ${rowsHtml}
              ${ctaHtml}
              ${noteHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 8px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${COLORS.muted};">Câu lạc bộ IT — Học viện Công nghệ Bưu chính Viễn thông</p>
              <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${COLORS.muted};">Email tự động — vui lòng không trả lời thư này.</p>
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
    subject: "IU CLUB — Mã xác thực tài khoản của bạn",
    text: `Mã xác thực của bạn là ${otp}. Mã hết hạn sau 10 phút.`,
    html: renderEmail({
      title: "Xác thực tài khoản",
      intro: "Dùng mã dưới đây để xác thực tài khoản IU CLUB của bạn:",
      rows: [{ label: "Mã xác thực", value: otp }],
      note: "Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.",
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
    subject: `IU CLUB đã nhận đơn ứng tuyển của bạn (${application.applicationCode})`,
    text: `IU CLUB da nhan don ung tuyen. Ma ho so: ${application.applicationCode}. Tra cuu tai: ${lookupUrl}`,
    html: renderEmail({
      title: "Đã nhận đơn ứng tuyển của bạn! 🎉",
      intro: `Cảm ơn <b style="color:${COLORS.text}">${application.fullName}</b> đã ứng tuyển vào IU CLUB. Hồ sơ của bạn đã được ghi nhận và sẽ được xét duyệt sớm.`,
      rows: [
        { label: "Mã hồ sơ", value: application.applicationCode },
        { label: "Họ tên", value: application.fullName },
        { label: "MSSV", value: application.studentId },
        { label: "Ban nguyện vọng", value: departments.join(", ") },
      ],
      cta: { label: "Tra cứu hồ sơ", url: lookupUrl },
      note: "Lưu lại mã hồ sơ để tra cứu trạng thái và chỉnh sửa đơn trước hạn đóng.",
    }),
  });
}

// Email gửi link tiếp tục điền đơn nháp cho Guest (nghiệp vụ 1.2)
export function sendDraftLinkEmail(application, draftToken) {
  const url = `${config.clientUrl}/tuyen-thanh-vien?token=${draftToken}`;
  return send({
    to: application.email,
    subject: "IU CLUB — Link tiếp tục điền đơn ứng tuyển của bạn",
    text: `Don ung tuyen cua ban da duoc luu nhap. Tiep tuc dien tai: ${url}`,
    html: renderEmail({
      title: "Đơn ứng tuyển đã được lưu nháp 📝",
      intro:
        "Bạn có thể tiếp tục điền đơn bất cứ lúc nào bằng nút bên dưới — thông tin đã nhập được giữ nguyên.",
      cta: { label: "Tiếp tục điền đơn", url },
      note: "Link có hiệu lực tới khi đợt tuyển đóng đơn. Không chia sẻ link này cho người khác.",
    }),
  });
}

// Pass vòng đơn — Auto Rule `cv_pass` (tắt rule = không gửi)
export async function sendCandidateAccountEmail(application, rawPassword) {
  const loginUrl = `${config.clientUrl}/login`;
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
  const loginUrl = `${config.clientUrl}/login`;
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
  const loginUrl = `${config.clientUrl}/login`;
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
  const loginUrl = `${config.clientUrl}/login`;
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
  const portalHint =
    user.role === "bcn"
      ? "Vào Admin › Tuyển dụng › Phỏng vấn để xem ứng viên và chấm điểm."
      : user.role === "member"
        ? "Vào Member Portal › Ca phỏng vấn của tôi để xem ứng viên và chấm điểm."
        : "Vào Leader Portal › Tuyển dụng › Ca của tôi để xem danh sách ứng viên và chấm điểm.";
  return send({
    to: user.email,
    subject: `IU CLUB — Bạn được phân công phỏng vấn (${date} ${slot.startTime})`,
    text: `Ban duoc phan cong phong van luc ${slot.startTime}-${slot.endTime} ngay ${date} tai ${slot.location}. Xem: ${url}`,
    html: renderEmail({
      title: "Bạn được phân công phỏng vấn",
      intro: `Chào <b style="color:${COLORS.text}">${user.name}</b>! Ban Chủ nhiệm vừa phân bạn phụ trách ca phỏng vấn sau:`,
      rows: [
        { label: "Ngày", value: date },
        { label: "Giờ", value: `${slot.startTime} - ${slot.endTime}` },
        { label: "Địa điểm", value: slot.location },
        {
          label: "Sức chứa",
          value: `${slot.bookedCount ?? 0}/${slot.capacity ?? "—"} ứng viên`,
        },
      ],
      cta: { label: "Xem ca phỏng vấn", url },
      note: portalHint,
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
    subject: "IU CLUB — Đặt lại mật khẩu",
    text: `Dat lai mat khau tai: ${url} (hieu luc 30 phut).`,
    html: renderEmail({
      title: "Đặt lại mật khẩu",
      intro:
        "Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản IU CLUB này.",
      cta: { label: "Đặt lại mật khẩu", url },
      note: "Link có hiệu lực trong 30 phút. Nếu không phải bạn yêu cầu, hãy bỏ qua email này.",
    }),
  });
}

/** Thông báo tân binh đã được chia nhóm training + mentor */
export function sendTrainingGroupAssignedEmail(trainee, group, mentorName) {
  const url = `${config.clientUrl}/candidate/training`;
  return send({
    to: trainee.email,
    subject: `IU CLUB — Bạn đã được chia nhóm training (${group.name})`,
    text: `Ban da duoc chia nhom ${group.name}. Mentor: ${mentorName}. Xem tai ${url}`,
    html: renderEmail({
      title: "Bạn đã được chia nhóm training 🎓",
      intro: `Chào <b style="color:${COLORS.text}">${trainee.fullName}</b>! Bạn thuộc nhóm <b style="color:${COLORS.accent}">${group.name}</b>. Mentor phụ trách: <b>${mentorName}</b>.`,
      cta: { label: "Xem lộ trình training", url },
      note: "Vào portal thành viên để xem lộ trình, task và trao đổi với mentor.",
    }),
  });
}

/** Nhắc lần cuối khi chưa hoàn thành training đúng hạn */
export function sendTrainingIncompleteReminderEmail(trainee, reason) {
  const url = `${config.clientUrl}/candidate/training`;
  return send({
    to: trainee.email,
    subject: "IU CLUB — Nhắc hoàn thành chương trình training",
    text: `Ban chuwa hoan thanh training. Ly do: ${reason}. Xem tai ${url}`,
    html: renderEmail({
      title: "Nhắc hoàn thành training ⏰",
      intro: `Chào <b style="color:${COLORS.text}">${trainee.fullName}</b>! Ban Chủ nhiệm nhắc bạn hoàn thành chương trình training. Lý do: ${reason}`,
      cta: { label: "Xem tiến độ của tôi", url },
      note: "Nếu không hoàn thành đúng hạn, bạn có thể bị loại khỏi CLB.",
    }),
  });
}

/** Nhắc deadline task training sắp tới / quá hạn */
export function sendTaskDeadlineReminderEmail(trainee, task, timeLeftLabel) {
  const url = `${config.clientUrl}/candidate/training`;
  return send({
    to: trainee.email,
    subject: `IU CLUB — Nhắc task training: ${task.title}`,
    text: `Task "${task.title}" ${timeLeftLabel}. Xem tai ${url}`,
    html: renderEmail({
      title: "Nhắc deadline task training",
      intro: `Chào <b style="color:${COLORS.text}">${trainee.fullName}</b>! Task <b style="color:${COLORS.accent}">${task.title}</b> ${timeLeftLabel}.`,
      cta: { label: "Xem & nộp bài", url },
      note: "Nộp bài trước hạn để mentor kịp chấm điểm.",
    }),
  });
}

/** Nhắc đăng ký lịch PV — Auto Rule book_slot_remind */
export async function sendUnbookedReminderEmail(
  application,
  { deadlineLabel } = {},
) {
  const loginUrl = `${config.clientUrl}/login`;
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
