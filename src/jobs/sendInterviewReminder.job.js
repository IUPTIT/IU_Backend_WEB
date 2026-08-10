import agenda from "../config/agenda.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import "../models/interviewSlot.model.js";
import "../models/application.model.js";
import * as emailService from "../services/email.service.js";
import * as emailAutomation from "../services/emailAutomation.service.js";

export const JOB_SEND_INTERVIEW_REMINDER = "sendInterviewReminder";

function slotStartTime(slot) {
  const start = new Date(slot.date);
  const [h, m] = slot.startTime.split(":").map(Number);
  start.setHours(h, m, 0, 0);
  return start;
}

function alreadyReminded(booking, hours) {
  if (
    Array.isArray(booking.remindedOffsets) &&
    booking.remindedOffsets.includes(hours)
  ) {
    return true;
  }
  if (hours === 24 && booking.reminded24h) return true;
  if (hours === 2 && booking.reminded2h) return true;
  return false;
}

function markReminded(booking, hours) {
  if (!Array.isArray(booking.remindedOffsets)) booking.remindedOffsets = [];
  if (!booking.remindedOffsets.includes(hours)) {
    booking.remindedOffsets.push(hours);
  }
  if (hours === 24) booking.reminded24h = true;
  if (hours === 2) booking.reminded2h = true;
}

function formatTimeLeft(hours) {
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24} ngày`;
  if (hours >= 24) return `${Math.round(hours)} giờ`;
  return `${hours} giờ`;
}

export function defineSendInterviewReminderJob() {
  agenda.define(
    JOB_SEND_INTERVIEW_REMINDER,
    { concurrency: 1 },
    async (_job) => {
      const offsets = await emailAutomation.getInterviewRemindOffsetsHours();
      if (!offsets.length) {
        console.log(
          `[job:${JOB_SEND_INTERVIEW_REMINDER}] No enabled interview_remind rules — skip`,
        );
        return;
      }

      console.log(
        `[job:${JOB_SEND_INTERVIEW_REMINDER}] Offsets(h): ${offsets.map((o) => o.hours).join(", ")}`,
      );

      try {
        const now = Date.now();
        const bookings = await InterviewBooking.find({
          status: { $in: ["booked", "changed"] },
        })
          .populate("slotId")
          .populate(
            "applicationId",
            "fullName email applicationCode assignedDepartment departmentPreferences cvScore interviewScore",
          );

        for (const booking of bookings) {
          if (!booking.slotId || !booking.applicationId) continue;
          const start = slotStartTime(booking.slotId).getTime();
          const hoursLeft = (start - now) / 3_600_000;
          if (hoursLeft <= 0) continue;

          // Mốc nhỏ nhất đã tới hạn (vd. còn 1.5h → gửi 2h, không gửi nhầm 24h)
          const due = offsets
            .filter(
              (off) =>
                hoursLeft <= off.hours && !alreadyReminded(booking, off.hours),
            )
            .sort((a, b) => a.hours - b.hours);
          const matched = due[0];
          if (!matched) continue;

          await emailService.sendInterviewReminderEmail(
            booking.applicationId,
            booking.slotId,
            formatTimeLeft(matched.hours),
            { ruleKey: matched.ruleKey },
          );

          // Đánh dấu mọi mốc đã “vào cửa sổ” để khỏi spam khi job chạy muộn
          for (const off of offsets) {
            if (hoursLeft <= off.hours) markReminded(booking, off.hours);
          }
          await booking.save();
        }
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
