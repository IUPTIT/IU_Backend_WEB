import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import * as campaignService from "./campaign.service.js";
import * as emailService from "./email.service.js";

// Mã hồ sơ: APP-<năm><F|S>-<số thứ tự trong đợt> — VD APP-2026F-0142
async function generateCode(campaign) {
  const open = new Date(campaign.openAt);
  const half = open.getMonth() + 1 >= 7 ? "F" : "S"; // Fall từ tháng 7, Spring trước đó
  const prefix = `APP-${open.getFullYear()}${half}`;
  const count = await Application.countDocuments({ campaign: campaign.id });
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

function assertCampaignAcceptsSubmissions(campaign) {
  if (!campaign) throw ApiError.notFound("No open recruitment campaign");
  const now = new Date();
  if (campaign.openAt > now) {
    throw ApiError.badRequest("Campaign has not started accepting applications yet");
  }
  if (campaign.status !== "open" || campaign.closeAt <= now) {
    throw ApiError.badRequest("Campaign is no longer accepting applications");
  }
}

function validateWishes(campaign, wishes) {
  const teams = campaign.quotas.map((q) => q.team);
  const unknown = wishes.filter((w) => !teams.includes(w));
  if (unknown.length) {
    throw ApiError.badRequest(`Unknown team(s): ${unknown.join(", ")}`);
  }
  if (new Set(wishes).size !== wishes.length) {
    throw ApiError.badRequest("Duplicate wishes are not allowed");
  }
}

function validateAnswers(campaign, answers = {}) {
  for (const q of campaign.customQuestions) {
    if (!q.required) continue;
    const answer = answers[q.id];
    const empty =
      answer == null ||
      (typeof answer === "string" && !answer.trim()) ||
      (Array.isArray(answer) && answer.length === 0);
    if (empty) {
      throw ApiError.badRequest(`Question "${q.label}" is required`);
    }
  }
}

export async function submitApplication(data) {
  const campaign = await campaignService.getActiveCampaign();
  assertCampaignAcceptsSubmissions(campaign);
  validateWishes(campaign, data.wishes);
  validateAnswers(campaign, data.answers);

  // Chặn email nộp trùng trong cùng đợt (nghiệp vụ 1.1)
  const existing = await Application.findOne({
    campaign: campaign.id,
    email: data.email,
  });
  if (existing && existing.status !== "withdrawn") {
    throw ApiError.conflict(
      "This email already has an application in the current campaign. Use the lookup page to edit it.",
    );
  }
  // Đã rút đơn thì cho nộp lại: ghi đè hồ sơ cũ
  if (existing) await Application.deleteOne({ _id: existing._id });

  const code = await generateCode(campaign);
  const application = await Application.create({
    ...data,
    campaign: campaign.id,
    code,
    status: "pending",
  });

  await emailService.sendApplicationReceivedEmail(application);
  return application;
}

// BCN: danh sách hồ sơ (lọc theo đợt tuyển / trạng thái)
export function listApplications({ campaignId, status } = {}) {
  const filter = {};
  if (campaignId) filter.campaign = campaignId;
  if (status) filter.status = status;
  return Application.find(filter)
    .sort({ createdAt: -1 })
    .populate("campaign", "name closeAt status");
}

// Tra cứu bằng email hoặc mã hồ sơ — không cần đăng nhập (nghiệp vụ 1.5)
export async function lookupApplication(query) {
  const q = String(query).trim();
  const application = await Application.findOne({
    $or: [{ code: q.toUpperCase() }, { email: q.toLowerCase() }],
  })
    .sort({ createdAt: -1 })
    .populate("campaign", "name closeAt status");
  if (!application) throw ApiError.notFound("Application not found");
  return application;
}

function assertEditable(application) {
  if (application.status !== "pending") {
    throw ApiError.badRequest(
      "Application can no longer be modified (already reviewed)",
    );
  }
  if (application.campaign.closeAt <= new Date()) {
    throw ApiError.badRequest("Campaign has closed — cannot modify");
  }
}

// Sửa hồ sơ trước hạn — chỉ khi còn "Chờ xét duyệt" và còn hạn nộp
export async function updateApplication(code, email, data) {
  const application = await lookupApplication(code);
  if (application.email !== String(email).toLowerCase()) {
    throw ApiError.forbidden("Email does not match this application");
  }
  assertEditable(application);

  const campaign = await campaignService.getCampaign(application.campaign.id);
  if (data.wishes) validateWishes(campaign, data.wishes);
  if (data.answers) validateAnswers(campaign, data.answers);

  // Không cho đổi campaign/code/status qua endpoint này
  const { wishes, answers, ...fields } = data;
  const allowed = [
    "fullName",
    "studentId",
    "className",
    "faculty",
    "phone",
    "dateOfBirth",
    "avatarUrl",
    "cvUrl",
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) application[key] = fields[key];
  }
  if (wishes) application.wishes = wishes;
  if (answers) application.answers = answers;
  await application.save();
  return application;
}

// Rút đơn — cùng điều kiện với sửa hồ sơ
export async function withdrawApplication(code, email) {
  const application = await lookupApplication(code);
  if (application.email !== String(email).toLowerCase()) {
    throw ApiError.forbidden("Email does not match this application");
  }
  assertEditable(application);

  application.status = "withdrawn";
  await application.save();
  return application;
}
