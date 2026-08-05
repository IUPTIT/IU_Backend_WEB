import ApiError from "../utils/ApiError.js";
import TrainingTask from "../models/trainingTask.model.js";
import TrainingGroup from "../models/trainingGroup.model.js";
import Trainee from "../models/trainee.model.js";

// BCN/Leader quản được mọi team; mentor chỉ quản team mình dẫn
function assertCanManageGroup(user, group) {
  if (["bcn", "leader"].includes(user.role)) return;
  if (group.mentorId && String(group.mentorId) === String(user.id)) return;
  throw ApiError.forbidden("Bạn không phải mentor của team này");
}

async function getGroup(groupId) {
  const group = await TrainingGroup.findById(groupId);
  if (!group) throw ApiError.notFound("Không tìm thấy team");
  return group;
}

async function getTaskWithGroup(taskId) {
  const task = await TrainingTask.findById(taskId);
  if (!task) throw ApiError.notFound("Không tìm thấy task");
  const group = await getGroup(task.groupId);
  return { task, group };
}

// ---- Mentor giao / quản lý task ----

export async function createTask(data, user) {
  const group = await getGroup(data.groupId);
  assertCanManageGroup(user, group);

  // Không truyền assigneeIds → giao cho cả team
  const traineeIds = data.assigneeIds?.length
    ? data.assigneeIds
    : group.memberIds.map(String);
  const outsiders = traineeIds.filter(
    (id) => !group.memberIds.some((m) => String(m) === String(id)),
  );
  if (outsiders.length) {
    throw ApiError.badRequest("Có trainee không thuộc team này");
  }

  return TrainingTask.create({
    groupId: group._id,
    title: data.title,
    description: data.description ?? "",
    attachmentUrl: data.attachmentUrl ?? "",
    deadline: data.deadline ?? null,
    assignments: traineeIds.map((traineeId) => ({ traineeId })),
    createdBy: user.id,
  });
}

export async function listTasks({ groupId }, user) {
  const filter = {};
  if (groupId) {
    const group = await getGroup(groupId);
    assertCanManageGroup(user, group);
    filter.groupId = group._id;
  } else if (!["bcn", "leader"].includes(user.role)) {
    // Mentor không truyền groupId → chỉ thấy task của các team mình dẫn
    const myGroups = await TrainingGroup.find({ mentorId: user.id }).select(
      "_id",
    );
    filter.groupId = { $in: myGroups.map((g) => g._id) };
  }
  return TrainingTask.find(filter)
    .sort({ createdAt: -1 })
    .populate("groupId", "name mentorId")
    .populate("assignments.traineeId", "fullName email department");
}

export async function getTask(taskId, user) {
  const { task, group } = await getTaskWithGroup(taskId);
  assertCanManageGroup(user, group);
  return task.populate("assignments.traineeId", "fullName email department");
}

export async function updateTask(taskId, data, user) {
  const { task, group } = await getTaskWithGroup(taskId);
  assertCanManageGroup(user, group);
  const { title, description, attachmentUrl, deadline } = data;
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (attachmentUrl !== undefined) task.attachmentUrl = attachmentUrl;
  if (deadline !== undefined) {
    task.deadline = deadline;
    task.deadlineReminderSentAt = null;
  }
  await task.save();
  return task;
}

export async function deleteTask(taskId, user) {
  const { task, group } = await getTaskWithGroup(taskId);
  assertCanManageGroup(user, group);
  await task.deleteOne();
}

// Mentor chấm bài nộp của một trainee
export async function reviewSubmission(taskId, traineeId, data, user) {
  const { task, group } = await getTaskWithGroup(taskId);
  assertCanManageGroup(user, group);
  const assignment = task.assignments.find(
    (a) => String(a.traineeId) === String(traineeId),
  );
  if (!assignment) {
    throw ApiError.notFound("Trainee không được giao task này");
  }
  if (assignment.status === "assigned") {
    throw ApiError.badRequest("Trainee chưa nộp bài — chưa chấm được");
  }
  assignment.status = data.status; // approved | rejected
  if (data.feedback !== undefined) assignment.feedback = data.feedback;
  if (data.score !== undefined) assignment.score = data.score;
  assignment.reviewedAt = new Date();
  await task.save();
  return task;
}

// ---- Trainee: xem task của mình + nộp bài ----

async function getMyTrainee(user) {
  const trainee = await Trainee.findOne({ userId: user.id });
  if (!trainee) throw ApiError.forbidden("Bạn không phải trainee");
  return trainee;
}

export async function listMyTasks(user) {
  const trainee = await getMyTrainee(user);
  return TrainingTask.find({ "assignments.traineeId": trainee._id })
    .sort({ createdAt: -1 })
    .populate("groupId", "name mentorId");
}

export async function submitTask(taskId, data, user) {
  const trainee = await getMyTrainee(user);
  const task = await TrainingTask.findById(taskId);
  if (!task) throw ApiError.notFound("Không tìm thấy task");
  const assignment = task.assignments.find(
    (a) => String(a.traineeId) === String(trainee._id),
  );
  if (!assignment) throw ApiError.forbidden("Bạn không được giao task này");
  if (assignment.status === "approved") {
    throw ApiError.badRequest("Bài đã được duyệt — không nộp lại được");
  }
  assignment.status = "submitted";
  assignment.submissionUrl = data.submissionUrl ?? "";
  assignment.submissionNote = data.submissionNote ?? "";
  assignment.submittedAt = new Date();
  await task.save();
  return task;
}
