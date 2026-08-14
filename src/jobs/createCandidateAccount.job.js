import Application from "../models/application.model.js";
import User from "../models/user.model.js";
import * as emailService from "../services/email.service.js";
import agenda from "../config/agenda.js";

export const JOB_CREATE_CANDIDATE_ACCOUNT = "createCandidateAccount";

/**
 * Mật khẩu mặc định = ngày sinh DDMMYYYY (bắt buộc đổi lần đăng nhập đầu).
 * Ưu tiên parse YYYY-MM-DD từ ISO/string để khớp mọi timezone.
 */
export function passwordFromDob(dateOfBirth) {
  const raw = String(dateOfBirth ?? "");
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.slice(0, 10));
  if (iso) return `${iso[3]}${iso[2]}${iso[1]}`;

  const d = new Date(dateOfBirth);
  if (Number.isNaN(d.getTime())) {
    throw new Error("dateOfBirth không hợp lệ");
  }
  // Dùng UTC — dateOfBirth lưu Mongo thường là midnight UTC của ngày sinh
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getUTCFullYear()}`;
}

/**
 * Tạo / kích hoạt tài khoản Candidate sau Pass vòng đơn (idempotent).
 * Gọi trực tiếp từ state machine — không phụ thuộc Agenda chạy kịp.
 */
export async function createCandidateAccountFromApplication(applicationId) {
  const application = await Application.findById(applicationId);
  if (!application) {
    console.warn(
      `[createCandidateAccount] Application not found: ${applicationId}`,
    );
    return null;
  }
  if (!application.dateOfBirth) {
    throw new Error(
      "Application missing dateOfBirth — cannot generate password",
    );
  }

  const rawPassword = passwordFromDob(application.dateOfBirth);
  let createdNew = false;
  let user = await User.findOne({ email: application.email });

  if (user) {
    // Email từng có tài khoản — reset về candidate để login + đặt lịch PV
    user.role = "candidate";
    user.roles = ["candidate"];
    user.status = "active";
    user.isActive = true;
    user.emailVerified = true;
    user.requirePasswordChange = true;
    user.password = rawPassword;
    user.sourceApplicationId = application._id;
    user.memberStatus = undefined;
    if (!user.name && application.fullName) user.name = application.fullName;
    await user.save();
  } else {
    user = await User.create({
      name: application.fullName,
      email: application.email,
      password: rawPassword,
      role: "candidate",
      roles: ["candidate"],
      status: "active",
      emailVerified: true,
      requirePasswordChange: true,
      sourceApplicationId: application._id,
    });
    createdNew = true;
  }

  if (!application.userId || String(application.userId) !== String(user._id)) {
    application.userId = user._id;
    await application.save();
  }

  // Email best-effort — không làm fail việc tạo account (ứng viên vẫn login được)
  try {
    await emailService.sendCandidateAccountEmail(application, rawPassword);
  } catch (err) {
    console.warn(
      `[createCandidateAccount] email failed for ${application.email}:`,
      err.message,
    );
  }

  console.log(
    `[createCandidateAccount] ${createdNew ? "Created" : "Updated"} ${application.email} (MK=DDMMYYYY)`,
  );
  return { user, rawPassword, createdNew };
}

export function defineCreateCandidateAccountJob() {
  agenda.define(
    JOB_CREATE_CANDIDATE_ACCOUNT,
    { priority: "high", concurrency: 5 },
    async (job) => {
      const { applicationId } = job.attrs.data || {};
      console.log(
        `[job:${JOB_CREATE_CANDIDATE_ACCOUNT}] Processing for applicationId: ${applicationId}`,
      );
      try {
        // Idempotent: đã có user gắn hồ sơ + không bắt buộc đổi MK → bỏ qua
        const application = await Application.findById(applicationId);
        if (!application) return;
        if (application.userId) {
          const existing = await User.findById(application.userId);
          if (
            existing &&
            existing.role === "candidate" &&
            existing.emailVerified &&
            existing.status === "active"
          ) {
            // Vẫn đảm bảo sourceApplicationId / roles đúng
            if (
              !existing.sourceApplicationId ||
              String(existing.sourceApplicationId) !== String(application._id) ||
              !existing.roles?.includes("candidate")
            ) {
              await createCandidateAccountFromApplication(applicationId);
            }
            return;
          }
        }
        await createCandidateAccountFromApplication(applicationId);
      } catch (err) {
        console.error(
          `[job:${JOB_CREATE_CANDIDATE_ACCOUNT}] Error ${applicationId}:`,
          err.message,
        );
        throw err;
      }
    },
  );
}
