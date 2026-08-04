import agenda from "../config/agenda.js";

export const JOB_DISABLE_ACCOUNT = "disableAccount";

export function defineDisableAccountJob() {
  agenda.define(JOB_DISABLE_ACCOUNT, { concurrency: 5 }, async (job) => {
    const { applicationId } = job.attrs.data || {};
    console.log(
      `[job:${JOB_DISABLE_ACCOUNT}] Processing disable account for applicationId: ${applicationId}`,
    );

    try {
      // TODO: Implement disable user account logic (set User.isActive = false)
    } catch (err) {
      console.error(
        `[job:${JOB_DISABLE_ACCOUNT}] Error disabling account for applicationId ${applicationId}:`,
        err.message,
      );
      throw err;
    }
  });
}
