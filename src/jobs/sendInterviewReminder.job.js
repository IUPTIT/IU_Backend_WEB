import agenda from "../config/agenda.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import "../models/interviewSlot.model.js";
import "../models/application.model.js";
import * as emailService from "../services/email.service.js";

export const JOB_SEND_INTERVIEW_REMINDER = "sendInterviewReminder";

function slotStartTime(slot) {
  const start = new Date(slot.date);
  const [h, m] = slot.startTime.split(":").map(Number);
  start.setHours(h, m, 0, 0);
  return start;
}

export function defineSendInterviewReminderJob() {
  agenda.define(JOB_SEND_INTERVIEW_REMINDER, { concurrency: 1 }, async (_job) => {
    console.log(
      `[job:${JOB_SEND_INTERVIEW_REMINDER}] Scanning upcoming interview bookings...`,
    );

    try {
      const now = Date.now();
      const bookings = await InterviewBooking.find({
        status: { $in: ["booked", "changed"] },
        $or: [{ reminded24h: false }, { reminded2h: false }],
      })
        .populate("slotId")
        .populate("applicationId", "fullName email applicationCode");

      for (const booking of bookings) {
        if (!booking.slotId || !booking.applicationId) continue;
        const start = slotStartTime(booking.slotId).getTime();
        const hoursLeft = (start - now) / 3_600_000;
        if (hoursLeft <= 0) continue;

        // Nhắc 2 mốc: trước 24h và trước 2h (mỗi mốc gửi đúng 1 lần)
        if (!booking.reminded2h && hoursLeft <= 2) {
          await emailService.sendInterviewReminderEmail(
            booking.applicationId,
            booking.slotId,
            "2 giờ",
          );
          booking.reminded2h = true;
          booking.reminded24h = true; // qua mốc 24h rồi thì khỏi gửi lại
          await booking.save();
        } else if (!booking.reminded24h && hoursLeft <= 24) {
          await emailService.sendInterviewReminderEmail(
            booking.applicationId,
            booking.slotId,
            "24 giờ",
          );
          booking.reminded24h = true;
          await booking.save();
        }
      }
    } catch (err) {
      console.error(
        `[job:${JOB_SEND_INTERVIEW_REMINDER}] Error scanning reminders:`,
        err.message,
      );
      throw err;
    }
  });
}
