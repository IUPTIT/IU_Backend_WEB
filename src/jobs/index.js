import agenda from "../config/agenda.js";
import {
  defineCreateCandidateAccountJob,
  JOB_CREATE_CANDIDATE_ACCOUNT,
} from "./createCandidateAccount.job.js";
import {
  defineSendInterviewReminderJob,
  JOB_SEND_INTERVIEW_REMINDER,
} from "./sendInterviewReminder.job.js";
import {
  defineExpireDraftApplicationsJob,
  JOB_EXPIRE_DRAFT_APPLICATIONS,
} from "./expireDraftApplications.job.js";
import {
  defineReleaseSlotHoldJob,
  JOB_RELEASE_SLOT_HOLD,
} from "./releaseSlotHold.job.js";
import {
  defineDisableAccountJob,
  JOB_DISABLE_ACCOUNT,
} from "./disableAccount.job.js";
import {
  definePromoteToMemberJob,
  JOB_PROMOTE_TO_MEMBER,
} from "./promoteToMember.job.js";

export async function initJobs() {
  // 1. Define job logic handlers
  defineCreateCandidateAccountJob();
  defineSendInterviewReminderJob();
  defineExpireDraftApplicationsJob();
  defineReleaseSlotHoldJob();
  defineDisableAccountJob();
  definePromoteToMemberJob();

  // 2. Start Agenda job processing engine
  await agenda.start();
  console.log("[agenda] Job processing engine started");

  // 3. Schedule recurring background jobs
  await agenda.every("15 minutes", JOB_SEND_INTERVIEW_REMINDER);
  await agenda.every("1 hour", JOB_EXPIRE_DRAFT_APPLICATIONS);
  await agenda.every("1 minute", JOB_RELEASE_SLOT_HOLD);
}

export {
  agenda,
  JOB_CREATE_CANDIDATE_ACCOUNT,
  JOB_SEND_INTERVIEW_REMINDER,
  JOB_EXPIRE_DRAFT_APPLICATIONS,
  JOB_RELEASE_SLOT_HOLD,
  JOB_DISABLE_ACCOUNT,
  JOB_PROMOTE_TO_MEMBER,
};

