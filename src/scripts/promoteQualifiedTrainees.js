import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { agenda } from "../jobs/index.js";
import Trainee from "../models/trainee.model.js";
import Application from "../models/application.model.js";
import { transition } from "../services/applicationStateMachine.js";

// Backfill: trainee đã được BCN đánh giá đủ điều kiện TRƯỚC KHI có luồng
// auto-promote → chuyển hồ sơ sang admitted để job promote nâng role member.
// Idempotent: hồ sơ không còn ở passed_interview thì bỏ qua.
async function main() {
  await connectDatabase();
  await agenda.start(); // job promote chạy ngay trong script, không chờ server

  const trainees = await Trainee.find({
    evalStatus: { $in: ["qualified", "certified"] },
    applicationId: { $ne: null },
  });
  for (const trainee of trainees) {
    const application = await Application.findById(trainee.applicationId).select(
      "status",
    );
    if (application?.status === "passed_interview") {
      await transition(trainee.applicationId, "admitted");
      console.log(`[promote] ${trainee.fullName}: admitted → job promote enqueued`);
    } else {
      console.log(
        `[promote] ${trainee.fullName}: bỏ qua (hồ sơ ${application?.status ?? "?"})`,
      );
    }
  }

  // Chờ agenda xử lý job promote rồi mới thoát
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await agenda.stop();
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
