import dotenv from "dotenv";
dotenv.config();

const { connectDatabase, disconnectDatabase } =
  await import("../config/database.js");
const { default: User } = await import("../models/user.model.js");

await connectDatabase();

const filter = {
  $and: [
    {
      $or: [
        { role: "candidate" },
        { roles: "candidate" },
        { memberStatus: "training" },
      ],
    },
    { departmentId: { $ne: null } },
  ],
};

const r = await User.updateMany(filter, {
  $unset: { departmentId: 1, departmentJoinedAt: 1 },
});
console.log("cleared departmentId for trainees/candidates:", r.modifiedCount);

const lien = await User.findOne({
  email: "hoangngoclien13112006@gmail.com",
})
  .select("name role roles memberStatus departmentId department")
  .lean();
console.log("Lien:", JSON.stringify(lien, null, 2));

await disconnectDatabase();
