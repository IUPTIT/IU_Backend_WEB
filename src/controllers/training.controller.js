import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as trainingService from "../services/training.service.js";

export const listTrainees = catchAsync(async (req, res) => {
  const trainees = await trainingService.listTrainees(req.query.department);
  sendSuccess(res, { message: "Danh sách trainee", data: { trainees } });
});

export const listMentors = catchAsync(async (_req, res) => {
  const mentors = await trainingService.listMentors();
  sendSuccess(res, { message: "Danh sách mentor", data: { mentors } });
});

export const listMentorCandidates = catchAsync(async (_req, res) => {
  const candidates = await trainingService.listMentorCandidates();
  sendSuccess(res, {
    message: "Danh sách member/leader",
    data: { candidates },
  });
});

export const setMentor = catchAsync(async (req, res) => {
  const user = await trainingService.setMentor(
    req.params.id,
    req.body.isMentor,
  );
  sendSuccess(res, {
    message: req.body.isMentor ? "Đã đẩy quyền mentor" : "Đã gỡ quyền mentor",
    data: { user },
  });
});

export const autoAssignGroups = catchAsync(async (req, res) => {
  const result = await trainingService.autoAssignGroups(
    req.body.programId,
    req.user.id,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: `Đã chia ${result.assigned} tân binh vào ${result.groups.length} team`,
    data: result,
  });
});

export const listPrograms = catchAsync(async (_req, res) => {
  const programs = await trainingService.listPrograms();
  sendSuccess(res, { message: "Danh sách lộ trình", data: { programs } });
});

export const getProgram = catchAsync(async (req, res) => {
  const program = await trainingService.getProgram(req.params.id);
  sendSuccess(res, { message: "Lộ trình", data: { program } });
});

export const createProgram = catchAsync(async (req, res) => {
  const program = await trainingService.createProgram(req.body, req.user.id);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã tạo lộ trình",
    data: { program },
  });
});

export const listGroups = catchAsync(async (_req, res) => {
  const groups = await trainingService.listGroups();
  sendSuccess(res, { message: "Danh sách team", data: { groups } });
});

export const createGroup = catchAsync(async (req, res) => {
  const group = await trainingService.createGroup(req.body, req.user.id);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã tạo team",
    data: { group },
  });
});

export const getReviewSummary = catchAsync(async (_req, res) => {
  const summary = await trainingService.getReviewSummary();
  sendSuccess(res, { message: "Tổng kết training", data: { summary } });
});

export const updateEvalStatus = catchAsync(async (req, res) => {
  const trainee = await trainingService.updateEvalStatus(
    req.params.id,
    req.body.evalStatus,
  );
  sendSuccess(res, { message: "Đã cập nhật đánh giá", data: { trainee } });
});

export const issueCertificates = catchAsync(async (req, res) => {
  const result = await trainingService.issueCertificates(req.body.traineeIds);
  sendSuccess(res, {
    message: `Đã cấp ${result.issued} chứng nhận`,
    data: result,
  });
});
