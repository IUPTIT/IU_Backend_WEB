import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as taskService from "../services/trainingTask.service.js";

export const createTask = catchAsync(async (req, res) => {
  const task = await taskService.createTask(req.body, req.user);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã giao task",
    data: { task },
  });
});

export const listTasks = catchAsync(async (req, res) => {
  const tasks = await taskService.listTasks(req.query, req.user);
  sendSuccess(res, { message: "Danh sách task", data: { tasks } });
});

export const getTask = catchAsync(async (req, res) => {
  const task = await taskService.getTask(req.params.id, req.user);
  sendSuccess(res, { message: "Chi tiết task", data: { task } });
});

export const updateTask = catchAsync(async (req, res) => {
  const task = await taskService.updateTask(req.params.id, req.body, req.user);
  sendSuccess(res, { message: "Đã cập nhật task", data: { task } });
});

export const deleteTask = catchAsync(async (req, res) => {
  await taskService.deleteTask(req.params.id, req.user);
  sendSuccess(res, { message: "Đã xoá task" });
});

export const reviewSubmission = catchAsync(async (req, res) => {
  const task = await taskService.reviewSubmission(
    req.params.id,
    req.params.traineeId,
    req.body,
    req.user,
  );
  sendSuccess(res, { message: "Đã chấm bài nộp", data: { task } });
});

export const listMyTasks = catchAsync(async (req, res) => {
  const tasks = await taskService.listMyTasks(req.user);
  sendSuccess(res, { message: "Task của bạn", data: { tasks } });
});

export const submitTask = catchAsync(async (req, res) => {
  const task = await taskService.submitTask(req.params.id, req.body, req.user);
  sendSuccess(res, { message: "Đã nộp bài", data: { task } });
});
