/**
 * Xóa toàn bộ dữ liệu Ban (ClubDepartment + lịch sử) và gỡ liên kết Ban khỏi User.
 * Role Leader chỉ thuộc nghiệp vụ Ban nên sẽ được gỡ; cờ isMentor độc lập được giữ.
 * Chạy: node src/scripts/clearDepartments.js
 */
import dotenv from "dotenv";

dotenv.config();

const { connectDatabase, disconnectDatabase } =
  await import("../config/database.js");
const { default: ClubDepartment } =
  await import("../models/clubDepartment.model.js");
const { default: DepartmentMembershipEvent } =
  await import("../models/departmentMembershipEvent.model.js");
const { default: DepartmentLeadershipEvent } =
  await import("../models/departmentLeadershipEvent.model.js");
const { default: User } = await import("../models/user.model.js");
const { hasRole, removeRole } = await import("../utils/roles.js");

async function main() {
  await connectDatabase();

  const departments = await ClubDepartment.deleteMany({});
  const membershipEvents = await DepartmentMembershipEvent.deleteMany({});
  const leadershipEvents = await DepartmentLeadershipEvent.deleteMany({});

  const users = await User.updateMany(
    {},
    {
      $set: { department: "", departmentId: null, departmentJoinedAt: null },
    },
  );

  const leaders = await User.find({
    $or: [{ roles: "leader" }, { role: "leader" }],
  });
  let demoted = 0;
  for (const user of leaders) {
    if (!hasRole(user, "leader")) continue;
    removeRole(user, "leader");
    await user.save();
    demoted += 1;
  }

  console.log("Đã xóa dữ liệu Ban:");
  console.log(` - Ban: ${departments.deletedCount}`);
  console.log(` - Lịch sử thành viên Ban: ${membershipEvents.deletedCount}`);
  console.log(` - Lịch sử Leader Ban: ${leadershipEvents.deletedCount}`);
  console.log(` - User gỡ liên kết Ban: ${users.modifiedCount}`);
  console.log(` - Leader Ban bị gỡ role: ${demoted}`);

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
