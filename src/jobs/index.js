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
  defineSendUnbookedReminderJob,
  JOB_SEND_UNBOOKED_REMINDER,
} from "./sendUnbookedReminder.job.js";
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
import {
  defineSendTaskDeadlineReminderJob,
  JOB_SEND_TASK_DEADLINE_REMINDER,
} from "./sendTaskDeadlineReminder.job.js";

export async function initJobs() {
  defineCreateCandidateAccountJob();
  defineSendInterviewReminderJob();
  defineSendUnbookedReminderJob();
  defineExpireDraftApplicationsJob();
  defineReleaseSlotHoldJob();
  defineDisableAccountJob();
  definePromoteToMemberJob();
  defineSendTaskDeadlineReminderJob();

  await agenda.start();
  console.log("[agenda] Job processing engine started");

  await agenda.every("15 minutes", JOB_SEND_INTERVIEW_REMINDER);
  await agenda.every("1 hour", JOB_SEND_UNBOOKED_REMINDER);
  await agenda.every("1 hour", JOB_EXPIRE_DRAFT_APPLICATIONS);
  await agenda.every("1 minute", JOB_RELEASE_SLOT_HOLD);
  await agenda.every("30 minutes", JOB_SEND_TASK_DEADLINE_REMINDER);
}

export {
  agenda,
  JOB_CREATE_CANDIDATE_ACCOUNT,
  JOB_SEND_INTERVIEW_REMINDER,
  JOB_SEND_UNBOOKED_REMINDER,
  JOB_EXPIRE_DRAFT_APPLICATIONS,
  JOB_RELEASE_SLOT_HOLD,
  JOB_DISABLE_ACCOUNT,
  JOB_PROMOTE_TO_MEMBER,
  JOB_SEND_TASK_DEADLINE_REMINDER,
};
