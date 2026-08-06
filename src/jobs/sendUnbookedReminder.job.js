import agenda from "../config/agenda.js";
import Application from "../models/application.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import * as emailService from "../services/email.service.js";
import * as notificationService from "../services/notification.service.js";
import * as emailAutomation from "../services/emailAutomation.service.js";

export const JOB_SEND_UNBOOKED_REMINDER = "sendUnbookedReminder";

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDeadline(d) {
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function defineSendUnbookedReminderJob() {
  agenda.define(
    JOB_SEND_UNBOOKED_REMINDER,
    { concurrency: 1 },
    async (_job) => {
      const cfg = await emailAutomation.getBookSlotRemindConfig();
      if (!cfg) {
        console.log(
          `[job:${JOB_SEND_UNBOOKED_REMINDER}] Rule book_slot_remind disabled — skip`,
        );
        return;
      }

      const remindAfterDays = Math.max(0, cfg.remindAfterDays);
      const bookingWindowDays = Math.max(
        remindAfterDays,
        cfg.bookingWindowDays,
      );

      console.log(
        `[job:${JOB_SEND_UNBOOKED_REMINDER}] remindAfter=${remindAfterDays}d window=${bookingWindowDays}d`,
      );

      try {
        const now = Date.now();
        const bookedIds = await InterviewBooking.distinct("applicationId");
        const apps = await Application.find({
          status: "passed_cv",
          bookingReminderSentAt: null,
          _id: { $nin: bookedIds },
        }).limit(100);

        let sent = 0;
        for (const app of apps) {
          const passedAt = new Date(app.updatedAt);
          const deadline = addDays(passedAt, bookingWindowDays);
          const remindAt = addDays(passedAt, remindAfterDays);

          if (now < remindAt.getTime()) continue;
          if (now > deadline.getTime()) continue;

          const daysLeft = Math.max(
            0,
            Math.ceil((deadline.getTime() - now) / (24 * 60 * 60 * 1000)),
          );
          const deadlineLabel = `${formatDeadline(deadline)} (còn khoảng ${daysLeft} ngày)`;

          await emailService.sendUnbookedReminderEmail(app, { deadlineLabel });
          if (app.userId) {
            await notificationService.createNotification({
              userId: app.userId,
              title: "Nhắc đăng ký lịch phỏng vấn",
              body: `Bạn đã đạt vòng đơn nhưng chưa chọn ca. Hạn đăng ký: ${deadlineLabel}.`,
              type: "booking_reminder",
              link: "/candidate/interview",
            });
          }
          app.bookingReminderSentAt = new Date();
          await app.save();
          sent += 1;
        }
        if (sent) {
          console.log(
            `[job:${JOB_SEND_UNBOOKED_REMINDER}] Sent ${sent} book-slot reminders`,
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
