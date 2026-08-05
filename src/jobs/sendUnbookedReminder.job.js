import agenda from "../config/agenda.js";
import Application from "../models/application.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import * as emailService from "../services/email.service.js";
import * as notificationService from "../services/notification.service.js";

export const JOB_SEND_UNBOOKED_REMINDER = "sendUnbookedReminder";

/** Số ngày sau Pass CV chưa đặt lịch thì gửi nhắc (nghiệp vụ 3.2) */
const UNBOOKED_REMINDER_DAYS = 3;

export function defineSendUnbookedReminderJob() {
  agenda.define(
    JOB_SEND_UNBOOKED_REMINDER,
    { concurrency: 1 },
    async (_job) => {
      console.log(
        `[job:${JOB_SEND_UNBOOKED_REMINDER}] Scanning unbooked passed_cv applications...`,
      );
      try {
        const cutoff = new Date(
          Date.now() - UNBOOKED_REMINDER_DAYS * 24 * 60 * 60 * 1000,
        );
        const bookedIds = await InterviewBooking.distinct("applicationId");
        const apps = await Application.find({
          status: "passed_cv",
          bookingReminderSentAt: null,
          updatedAt: { $lte: cutoff },
          _id: { $nin: bookedIds },
        }).limit(100);

        for (const app of apps) {
          await emailService.sendUnbookedReminderEmail(app);
          if (app.userId) {
            await notificationService.createNotification({
              userId: app.userId,
              title: "Nhắc đặt lịch phỏng vấn",
              body: "Bạn đã đạt vòng đơn nhưng chưa chọn ca phỏng vấn. Vào Lịch phỏng vấn để đặt lịch.",
              type: "booking_reminder",
              link: "/candidate/interview",
            });
          }
          app.bookingReminderSentAt = new Date();
          await app.save();
        }
        if (apps.length) {
          console.log(
            `[job:${JOB_SEND_UNBOOKED_REMINDER}] Sent ${apps.length} unbooked reminders`,
          );
        }
      } catch (err) {
        console.error(
          `[job:${JOB_SEND_UNBOOKED_REMINDER}] Error:`,
          err.message,
        );
        throw err;
      }
    },
  );
}
