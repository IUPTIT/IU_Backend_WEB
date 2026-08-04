import agenda from "../config/agenda.js";
import Application from "../models/application.model.js";
import User from "../models/user.model.js";
import * as emailService from "../services/email.service.js";

export const JOB_CREATE_CANDIDATE_ACCOUNT = "createCandidateAccount";

// Mật khẩu mặc định = ngày sinh DDMMYYYY (bắt buộc đổi ở lần đăng nhập đầu)
function passwordFromDob(dateOfBirth) {
  const d = new Date(dateOfBirth);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getFullYear()}`;
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
        const application = await Application.findById(applicationId);
        if (!application) {
          console.warn(`[job:${JOB_CREATE_CANDIDATE_ACCOUNT}] Application not found`);
          return;
        }
        // Idempotent: đã có tài khoản gắn với hồ sơ thì bỏ qua (không gửi mail đúp)
        if (application.userId) return;
        if (!application.dateOfBirth) {
          throw new Error("Application missing dateOfBirth — cannot generate password");
        }

        const rawPassword = passwordFromDob(application.dateOfBirth);

        let user = await User.findOne({ email: application.email });
        if (user) {
          // Email từng có tài khoản (VD ứng tuyển lại) — kích hoạt lại làm candidate
          user.role = "candidate";
          user.status = "active";
          user.isActive = true;
          user.emailVerified = true;
          user.requirePasswordChange = true;
          user.password = rawPassword; // pre-save hook tự hash
          user.sourceApplicationId = application._id;
          await user.save();
        } else {
          user = await User.create({
            name: application.fullName,
            email: application.email,
            password: rawPassword,
            role: "candidate",
            status: "active",
            emailVerified: true,
            requirePasswordChange: true,
            sourceApplicationId: application._id,
          });
        }

        application.userId = user._id;
        await application.save();

        await emailService.sendCandidateAccountEmail(application, rawPassword);
        console.log(
          `[job:${JOB_CREATE_CANDIDATE_ACCOUNT}] Created candidate account for ${application.email}`,
        );
      } catch (err) {
        console.error(
          `[job:${JOB_CREATE_CANDIDATE_ACCOUNT}] Error processing applicationId ${applicationId}:`,
          err.message,
        );
        throw err;
      }
    },
  );
}
