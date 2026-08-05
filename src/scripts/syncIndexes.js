import { connectDatabase, disconnectDatabase } from "../config/database.js";
import Application from "../models/application.model.js";

// Đồng bộ index của collection applications với schema hiện tại
// (Mongo không tự sửa index đã tồn tại — đổi sparse -> partial phải chạy script này)
async function main() {
  await connectDatabase();
  const result = await Application.syncIndexes();
  console.log("[syncIndexes] applications:", result);
  console.log(await Application.collection.indexes());
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
