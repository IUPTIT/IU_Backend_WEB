/**
 * Backfill: tân binh đang training nhưng bị gán role member sớm → trả về candidate.
 * Chạy: node src/scripts/demoteTrainingMembersToCandidate.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import Trainee from "../models/trainee.model.js";
import User from "../models/user.model.js";

async function main() {
  await connectDatabase();

  const activeTrainees = await Trainee.find({
    status: { $nin: ["completed", "removed"] },
    evalStatus: { $nin: ["qualified", "certified"] },
    userId: { $ne: null },
  }).select("userId fullName email evalStatus status");

  let fixed = 0;
  for (const t of activeTrainees) {
    const user = await User.findById(t.userId);
    if (!user) continue;
    if (user.role === "candidate" && !user.memberStatus) continue;

    user.role = "candidate";
    user.roles = ["candidate"];
    user.memberStatus = undefined;
    await user.save();
    fixed += 1;
    console.log(`[fix] ${t.fullName} <${t.email}> → candidate`);
  }

  console.log(
    `Done. Fixed ${fixed}/${activeTrainees.length} trainee account(s).`,
  );
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
