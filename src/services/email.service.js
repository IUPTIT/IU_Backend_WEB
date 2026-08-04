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
  const summary = [
    `Ma ho so: ${application.code}`,
    `Ho ten: ${application.fullName}`,
    `MSSV: ${application.studentId}`,
    `Ban nguyen vong: ${application.wishes.join(", ")}`,
  ].join("\n");
  return send({
    to: application.email,
    subject: `IU_CLUB da nhan don ung tuyen cua ban (${application.code})`,
    text: `${summary}\n\nTheo doi ho so tai: ${lookupUrl}`,
    html: `<p>IU_CLUB đã nhận đơn ứng tuyển của bạn.</p>
<ul>
  <li>Mã hồ sơ: <b>${application.code}</b></li>
  <li>Họ tên: ${application.fullName}</li>
  <li>MSSV: ${application.studentId}</li>
  <li>Ban nguyện vọng: ${application.wishes.join(", ")}</li>
</ul>
<p>Theo dõi hồ sơ tại: <a href="${lookupUrl}">${lookupUrl}</a></p>`,
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
