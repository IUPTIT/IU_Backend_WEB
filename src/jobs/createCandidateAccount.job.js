import agenda from "../config/agenda.js";

export const JOB_CREATE_CANDIDATE_ACCOUNT = "createCandidateAccount";

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
        // TODO: Implement candidate account creation logic
        // 1. Fetch application details
        // 2. Generate initial password & create User (role: 'candidate')
        // 3. Send account credentials email to candidate
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
