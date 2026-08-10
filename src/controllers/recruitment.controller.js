import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import ApiError from "../utils/ApiError.js";
import * as campaignService from "../services/campaign.service.js";
import * as applicationService from "../services/application.service.js";
import * as screeningService from "../services/screening.service.js";
import * as interviewService from "../services/interview.service.js";

// ---- BCN: quản lý đợt tuyển (Phần 0) ----

export const createCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.createCampaign(req.body, req.user.id);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã tạo đợt tuyển (draft)",
    data: { campaign },
  });
});

export const listCampaigns = catchAsync(async (_req, res) => {
  const campaigns = await campaignService.listCampaigns();
  sendSuccess(res, { message: "Danh sách đợt tuyển", data: { campaigns } });
});

export const getCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.getCampaign(req.params.id);
  sendSuccess(res, { message: "Chi tiết đợt tuyển", data: { campaign } });
});

export const updateCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.updateCampaign(
    req.params.id,
    req.body,
  );
  sendSuccess(res, { message: "Đã cập nhật đợt tuyển", data: { campaign } });
});

export const publishCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.publishCampaign(req.params.id);
  sendSuccess(res, { message: "Đã mở đợt tuyển", data: { campaign } });
});

export const closeCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.closeCampaign(req.params.id);
  sendSuccess(res, { message: "Đã đóng đợt tuyển", data: { campaign } });
});

export const completeCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.completeCampaign(req.params.id);
  sendSuccess(res, { message: "Đã hoàn tất đợt tuyển", data: { campaign } });
});

export const deleteCampaign = catchAsync(async (req, res) => {
  await campaignService.deleteCampaign(req.params.id);
  sendSuccess(res, { message: "Đã xoá đợt tuyển" });
});

// ---- BCN: form builder ----

export const getForm = catchAsync(async (req, res) => {
  const form = await campaignService.getForm(req.params.id);
  sendSuccess(res, { message: "Cấu hình form", data: { form } });
});

export const updateForm = catchAsync(async (req, res) => {
  const form = await campaignService.updateForm(req.params.id, req.body.fields);
  sendSuccess(res, { message: "Đã cập nhật form", data: { form } });
});

// ---- BCN: hồ sơ vòng đơn ----

export const listApplications = catchAsync(async (req, res) => {
  const result = await applicationService.listApplications({
    campaignId: req.query.campaignId,
    department: req.query.department,
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit,
  });
  sendSuccess(res, { message: "Danh sách hồ sơ", data: result });
});

export const getApplication = catchAsync(async (req, res) => {
  const application = await applicationService.getApplicationById(
    req.params.id,
  );
  sendSuccess(res, { message: "Chi tiết hồ sơ", data: { application } });
});

// ---- Phần 2: chấm điểm & quyết định vòng đơn ----

export const scoreApplication = catchAsync(async (req, res) => {
  // Vòng PV chỉ chấm qua booking (siết panel); endpoint này giữ cho vòng đơn
  if (req.body.round === "interview") {
    throw ApiError.badRequest(
      "Chấm điểm phỏng vấn phải qua ca/booking đã phân công (POST /bookings/:id/score)",
    );
  }
  const result = await screeningService.scoreApplication({
    applicationId: req.params.id,
    round: req.body.round,
    scoredBy: req.user.id,
    criteriaScores: req.body.criteriaScores,
    comment: req.body.comment,
    attendance: req.body.attendance ?? null,
  });
  sendSuccess(res, { statusCode: 201, message: "Đã lưu điểm", data: result });
});

export const getScoreSummary = catchAsync(async (req, res) => {
  const summary = await screeningService.getScoreSummary(
    req.params.id,
    req.query.round ?? "cv",
  );
  sendSuccess(res, { message: "Tổng hợp điểm", data: { summary } });
});

export const decideApplication = catchAsync(async (req, res) => {
  const application = await screeningService.decideCv(
    req.params.id,
    req.body.status,
  );
  sendSuccess(res, {
    message: "Đã cập nhật kết quả vòng đơn",
    data: { application },
  });
});

export const bulkDecideCv = catchAsync(async (req, res) => {
  const result = await screeningService.bulkDecideCvByThreshold({
    campaignId: req.body.campaignId,
    threshold: req.body.threshold,
    failBelow: req.body.failBelow ?? true,
  });
  sendSuccess(res, {
    message: "Đã duyệt hàng loạt vòng đơn theo ngưỡng điểm",
    data: result,
  });
});

export const assignOfficialDepartment = catchAsync(async (req, res) => {
  const application = await screeningService.assignOfficialDepartment(
    req.params.id,
    req.body.department,
  );
  sendSuccess(res, {
    message: "Đã cập nhật ban chính thức",
    data: { application },
  });
});

export const assignReviewers = catchAsync(async (req, res) => {
  const application = await screeningService.assignReviewers(
    req.params.id,
    req.body.reviewerIds,
  );
  sendSuccess(res, {
    message: "Đã phân công người chấm",
    data: { application },
  });
});

export const listUnbookedApplications = catchAsync(async (req, res) => {
  const applications = await interviewService.listUnbookedApplications(
    req.params.id,
  );
  sendSuccess(res, {
    message: "Danh sách chưa đặt lịch phỏng vấn",
    data: { applications },
  });
});

export const markUnbookedNoShow = catchAsync(async (req, res) => {
  const application = await interviewService.markUnbookedNoShow(req.params.id);
  sendSuccess(res, {
    message: "Đã đánh dấu vắng không đặt lịch",
    data: { application },
  });
});

// ---- Phần 3: ca phỏng vấn (BCN) ----

export const createSlot = catchAsync(async (req, res) => {
  const slot = await interviewService.createSlot(req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã tạo ca phỏng vấn",
    data: { slot },
  });
});

export const bulkGenerateSlots = catchAsync(async (req, res) => {
  const slots = await interviewService.bulkGenerateSlots({
    ...req.body,
    campaignId: req.params.id,
  });
  sendSuccess(res, {
    statusCode: 201,
    message: `Đã tạo ${slots.length} ca phỏng vấn`,
    data: { slots },
  });
});

export const listSlots = catchAsync(async (req, res) => {
  const result = await interviewService.listSlots(req.params.id);
  sendSuccess(res, { message: "Danh sách ca phỏng vấn", data: result });
});

export const listMyInterviewSlots = catchAsync(async (req, res) => {
  const result = await interviewService.listMyInterviewSlots(req.user.id);
  sendSuccess(res, {
    message: "Ca phỏng vấn bạn phụ trách",
    data: result,
  });
});

export const updateSlot = catchAsync(async (req, res) => {
  const slot = await interviewService.updateSlot(req.params.id, req.body);
  sendSuccess(res, { message: "Đã cập nhật ca phỏng vấn", data: { slot } });
});

export const deleteSlot = catchAsync(async (req, res) => {
  await interviewService.deleteSlot(req.params.id);
  sendSuccess(res, { message: "Đã xoá ca phỏng vấn" });
});

export const getSlotDetail = catchAsync(async (req, res) => {
  const result = await interviewService.getSlotDetail(req.params.id, {
    id: req.user.id,
    role: req.user.role,
  });
  sendSuccess(res, { message: "Chi tiết ca phỏng vấn", data: result });
});

export const getBookingDetail = catchAsync(async (req, res) => {
  const result = await interviewService.getBookingDetail(req.params.id, {
    id: req.user.id,
    role: req.user.role,
  });
  sendSuccess(res, { message: "Chi tiết lịch phỏng vấn", data: result });
});

export const listInterviewResults = catchAsync(async (req, res) => {
  const results = await interviewService.listInterviewResults(req.params.id);
  sendSuccess(res, {
    message: "Kết quả phỏng vấn toàn đợt",
    data: { results },
  });
});

export const assignSlot = catchAsync(async (req, res) => {
  const booking = await interviewService.assignSlot(
    req.params.id,
    req.body.slotId,
  );
  sendSuccess(res, { message: "Đã gán lịch phỏng vấn", data: { booking } });
});

export const scoreBooking = catchAsync(async (req, res) => {
  const result = await interviewService.scoreBooking(
    req.params.id,
    req.user.id,
    {
      criteriaScores: req.body.criteriaScores,
      comment: req.body.comment,
      attendance: req.body.attendance,
      asUserId: req.body.asUserId,
    },
    req.user.role,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã lưu điểm phỏng vấn",
    data: result,
  });
});

export const decideInterview = catchAsync(async (req, res) => {
  const application = await screeningService.decideInterview(
    req.params.id,
    req.body.status,
  );
  sendSuccess(res, {
    message: "Đã cập nhật kết quả phỏng vấn",
    data: { application },
  });
});

export const listInterviewers = catchAsync(async (_req, res) => {
  const interviewers = await interviewService.listInterviewers();
  sendSuccess(res, {
    message: "Danh sách người phỏng vấn",
    data: { interviewers },
  });
});

// ---- Phần 4: kết quả cuối & bàn giao ----

export const confirmFinal = catchAsync(async (req, res) => {
  const application = await screeningService.confirmFinal(
    req.params.id,
    req.body.status,
  );
  sendSuccess(res, {
    message: "Đã xác nhận kết quả cuối",
    data: { application },
  });
});

export const markResultNotified = catchAsync(async (req, res) => {
  const result = await screeningService.markResultNotified(
    req.body.applicationIds,
  );
  sendSuccess(res, {
    message: "Đã cập nhật trạng thái gửi email",
    data: result,
  });
});

export const markInterviewResultNotified = catchAsync(async (req, res) => {
  const result = await screeningService.markInterviewResultNotified(
    req.body.applicationIds,
  );
  sendSuccess(res, {
    message: "Đã ghi nhận gửi email kết quả phỏng vấn",
    data: result,
  });
});

export const listNewMembers = catchAsync(async (req, res) => {
  const members = await screeningService.listNewMembers(req.params.id);
  sendSuccess(res, { message: "Danh sách tân thành viên", data: { members } });
});
