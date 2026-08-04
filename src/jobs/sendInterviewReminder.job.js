import agenda from "../config/agenda.js";

export const JOB_SEND_INTERVIEW_REMINDER = "sendInterviewReminder";

export function defineSendInterviewReminderJob() {
  agenda.define(
    JOB_SEND_INTERVIEW_REMINDER,
    { concurrency: 1 },
    async (_job) => {
      console.log(
        `[job:${JOB_SEND_INTERVIEW_REMINDER}] Scanning upcoming interview bookings...`,
      );

      try {
        // TODO: Implement interview reminder scan & send email logic
        // 1. Query upcoming bookings in next 24h & 2h that haven't received reminder
        // 2. Send reminder email via emailService
      } catch (err) {
        console.error(
          `[job:${JOB_SEND_INTERVIEW_REMINDER}] Error scanning reminders:`,
          err.message,
        );
        throw err;
      }
    },
  );
}
