import nodemailer from "nodemailer";
import config from "../config/env.js";

// Lazily built transport; when SMTP is unset, emails are logged to console.
let transporter = null;

function getTransporter() {
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
  const tx = getTransporter();
  if (!tx) {
    console.log(`[email:dev] To: ${to} | ${subject}\n${text ?? html}`);
    return;
  }
  await tx.sendMail({ from: config.smtp.from, to, subject, html, text });
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

// Pass vòng đơn — gửi kèm tài khoản candidate (mật khẩu mặc định là ngày sinh DDMMYYYY)
export function sendCandidateAccountEmail(application, rawPassword) {
  const loginUrl = `${config.clientUrl}/login`;
  return send({
    to: application.email,
    subject: `Chúc mừng bạn đã vượt qua vòng đơn IU CLUB! (${application.applicationCode})`,
    text: `Chuc mung! Ho so dat vong don. Tai khoan: ${application.email} / ${rawPassword}. Dang nhap tai ${loginUrl} de dat lich phong van.`,
    html: renderEmail({
      title: "Bạn đã vượt qua vòng đơn! 🚀",
      intro: `Chúc mừng <b style="color:${COLORS.text}">${application.fullName}</b>! Hồ sơ <b style="color:${COLORS.accent}">${application.applicationCode}</b> đã <b style="color:${COLORS.text}">ĐẠT vòng đơn</b>. Bước tiếp theo: đăng nhập và chọn ca phỏng vấn.`,
      rows: [
        { label: "Tài khoản", value: application.email },
        { label: "Mật khẩu", value: rawPassword },
      ],
      cta: { label: "Đăng nhập & đặt lịch phỏng vấn", url: loginUrl },
      note: "Hệ thống sẽ yêu cầu đổi mật khẩu ngay lần đăng nhập đầu tiên. Vào mục <b>Lịch phỏng vấn</b> để chọn ca phù hợp.",
    }),
  });
}

// Thông báo bị loại — round: "failed_cv" | "failed_interview" | "rejected"
export function sendApplicationRejectedEmail(application, round) {
  const roundLabel =
    round === "failed_cv"
      ? "vòng đơn"
      : round === "failed_interview"
        ? "vòng phỏng vấn"
        : "vòng xét duyệt cuối";
  const accountNote =
    round === "failed_cv"
      ? "Hẹn gặp lại bạn ở đợt tuyển sau — đừng nản nhé!"
      : "Tài khoản ứng viên của bạn đã được vô hiệu hoá. Hẹn gặp lại bạn ở đợt tuyển sau!";
  return send({
    to: application.email,
    subject: `Kết quả ứng tuyển IU CLUB (${application.applicationCode})`,
    text: `Cam on ban da ung tuyen. Rat tiec ho so chua phu hop o ${roundLabel}. ${accountNote}`,
    html: renderEmail({
      title: "Kết quả ứng tuyển",
      intro: `Cảm ơn <b style="color:${COLORS.text}">${application.fullName}</b> đã dành thời gian ứng tuyển vào IU CLUB. Rất tiếc hồ sơ <b style="color:${COLORS.accent}">${application.applicationCode}</b> của bạn chưa phù hợp ở <b style="color:${COLORS.text}">${roundLabel}</b>.`,
      note: accountNote,
    }),
  });
}

// Đạt vòng phỏng vấn — chúc mừng, chờ kết quả xét duyệt cuối
export function sendInterviewPassedEmail(application) {
  return send({
    to: application.email,
    subject: `Chúc mừng bạn đã vượt qua vòng phỏng vấn IU CLUB! (${application.applicationCode})`,
    text: `Chuc mung ${application.fullName}! Ban da DAT vong phong van. Ket qua trung tuyen chinh thuc se duoc thong bao qua email sau khi BCN xet duyet cuoi.`,
    html: renderEmail({
      title: "Bạn đã vượt qua vòng phỏng vấn! 🎉",
      intro: `Chúc mừng <b style="color:${COLORS.text}">${application.fullName}</b>! Hồ sơ <b style="color:${COLORS.accent}">${application.applicationCode}</b> đã <b style="color:${COLORS.text}">ĐẠT vòng phỏng vấn</b>.`,
      note: "Ban Chủ nhiệm đang tổng hợp kết quả — thông báo trúng tuyển chính thức sẽ được gửi qua email trong thời gian sớm nhất. Cảm ơn bạn đã đồng hành!",
    }),
  });
}

// Trúng tuyển chính thức — tài khoản được nâng thành Member
export function sendAdmittedEmail(application) {
  const loginUrl = `${config.clientUrl}/login`;
  return send({
    to: application.email,
    subject: `Chúc mừng bạn đã TRÚNG TUYỂN IU CLUB! (${application.applicationCode})`,
    text: `Chuc mung ${application.fullName}! Ban da chinh thuc tro thanh thanh vien IU CLUB. Dang nhap tai ${loginUrl}.`,
    html: renderEmail({
      title: "Chào mừng thành viên mới! 🎊",
      intro: `Chúc mừng <b style="color:${COLORS.text}">${application.fullName}</b>! Bạn đã chính thức trở thành thành viên IU CLUB. Tài khoản của bạn đã được nâng thành <b style="color:${COLORS.accent}">Member</b>.`,
      cta: { label: "Đăng nhập ngay", url: loginUrl },
      note: "Hành trình mới bắt đầu — hẹn gặp bạn ở buổi sinh hoạt đầu tiên!",
    }),
  });
}

// Xác nhận đặt / đổi lịch phỏng vấn thành công
export function sendBookingConfirmedEmail(application, slot) {
  const date = new Date(slot.date).toLocaleDateString("vi-VN");
  return send({
    to: application.email,
    subject: `IU CLUB — Xác nhận lịch phỏng vấn (${application.applicationCode})`,
    text: `Ban da dat lich phong van: ${date} ${slot.startTime}-${slot.endTime} tai ${slot.location}.`,
    html: renderEmail({
      title: "Đã xác nhận lịch phỏng vấn ✅",
      intro: `Bạn đã đặt lịch phỏng vấn thành công. Thông tin chi tiết:`,
      rows: [
        { label: "Ngày", value: date },
        { label: "Giờ", value: `${slot.startTime} - ${slot.endTime}` },
        { label: "Địa điểm", value: slot.location },
      ],
      note: "Vui lòng có mặt trước 10 phút. Chúc bạn phỏng vấn thật tốt!",
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
      : `/leader/recruitment/interviews/slots/${slotId}`;
  const url = `${config.clientUrl}${path}`;
  const portalHint =
    user.role === "bcn"
      ? "Vào Admin › Tuyển dụng › Phỏng vấn để xem ứng viên và chấm điểm."
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

// Nhắc lịch phỏng vấn sắp diễn ra (job quét, trước 24h và 2h)
export function sendInterviewReminderEmail(application, slot, timeLeftLabel) {
  const date = new Date(slot.date).toLocaleDateString("vi-VN");
  return send({
    to: application.email,
    subject: `IU CLUB — Nhắc lịch phỏng vấn còn ${timeLeftLabel} (${application.applicationCode})`,
    text: `Nhac lich: ban co lich phong van luc ${slot.startTime} ngay ${date} tai ${slot.location} (con ${timeLeftLabel}).`,
    html: renderEmail({
      title: `Phỏng vấn của bạn còn ${timeLeftLabel} nữa ⏰`,
      intro: `Nhắc bạn lịch phỏng vấn IU CLUB sắp diễn ra — đừng quên nhé!`,
      rows: [
        { label: "Ngày", value: date },
        { label: "Giờ", value: `${slot.startTime} - ${slot.endTime}` },
        { label: "Địa điểm", value: slot.location },
      ],
      note: "Vui lòng có mặt trước 10 phút. Chúc bạn tự tin và may mắn!",
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
  const url = `${config.clientUrl}/member/training/roadmap`;
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
  const url = `${config.clientUrl}/member/training/progress`;
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
  const url = `${config.clientUrl}/member/training/tasks`;
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

/** Nhắc ứng viên chưa đặt lịch phỏng vấn sau X ngày Pass vòng đơn */
export function sendUnbookedReminderEmail(application) {
  const loginUrl = `${config.clientUrl}/login`;
  return send({
    to: application.email,
    subject: `IU CLUB — Nhắc đặt lịch phỏng vấn (${application.applicationCode})`,
    text: `Ban da dat vong don nhung chua dat lich phong van. Dang nhap tai ${loginUrl} de chon ca.`,
    html: renderEmail({
      title: "Bạn chưa đặt lịch phỏng vấn ⏳",
      intro: `Chào <b style="color:${COLORS.text}">${application.fullName}</b>! Hồ sơ <b style="color:${COLORS.accent}">${application.applicationCode}</b> đã đạt vòng đơn nhưng bạn chưa chọn ca phỏng vấn.`,
      cta: { label: "Đăng nhập & đặt lịch ngay", url: loginUrl },
      note: "Nếu không đặt lịch kịp thời, Ban Chủ nhiệm có thể chủ động gán ca hoặc đánh dấu vắng không đặt lịch.",
    }),
  });
}
