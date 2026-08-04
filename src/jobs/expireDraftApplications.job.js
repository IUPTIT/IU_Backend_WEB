import agenda from "../config/agenda.js";

export const JOB_EXPIRE_DRAFT_APPLICATIONS = "expireDraftApplications";

export function defineExpireDraftApplicationsJob() {
  agenda.define(
    JOB_EXPIRE_DRAFT_APPLICATIONS,
    { concurrency: 1 },
    async (_job) => {
      console.log(
        `[job:${JOB_EXPIRE_DRAFT_APPLICATIONS}] Cleaning expired draft applications...`,
      );

      try {
        // TODO: Implement expired draft application cleanup logic
        // Delete draft applications where campaign.closeAt has passed and status === 'draft'
      } catch (err) {
        console.error(
          `[job:${JOB_EXPIRE_DRAFT_APPLICATIONS}] Error cleaning drafts:`,
          err.message,
        );
        throw err;
      }
    },
  );
}
