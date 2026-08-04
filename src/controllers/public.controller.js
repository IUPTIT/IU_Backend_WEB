import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as campaignService from "../services/campaign.service.js";
import * as applicationService from "../services/application.service.js";
import * as uploadService from "../services/upload.service.js";

// ---- Public (Guest): đợt tuyển & form ----

export const listActiveCampaigns = catchAsync(async (_req, res) => {
  const campaigns = await campaignService.listActiveCampaigns();
  sendSuccess(res, { message: "Đợt tuyển đang mở", data: { campaigns } });
});

export const getForm = catchAsync(async (req, res) => {
  const form = await campaignService.getForm(req.params.id);
  sendSuccess(res, { message: "Form đăng ký", data: { form } });
});

// ---- Public (Guest): nộp đơn ----

// Upload avatar/CV trước khi nộp đơn — trả về URL Cloudinary
export const uploadFile = catchAsync(async (req, res) => {
  const { url } = await uploadService.uploadBuffer(req.body.kind, req.file);
  sendSuccess(res, { statusCode: 201, message: "Đã upload", data: { url } });
});

export const saveDraft = catchAsync(async (req, res) => {
  const { application } = await applicationService.saveDraft(req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã lưu đơn nháp — link tiếp tục điền đã gửi qua email",
    data: { applicationId: application.id },
  });
});

export const getDraft = catchAsync(async (req, res) => {
  const application = await applicationService.getDraftByToken(req.params.token);
  sendSuccess(res, { message: "Đơn nháp", data: { application } });
});

export const updateDraft = catchAsync(async (req, res) => {
  const application = await applicationService.updateDraft(
    req.params.token,
    req.body,
  );
  sendSuccess(res, { message: "Đã cập nhật đơn nháp", data: { application } });
});

export const submitApplication = catchAsync(async (req, res) => {
  const application = await applicationService.submitApplication(
    req.body,
    req.params.token ?? null,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã nộp hồ sơ",
    data: { application },
  });
});

// ---- Public (Guest): tra cứu / sửa / rút đơn ----

export const lookupApplication = catchAsync(async (req, res) => {
  const application = await applicationService.lookupApplication({
    email: req.query.email,
    code: req.query.code,
  });
  sendSuccess(res, { message: "Hồ sơ", data: { application } });
});

export const editApplication = catchAsync(async (req, res) => {
  const { email, ...data } = req.body;
  const application = await applicationService.editApplication(
    req.params.code,
    email,
    data,
  );
  sendSuccess(res, { message: "Đã cập nhật hồ sơ", data: { application } });
});

export const withdrawApplication = catchAsync(async (req, res) => {
  await applicationService.withdrawApplication(req.params.code, req.body.email);
  sendSuccess(res, { message: "Đã rút đơn — hồ sơ đã được xoá" });
});
