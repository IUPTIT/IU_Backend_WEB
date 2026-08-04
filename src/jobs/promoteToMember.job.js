import agenda from "../config/agenda.js";

export const JOB_PROMOTE_TO_MEMBER = "promoteToMember";

export function definePromoteToMemberJob() {
  agenda.define(JOB_PROMOTE_TO_MEMBER, { concurrency: 5 }, async (job) => {
    const { applicationId } = job.attrs.data || {};
    console.log(
      `[job:${JOB_PROMOTE_TO_MEMBER}] Promoting candidate to member for applicationId: ${applicationId}`,
    );

    try {
      // TODO: Implement promote to member logic (change User.role from candidate -> member)
    } catch (err) {
      console.error(
        `[job:${JOB_PROMOTE_TO_MEMBER}] Error promoting candidate for applicationId ${applicationId}:`,
        err.message,
      );
      throw err;
    }
  });
}
