import nodemailer from "nodemailer";
import config from "../config/env.js";

// Lazily create the transport. When SMTP is not configured (e.g. local dev
// without credentials), fall back to logging the email to the console so the
// rest of the auth flow remains testable.
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

export function sendPasswordResetEmail(to, resetToken) {
  const url = `${config.clientUrl}/reset-password?token=${resetToken}`;
  return send({
    to,
    subject: "Reset your IU_CLUB password",
    text: `Reset your password using this link: ${url} (valid for 30 minutes).`,
    html: `<p>Reset your password: <a href="${url}">${url}</a> (valid for 30 minutes).</p>`,
  });
}
