import agenda from "../config/agenda.js";
import Application from "../models/application.model.js";
import User from "../models/user.model.js";
import * as emailService from "../services/email.service.js";

export const JOB_DISABLE_ACCOUNT = "disableAccount";

export function defineDisableAccountJob() {
  agenda.define(JOB_DISABLE_ACCOUNT, { concurrency: 5 }, async (job) => {
    const { applicationId } = job.attrs.data || {};
    console.log(
      `[job:${JOB_DISABLE_ACCOUNT}] Processing disable account for applicationId: ${applicationId}`,
    );

    try {
      const application = await Application.findById(applicationId);
      if (!application) {
        console.warn(`[job:${JOB_DISABLE_ACCOUNT}] Application not found`);
        return;
      }

      // Khoá tài khoản (giữ data để đối soát) — hồ sơ rớt vòng đơn chưa có tài khoản
      if (application.userId) {
        const user = await User.findById(application.userId);
        if (user && user.isActive) {
          user.isActive = false;
          user.status = "disabled";
          await user.save();
          console.log(`[job:${JOB_DISABLE_ACCOUNT}] Disabled account ${user.email}`);
        }
      }

      await emailService.sendApplicationRejectedEmail(application, application.status);
    } catch (err) {
      console.error(
        `[job:${JOB_DISABLE_ACCOUNT}] Error disabling account for applicationId ${applicationId}:`,
        err.message,
      );
      throw err;
    }
  });
}
