import agenda from "../config/agenda.js";
import Application from "../models/application.model.js";
import User from "../models/user.model.js";
import * as emailService from "../services/email.service.js";
import * as trainingService from "../services/training.service.js";

export const JOB_PROMOTE_TO_MEMBER = "promoteToMember";

/**
 * Trúng tuyển (admitted): bàn giao sang Tân binh training.
 * KHÔNG nâng role Member — vẫn giữ candidate đến khi hoàn thành training.
 * (Agenda job name giữ nguyên để tương thích queue cũ.)
 */
export function definePromoteToMemberJob() {
  agenda.define(JOB_PROMOTE_TO_MEMBER, { concurrency: 5 }, async (job) => {
    const { applicationId } = job.attrs.data || {};
    console.log(
      `[job:${JOB_PROMOTE_TO_MEMBER}] Start training handover for applicationId: ${applicationId}`,
    );

    try {
      const application = await Application.findById(applicationId);
      if (!application?.userId) {
        console.warn(
          `[job:${JOB_PROMOTE_TO_MEMBER}] Application/user not found`,
        );
        return;
      }

      const user = await User.findById(application.userId);
      if (!user) return;

      // Giữ portal Ứng viên trong suốt vòng training
      user.role = "candidate";
      user.roles = ["candidate"];
      user.memberStatus = undefined;
      user.isActive = true;
      user.status = "active";
      await user.save();

      await trainingService.createTraineeFromApplication(application);
      await emailService.sendAdmittedEmail(application);

      console.log(
        `[job:${JOB_PROMOTE_TO_MEMBER}] ${user.email} → candidate + trainee (chưa Member)`,
      );
    } catch (err) {
      console.error(
        `[job:${JOB_PROMOTE_TO_MEMBER}] Error for applicationId ${applicationId}:`,
        err.message,
      );
      throw err;
    }
  });
}
