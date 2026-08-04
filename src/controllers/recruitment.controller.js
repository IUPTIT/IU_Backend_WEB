import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as campaignService from "../services/campaign.service.js";
import * as applicationService from "../services/application.service.js";
import * as uploadService from "../services/upload.service.js";

// ---- BCN: quản lý đợt tuyển ----

export const createCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.createCampaign(req.body, req.user.id);
  sendSuccess(res, {
    statusCode: 201,
    message: "Campaign created (draft)",
    data: { campaign },
  });
});

export const listCampaigns = catchAsync(async (_req, res) => {
  const campaigns = await campaignService.listCampaigns();
  sendSuccess(res, { message: "Campaigns", data: { campaigns } });
});

export const getCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.getCampaign(req.params.id);
  sendSuccess(res, { message: "Campaign", data: { campaign } });
});

export const updateCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.updateCampaign(req.params.id, req.body);
  sendSuccess(res, { message: "Campaign updated", data: { campaign } });
});

export const publishCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.publishCampaign(req.params.id);
  sendSuccess(res, { message: "Campaign published", data: { campaign } });
});

export const deleteCampaign = catchAsync(async (req, res) => {
  await campaignService.deleteCampaign(req.params.id);
  sendSuccess(res, { message: "Campaign deleted" });
});

export const listApplications = catchAsync(async (req, res) => {
  const applications = await applicationService.listApplications({
    campaignId: req.query.campaign,
    status: req.query.status,
  });
  sendSuccess(res, { message: "Applications", data: { applications } });
});

export const closeCampaign = catchAsync(async (req, res) => {
  const campaign = await campaignService.closeCampaign(req.params.id);
  sendSuccess(res, { message: "Campaign closed", data: { campaign } });
});

// ---- Public: form ứng tuyển ----

export const getActiveCampaign = catchAsync(async (_req, res) => {
  const campaign = await campaignService.getActiveCampaign();
  sendSuccess(res, { message: "Active campaign", data: { campaign } });
});

// Upload avatar/CV trước khi nộp đơn — trả về URL Cloudinary
export const uploadFile = catchAsync(async (req, res) => {
  const { url } = await uploadService.uploadBuffer(req.body.kind, req.file);
  sendSuccess(res, { statusCode: 201, message: "Uploaded", data: { url } });
});

export const submitApplication = catchAsync(async (req, res) => {
  const application = await applicationService.submitApplication(req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "Application submitted",
    data: { application },
  });
});

export const lookupApplication = catchAsync(async (req, res) => {
  const application = await applicationService.lookupApplication(req.query.query);
  sendSuccess(res, { message: "Application", data: { application } });
});

export const updateApplication = catchAsync(async (req, res) => {
  const { email, ...data } = req.body;
  const application = await applicationService.updateApplication(
    req.params.code,
    email,
    data,
  );
  sendSuccess(res, { message: "Application updated", data: { application } });
});

export const withdrawApplication = catchAsync(async (req, res) => {
  const application = await applicationService.withdrawApplication(
    req.params.code,
    req.body.email,
  );
  sendSuccess(res, { message: "Application withdrawn", data: { application } });
});
