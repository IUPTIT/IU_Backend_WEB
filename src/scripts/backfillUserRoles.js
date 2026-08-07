/**
 * Backfill User.roles[] và liên kết User.departmentId theo tên Ban đang có.
 * Chạy: node src/scripts/backfillUserRoles.js
 */
import dotenv from "dotenv";

dotenv.config();

const { connectDatabase, disconnectDatabase } =
  await import("../config/database.js");
const departmentService = await import("../services/department.service.js");

async function main() {
  await connectDatabase();
  const backfill = await departmentService.backfillUserRolesAndDepartments();
  console.log("Backfill:", backfill);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
