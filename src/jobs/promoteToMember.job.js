import agenda from "../config/agenda.js";
import Application from "../models/application.model.js";
import User from "../models/user.model.js";
import * as emailService from "../services/email.service.js";
import * as trainingService from "../services/training.service.js";

export const JOB_PROMOTE_TO_MEMBER = "promoteToMember";

export function definePromoteToMemberJob() {
  agenda.define(JOB_PROMOTE_TO_MEMBER, { concurrency: 5 }, async (job) => {
    const { applicationId } = job.attrs.data || {};
    console.log(
      `[job:${JOB_PROMOTE_TO_MEMBER}] Promoting candidate to member for applicationId: ${applicationId}`,
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

      const alreadyMember = user.role === "member";
      if (!alreadyMember) {
        user.role = "member";
        user.isActive = true;
        user.status = "active";
        await user.save();
      }

      // Luôn upsert trainee — kể cả khi user đã là member (tránh miss bàn giao training)
      await trainingService.createTraineeFromApplication(application);

      if (!alreadyMember) {
        await emailService.sendAdmittedEmail(application);
        console.log(
          `[job:${JOB_PROMOTE_TO_MEMBER}] Promoted ${user.email} to member`,
        );
      } else {
        console.log(
          `[job:${JOB_PROMOTE_TO_MEMBER}] Already member — ensured trainee for ${user.email}`,
        );
      }
    } catch (err) {
      console.error(
        `[job:${JOB_PROMOTE_TO_MEMBER}] Error promoting candidate for applicationId ${applicationId}:`,
        err.message,
      );
      throw err;
    }
  });
}
