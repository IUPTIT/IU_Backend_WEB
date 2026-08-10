import agenda from "../config/agenda.js";
import TrainingTask from "../models/trainingTask.model.js";
import Trainee from "../models/trainee.model.js";
import * as emailService from "../services/email.service.js";
import * as notificationService from "../services/notification.service.js";

export const JOB_SEND_TASK_DEADLINE_REMINDER = "sendTaskDeadlineReminder";

/** Nhắc khi deadline còn ≤ 24h hoặc đã quá hạn, chưa nộp */
const WINDOW_MS = 24 * 60 * 60 * 1000;

export function defineSendTaskDeadlineReminderJob() {
  agenda.define(
    JOB_SEND_TASK_DEADLINE_REMINDER,
    { concurrency: 1 },
    async (_job) => {
      console.log(
        `[job:${JOB_SEND_TASK_DEADLINE_REMINDER}] Scanning task deadlines...`,
      );
      try {
        const now = new Date();
        const horizon = new Date(now.getTime() + WINDOW_MS);
        const tasks = await TrainingTask.find({
          deadline: { $ne: null, $lte: horizon },
          deadlineReminderSentAt: null,
        }).limit(80);

        for (const task of tasks) {
          const pending = task.assignments.filter(
            (a) => a.status === "assigned" || a.status === "rejected",
          );
          if (!pending.length) {
            task.deadlineReminderSentAt = now;
            await task.save();
            continue;
          }

          const overdue = task.deadline < now;
          const timeLeftLabel = overdue
            ? "đã quá hạn"
            : "sắp đến hạn (trong 24 giờ)";

          for (const a of pending) {
            const trainee = await Trainee.findById(a.traineeId);
            if (!trainee || trainee.status === "removed") continue;
            await emailService.sendTaskDeadlineReminderEmail(
              trainee,
              task,
              timeLeftLabel,
            );
            if (trainee.userId) {
              await notificationService.createNotification({
                userId: trainee.userId,
                title: overdue
                  ? "Task training đã quá hạn"
                  : "Task training sắp đến hạn",
                body: `"${task.title}" ${timeLeftLabel}. Hãy nộp bài sớm.`,
                type: "general",
                link: "/member/training/tasks",
              });
            }
          }

          task.deadlineReminderSentAt = now;
          await task.save();
        }

        if (tasks.length) {
          console.log(
            `[job:${JOB_SEND_TASK_DEADLINE_REMINDER}] Processed ${tasks.length} tasks`,
          );
        }
      } catch (err) {
        console.error(
          `[job:${JOB_SEND_TASK_DEADLINE_REMINDER}] Error:`,
          err.message,
        );
        throw err;
      }
    },
  );
}
