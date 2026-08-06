/**
 * Chuẩn hóa dữ liệu:
 * - role "leader" chỉ dành cho Leader Ban đang hoạt động.
 * - Mentor training chỉ dùng cờ isMentor và không làm thay đổi role.
 */
import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import DepartmentLeadershipEvent from "../models/departmentLeadershipEvent.model.js";
import TrainingGroup from "../models/trainingGroup.model.js";
import User from "../models/user.model.js";
import { addRole, hasRole, removeRole } from "../utils/roles.js";

async function main() {
  await connectDatabase();

  const [activeLeaderships, mentoredGroups, users] = await Promise.all([
    DepartmentLeadershipEvent.find({ isActive: true }).select("userId"),
    TrainingGroup.find({ mentorId: { $ne: null } }).select("mentorId"),
    User.find({}),
  ]);
  const leaderIds = new Set(
    activeLeaderships.map((event) => String(event.userId)),
  );
  const mentorIds = new Set(
    mentoredGroups.map((group) => String(group.mentorId)),
  );

  let leadersGranted = 0;
  let falseLeadersRemoved = 0;
  let mentorsMarked = 0;
  for (const user of users) {
    const id = String(user._id);
    let changed = false;

    if (leaderIds.has(id) && !hasRole(user, "leader")) {
      addRole(user, "leader");
      leadersGranted += 1;
      changed = true;
    } else if (!leaderIds.has(id) && hasRole(user, "leader")) {
      removeRole(user, "leader");
      falseLeadersRemoved += 1;
      changed = true;
    }

    if (mentorIds.has(id) && user.isMentor !== true) {
      user.isMentor = true;
      mentorsMarked += 1;
      changed = true;
    }

    if (changed) await user.save();
  }

  console.log("Đã tách dữ liệu Leader Ban / Mentor training:");
  console.log(` - Cấp lại Leader Ban đúng dữ liệu: ${leadersGranted}`);
  console.log(` - Gỡ Leader không thuộc Ban: ${falseLeadersRemoved}`);
  console.log(` - Đồng bộ cờ Mentor từ team: ${mentorsMarked}`);
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
