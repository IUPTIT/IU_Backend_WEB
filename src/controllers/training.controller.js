import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as trainingService from "../services/training.service.js";

export const getMyTraining = catchAsync(async (req, res) => {
  const result = await trainingService.getMyTraining(req.user.id);
  sendSuccess(res, { message: "Vòng training của bạn", data: result });
});

export const listTrainees = catchAsync(async (req, res) => {
  const trainees = await trainingService.listTrainees(
    req.query.department,
    req.query.campaignId,
    req.user,
  );
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

export const listPrograms = catchAsync(async (req, res) => {
  const programs = await trainingService.listPrograms(req.user);
  sendSuccess(res, { message: "Danh sách lộ trình", data: { programs } });
});

export const getProgram = catchAsync(async (req, res) => {
  const program = await trainingService.getProgram(req.params.id);
  sendSuccess(res, { message: "Lộ trình", data: { program } });
});

export const createProgram = catchAsync(async (req, res) => {
  const program = await trainingService.createProgram(req.body, req.user);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã tạo lộ trình",
    data: { program },
  });
});

export const updateProgram = catchAsync(async (req, res) => {
  const program = await trainingService.updateProgram(
    req.params.id,
    req.body,
    req.user,
  );
  sendSuccess(res, { message: "Đã cập nhật lộ trình", data: { program } });
});

export const deleteProgram = catchAsync(async (req, res) => {
  await trainingService.deleteProgram(req.params.id, req.user);
  sendSuccess(res, { message: "Đã xóa lộ trình" });
});

export const listGroups = catchAsync(async (req, res) => {
  const groups = await trainingService.listGroups(
    req.query.campaignId,
    req.user,
  );
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

export const updateGroup = catchAsync(async (req, res) => {
  const group = await trainingService.updateGroup(
    req.params.id,
    req.body,
    req.user,
  );
  sendSuccess(res, { message: "Đã cập nhật nhóm training", data: { group } });
});

export const deleteGroup = catchAsync(async (req, res) => {
  await trainingService.deleteGroup(req.params.id);
  sendSuccess(res, { message: "Đã xóa nhóm training" });
});

export const resendGroupNotifications = catchAsync(async (req, res) => {
  const result = await trainingService.resendGroupNotifications(
    req.body.groupIds,
  );
  sendSuccess(res, {
    message: `Đã gửi ${result.sent} thông báo phân nhóm`,
    data: result,
  });
});

export const getMyProgress = catchAsync(async (req, res) => {
  const progress = await trainingService.getMyProgress(req.user.id);
  sendSuccess(res, { message: "Tiến độ training", data: { progress } });
});

export const handleIncomplete = catchAsync(async (req, res) => {
  const result = await trainingService.handleIncompleteTrainee(
    req.params.id,
    req.body,
    req.user,
  );
  sendSuccess(res, {
    message:
      req.body.action === "remove_from_club"
        ? "Đã loại thành viên khỏi CLB"
        : "Đã gửi nhắc nhở lần cuối",
    data: result,
  });
});

export const confirmCompletion = catchAsync(async (req, res) => {
  const trainee = await trainingService.confirmTrainingCompletion(
    req.params.id,
    req.body.note,
    req.user,
  );
  sendSuccess(res, {
    message: "Đã xác nhận hoàn thành training (gửi BCN)",
    data: { trainee },
  });
});

export const listGroupMessages = catchAsync(async (req, res) => {
  const messages = await trainingService.listGroupMessages(
    req.params.id,
    req.user,
    { limit: req.query.limit },
  );
  sendSuccess(res, { message: "Tin nhắn nhóm", data: { messages } });
});

export const postGroupMessage = catchAsync(async (req, res) => {
  const message = await trainingService.postGroupMessage(
    req.params.id,
    req.body.content,
    req.user,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã gửi tin nhắn",
    data: { message },
  });
});

export const getReviewSummary = catchAsync(async (req, res) => {
  const summary = await trainingService.getReviewSummary(req.query.campaignId);
  sendSuccess(res, { message: "Tổng kết training", data: { summary } });
});

export const listMyTeamTrainees = catchAsync(async (req, res) => {
  const trainees = await trainingService.listMyTeamTrainees(req.user.id);
  sendSuccess(res, { message: "Tân binh team của bạn", data: { trainees } });
});

export const saveMentorReview = catchAsync(async (req, res) => {
  const trainee = await trainingService.saveMentorReview(
    req.params.id,
    req.body,
    req.user,
  );
  sendSuccess(res, { message: "Đã lưu đánh giá quá trình", data: { trainee } });
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
