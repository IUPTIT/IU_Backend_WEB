import { connectDatabase, disconnectDatabase } from "../config/database.js";
import Application from "../models/application.model.js";
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
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
