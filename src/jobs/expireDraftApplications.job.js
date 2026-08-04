import agenda from "../config/agenda.js";
import Application from "../models/application.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";

export const JOB_EXPIRE_DRAFT_APPLICATIONS = "expireDraftApplications";

export function defineExpireDraftApplicationsJob() {
  agenda.define(JOB_EXPIRE_DRAFT_APPLICATIONS, { concurrency: 1 }, async (_job) => {
    console.log(
      `[job:${JOB_EXPIRE_DRAFT_APPLICATIONS}] Cleaning expired draft applications...`,
    );

    try {
      // Xoá đơn nháp của các đợt tuyển đã quá hạn đóng đơn
      const closedCampaigns = await RecruitmentCampaign.find({
        closeAt: { $lt: new Date() },
      }).select("_id");
      if (!closedCampaigns.length) return;

      const result = await Application.deleteMany({
        status: "draft",
        campaignId: { $in: closedCampaigns.map((c) => c._id) },
      });
      if (result.deletedCount > 0) {
        console.log(
          `[job:${JOB_EXPIRE_DRAFT_APPLICATIONS}] Deleted ${result.deletedCount} expired drafts`,
        );
      }
    } catch (err) {
      console.error(
        `[job:${JOB_EXPIRE_DRAFT_APPLICATIONS}] Error cleaning drafts:`,
        err.message,
      );
      throw err;
    }
  });
}
