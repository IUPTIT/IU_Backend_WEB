import { connectDatabase, disconnectDatabase } from "../config/database.js";
import Application from "../models/application.model.js";
import Trainee from "../models/trainee.model.js";
import TrainingGroup from "../models/trainingGroup.model.js";
import { createTraineeFromApplication } from "../services/training.service.js";

// Backfill trainee cho hồ sơ đã passed_interview nhưng chưa có bản ghi trainee
// (hồ sơ chuyển trạng thái trước khi luồng tạo trainee được thêm vào state machine).
// createTraineeFromApplication là idempotent theo userId nên chạy lại vô hại.
async function main() {
  await connectDatabase();
  const apps = await Application.find({ status: "passed_interview" });
  for (const app of apps) {
    const trainee = await createTraineeFromApplication(app);
    console.log(
      `[backfill] ${app.fullName}: ${trainee ? "trainee ok" : "bỏ qua (chưa có userId)"}`,
    );
  }
  // Team cũ chưa gắn đợt tuyển → suy từ campaignId của thành viên trong team
  const groups = await TrainingGroup.find({ campaignId: null });
  for (const group of groups) {
    const member = await Trainee.findOne({
      groupId: group._id,
      campaignId: { $ne: null },
    });
    if (member) {
      group.campaignId = member.campaignId;
      await group.save();
      console.log(`[backfill] ${group.name}: gắn đợt tuyển ${member.campaignId}`);
    }
  }

  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
