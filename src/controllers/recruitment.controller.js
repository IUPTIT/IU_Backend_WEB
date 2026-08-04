import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as campaignService from "../services/campaign.service.js";
import * as applicationService from "../services/application.service.js";

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
