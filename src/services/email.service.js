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

export function sendVerificationEmail(to, otp) {
  return send({
    to,
    subject: "Verify your IU_CLUB account",
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
  });
}

// Email xác nhận đã nhận hồ sơ ứng tuyển (nghiệp vụ 1.4) — chưa kèm thông tin đăng nhập
export function sendApplicationReceivedEmail(application) {
  const lookupUrl = `${config.clientUrl}/tra-cuu`;
  const departments = (application.departmentPreferences ?? [])
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((p) => p.department);
  const summary = [
    `Ma ho so: ${application.applicationCode}`,
    `Ho ten: ${application.fullName}`,
    `MSSV: ${application.studentId}`,
    `Ban nguyen vong: ${departments.join(", ")}`,
  ].join("\n");
  return send({
    to: application.email,
    subject: `IU_CLUB da nhan don ung tuyen cua ban (${application.applicationCode})`,
    text: `${summary}\n\nTheo doi ho so tai: ${lookupUrl}`,
    html: `<p>IU_CLUB đã nhận đơn ứng tuyển của bạn.</p>
<ul>
  <li>Mã hồ sơ: <b>${application.applicationCode}</b></li>
  <li>Họ tên: ${application.fullName}</li>
  <li>MSSV: ${application.studentId}</li>
  <li>Ban nguyện vọng: ${departments.join(", ")}</li>
</ul>
<p>Theo dõi hồ sơ tại: <a href="${lookupUrl}">${lookupUrl}</a></p>`,
  });
}

// Email gửi link tiếp tục điền đơn nháp cho Guest (nghiệp vụ 1.2)
export function sendDraftLinkEmail(application, draftToken) {
  const url = `${config.clientUrl}/tuyen-thanh-vien?token=${draftToken}`;
  return send({
    to: application.email,
    subject: "IU_CLUB - Link tiep tuc dien don ung tuyen cua ban",
    text: `Don ung tuyen cua ban da duoc luu nhap. Tiep tuc dien tai: ${url}`,
    html: `<p>Đơn ứng tuyển của bạn đã được lưu nháp.</p>
<p>Tiếp tục điền tại: <a href="${url}">${url}</a></p>
<p>Link có hiệu lực tới khi đợt tuyển đóng đơn. Không chia sẻ link này cho người khác.</p>`,
  });
}

// Pass vòng đơn — gửi kèm tài khoản candidate (mật khẩu mặc định là ngày sinh DDMMYYYY)
export function sendCandidateAccountEmail(application, rawPassword) {
  const loginUrl = `${config.clientUrl}/login`;
  return send({
    to: application.email,
    subject: `Chuc mung ban da vuot qua vong don IU_CLUB (${application.applicationCode})`,
    text: [
      `Chuc mung ${application.fullName}! Ho so cua ban da DAT vong don.`,
      `Tai khoan ung vien de dang ky lich phong van:`,
      `  Email: ${application.email}`,
      `  Mat khau: ${rawPassword}`,
      `Dang nhap tai ${loginUrl} — he thong se yeu cau doi mat khau ngay lan dau.`,
      `Sau khi dang nhap, vao muc "Lich phong van" de chon ca phong van.`,
    ].join("\n"),
    html: `<p>Chúc mừng <b>${application.fullName}</b>! Hồ sơ <b>${application.applicationCode}</b> của bạn đã <b>ĐẠT vòng đơn</b>.</p>
<p>Tài khoản ứng viên để đăng ký lịch phỏng vấn:</p>
<ul>
  <li>Email: <b>${application.email}</b></li>
  <li>Mật khẩu: <b>${rawPassword}</b></li>
</ul>
<p>Đăng nhập tại <a href="${loginUrl}">${loginUrl}</a> — hệ thống sẽ yêu cầu đổi mật khẩu ngay lần đầu.</p>
<p>Sau khi đăng nhập, vào mục <b>Lịch phỏng vấn</b> để chọn ca phỏng vấn nhé!</p>`,
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
      ? ""
      : "<p>Tài khoản ứng viên của bạn đã được vô hiệu hoá.</p>";
  return send({
    to: application.email,
    subject: `Ket qua ung tuyen IU_CLUB (${application.applicationCode})`,
    text: `Cam on ${application.fullName} da ung tuyen. Rat tiec ho so cua ban chua phu hop o ${roundLabel}. Hen gap lai ban o dot tuyen sau!`,
    html: `<p>Cảm ơn <b>${application.fullName}</b> đã ứng tuyển vào IU_CLUB.</p>
<p>Rất tiếc hồ sơ <b>${application.applicationCode}</b> của bạn chưa phù hợp ở <b>${roundLabel}</b>.</p>
${accountNote}
<p>Hẹn gặp lại bạn ở đợt tuyển sau!</p>`,
  });
}

// Trúng tuyển chính thức — tài khoản được nâng thành Member
export function sendAdmittedEmail(application) {
  const loginUrl = `${config.clientUrl}/login`;
  return send({
    to: application.email,
    subject: `Chuc mung ban da TRUNG TUYEN IU_CLUB! (${application.applicationCode})`,
    text: `Chuc mung ${application.fullName}! Ban da chinh thuc tro thanh thanh vien IU_CLUB. Tai khoan cua ban da duoc nang thanh Member — dang nhap tai ${loginUrl}.`,
    html: `<p>Chúc mừng <b>${application.fullName}</b>! 🎉</p>
<p>Bạn đã chính thức trở thành thành viên IU_CLUB. Tài khoản của bạn đã được nâng thành <b>Member</b>.</p>
<p>Đăng nhập tại <a href="${loginUrl}">${loginUrl}</a> để bắt đầu hành trình mới.</p>`,
  });
}

// Xác nhận đặt / đổi lịch phỏng vấn thành công
export function sendBookingConfirmedEmail(application, slot) {
  const date = new Date(slot.date).toLocaleDateString("vi-VN");
  return send({
    to: application.email,
    subject: `Xac nhan lich phong van IU_CLUB (${application.applicationCode})`,
    text: `Ban da dat lich phong van thanh cong: ${date} ${slot.startTime}-${slot.endTime} tai ${slot.location}.`,
    html: `<p>Bạn đã đặt lịch phỏng vấn thành công:</p>
<ul>
  <li>Ngày: <b>${date}</b></li>
  <li>Giờ: <b>${slot.startTime} - ${slot.endTime}</b></li>
  <li>Địa điểm: <b>${slot.location}</b></li>
</ul>
<p>Vui lòng có mặt trước 10 phút. Chúc bạn phỏng vấn tốt!</p>`,
  });
}

export function sendPasswordResetEmail(to, resetToken) {
  const url = `${config.clientUrl}/reset-password?token=${resetToken}`;
  return send({
    to,
    subject: "Reset your IU_CLUB password",
    text: `Reset your password: ${url} (valid for 30 minutes).`,
    html: `<p>Reset your password: <a href="${url}">${url}</a> (valid for 30 minutes).</p>`,
  });
}
