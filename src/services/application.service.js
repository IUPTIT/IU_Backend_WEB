import crypto from "crypto";
import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import ApplicationForm from "../models/applicationForm.model.js";
import ApplicationScore from "../models/applicationScore.model.js";
import Counter from "../models/counter.model.js";
import * as campaignService from "./campaign.service.js";
import * as emailService from "./email.service.js";
import { transition } from "./applicationStateMachine.js";

const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // draft token sống 7 ngày (hết hạn job dọn)

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function assertCampaignAcceptsSubmissions(campaign) {
  const now = new Date();
  if (campaign.openAt > now) {
    throw ApiError.badRequest("Đợt tuyển chưa tới thời gian mở đơn");
  }
  if (campaign.status !== "open" || campaign.closeAt <= now) {
    throw ApiError.badRequest("Đợt tuyển đã đóng — không nhận hồ sơ");
  }
}

// Ban nguyện vọng phải nằm trong quotas của đợt tuyển
function validatePreferences(campaign, preferences = []) {
  const departments = campaign.quotas.map((q) => q.department);
  const unknown = preferences
    .map((p) => p.department)
    .filter((d) => !departments.includes(d));
  if (unknown.length) {
    throw ApiError.badRequest(
      `Ban không tồn tại trong đợt tuyển: ${unknown.join(", ")}`,
    );
  }
}

// Câu trả lời phải khớp form: field bắt buộc (không cố định) phải có value
async function validateAnswers(campaign, answers = []) {
  const form = await ApplicationForm.findOne({ campaignId: campaign._id });
  if (!form) return;
  const byId = new Map(answers.map((a) => [a.fieldId, a.value]));
  const fixedIds = new Set([
    "full_name",
    "student_id",
    "class_name",
    "faculty",
    "email",
    "phone",
    "date_of_birth",
    "avatar",
    "cv",
    "department_preferences",
  ]);
  for (const field of form.fields) {
    if (fixedIds.has(field.fieldId) || !field.required) continue;
    const value = byId.get(field.fieldId);
    const empty =
      value == null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0);
    if (empty) {
      throw ApiError.badRequest(`Câu hỏi "${field.label}" là bắt buộc`);
    }
  }
}

// Mã hồ sơ: APP-<năm><F|S>-<số thứ tự trong đợt> — VD APP-2026F-0142
// Số thứ tự cấp qua Counter ($inc atomic) — hai request submit đồng thời không thể
// nhận cùng một mã (trước đây đọc max rồi +1 nên bị race → E11000/409)
async function generateCode(campaign) {
  const open = new Date(campaign.openAt);
  const half = open.getMonth() + 1 >= 7 ? "F" : "S"; // Fall từ tháng 7, Spring trước đó
  const prefix = `APP-${open.getFullYear()}${half}`;
  const key = `applicationCode:${campaign._id}:${prefix}`;

  // Đồng bộ counter với dữ liệu có sẵn (đơn nộp trước khi có counter) — $max chỉ
  // nâng counter lên, không bao giờ hạ xuống nên gọi lặp lại vẫn an toàn
  const latest = await Application.findOne({
    campaignId: campaign._id,
    applicationCode: { $regex: `^${prefix}-` },
  })
    .sort({ applicationCode: -1 })
    .select("applicationCode");
  if (latest) {
    const lastSeq = Number.parseInt(
      latest.applicationCode.split("-").pop(),
      10,
    );
    await Counter.updateOne(
      { _id: key },
      { $max: { seq: lastSeq } },
      { upsert: true },
    );
  }

  const seq = await Counter.nextSeq(key);
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// ---- Public: draft flow (nghiệp vụ 1.2) ----

export async function saveDraft(data) {
  const campaign = await campaignService.getCampaign(data.campaignId);
  assertCampaignAcceptsSubmissions(campaign);

  const already = await Application.hasActiveSubmittedApplication(
    campaign._id,
    data.email,
  );
  if (already) {
    throw ApiError.conflict(
      "Email này đã nộp hồ sơ chính thức trong đợt tuyển. Dùng trang tra cứu để chỉnh sửa.",
    );
  }

  const token = crypto.randomBytes(32).toString("hex");
  const draftExpiresAt = new Date(Date.now() + DRAFT_TTL_MS);

  // Mỗi email chỉ giữ 1 draft/đợt — lưu lại thì ghi đè draft cũ
  let application = await Application.findOne({
    campaignId: campaign._id,
    email: data.email,
    status: "draft",
  });
  if (application) {
    Object.assign(application, data);
    application.draftTokenHash = hashToken(token);
    application.draftExpiresAt = draftExpiresAt;
    await application.save();
  } else {
    application = await Application.create({
      ...data,
      status: "draft",
      draftTokenHash: hashToken(token),
      draftExpiresAt,
    });
  }

  await emailService.sendDraftLinkEmail(application, token);
  return { application, draftToken: token };
}

export async function getDraftByToken(token) {
  const application = await Application.findOne({
    draftTokenHash: hashToken(token),
    status: "draft",
  }).populate("campaignId", "name openAt closeAt status quotas");
  if (!application)
    throw ApiError.notFound("Đơn nháp không tồn tại hoặc đã nộp");
  if (application.draftExpiresAt && application.draftExpiresAt < new Date()) {
    throw ApiError.badRequest("Link đơn nháp đã hết hạn");
  }
  return application;
}

export async function updateDraft(token, data) {
  const application = await getDraftByToken(token);
  // Không cho đổi campaign/email của draft qua endpoint này
  const { campaignId: _campaignId, email: _email, ...fields } = data;
  Object.assign(application, fields);
  await application.save();
  return application;
}

// ---- Public: nộp đơn chính thức (nghiệp vụ 1.1) ----

export async function submitApplication(data, draftToken = null) {
  const campaign = await campaignService.getCampaign(data.campaignId);
  assertCampaignAcceptsSubmissions(campaign);
  validatePreferences(campaign, data.departmentPreferences);
  await validateAnswers(campaign, data.answers);

  const already = await Application.hasActiveSubmittedApplication(
    campaign._id,
    data.email,
  );
  if (already) {
    throw ApiError.conflict(
      "Email này đã nộp hồ sơ trong đợt tuyển hiện tại. Dùng trang tra cứu để chỉnh sửa.",
    );
  }

  // Có token thì submit từ draft; không có thì tạo draft ẩn rồi submit luôn
  let application;
  if (draftToken) {
    application = await getDraftByToken(draftToken);
    if (
      String(application.campaignId._id ?? application.campaignId) !==
      String(campaign._id)
    ) {
      throw ApiError.badRequest("Đơn nháp không thuộc đợt tuyển này");
    }
    const { campaignId: _campaignId, ...fields } = data;
    Object.assign(application, fields);
  } else {
    application = await Application.create({ ...data, status: "draft" });
  }

  application.applicationCode = await generateCode(campaign);
  application.submittedAt = new Date();
  application.draftTokenHash = null;
  application.draftExpiresAt = null;
  await application.save();

  // Đổi trạng thái qua state machine — KHÔNG set status trực tiếp
  await transition(application._id, "pending_review");
  application.status = "pending_review";

  // Có hồ sơ nộp đầu tiên → khoá cấu trúc form (nghiệp vụ 0.2)
  await ApplicationForm.updateOne(
    { campaignId: campaign._id, isLocked: false },
    { $set: { isLocked: true } },
  );

  await emailService.sendApplicationReceivedEmail(application);
  return application;
}

// ---- Public: tra cứu / sửa / rút đơn (nghiệp vụ 1.5) ----

export async function lookupApplication({ email, code }) {
  const filter = { status: { $ne: "draft" } };
  if (code) filter.applicationCode = String(code).trim().toUpperCase();
  if (email) filter.email = String(email).trim().toLowerCase();
  const application = await Application.findOne(filter)
    .sort({ createdAt: -1 })
    .populate("campaignId", "name closeAt status");
  if (!application) throw ApiError.notFound("Không tìm thấy hồ sơ");
  return application;
}

function assertOwner(application, email) {
  if (application.email !== String(email).trim().toLowerCase()) {
    throw ApiError.forbidden("Email không khớp với hồ sơ này");
  }
}

async function assertEditable(application) {
  const closeAt = application.campaignId?.closeAt;
  if (!application.canEdit(closeAt)) {
    throw ApiError.badRequest(
      "Hồ sơ không còn được chỉnh sửa (đã qua vòng xét duyệt hoặc đợt tuyển đã đóng)",
    );
  }
  // Nghiệp vụ 1.5: không sửa/rút khi BCN đã bắt đầu chấm điểm
  const scored = await ApplicationScore.exists({
    applicationId: application._id,
    round: "cv",
  });
  if (scored) {
    throw ApiError.badRequest(
      "Hồ sơ đã được BCN bắt đầu chấm điểm — không thể sửa hoặc rút đơn",
    );
  }
}

// Sửa hồ sơ trước hạn — chỉ khi còn pending_review và còn hạn nộp
export async function editApplication(code, email, data) {
  const application = await lookupApplication({ code });
  assertOwner(application, email);
  assertEditable(application);

  const campaign = await campaignService.getCampaign(
    application.campaignId._id ?? application.campaignId,
  );
  if (data.departmentPreferences) {
    validatePreferences(campaign, data.departmentPreferences);
  }
  if (data.answers) await validateAnswers(campaign, data.answers);

  // Không cho đổi campaign/code/status/email qua endpoint này
  const allowed = [
    "fullName",
    "studentId",
    "className",
    "faculty",
    "phone",
    "dateOfBirth",
    "avatarUrl",
    "cvUrl",
    "departmentPreferences",
    "answers",
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) application[key] = data[key];
  }
  await application.save();
  return application;
}

// Rút đơn = XOÁ hồ sơ (theo state machine: pending_review + còn hạn → DELETED)
export async function withdrawApplication(code, email) {
  const application = await lookupApplication({ code });
  assertOwner(application, email);
  assertEditable(application);
  await Application.deleteOne({ _id: application._id });
}

// ---- BCN: danh sách hồ sơ vòng đơn ----

export async function listApplications({
  campaignId,
  department,
  status,
  page = 1,
  limit = 20,
} = {}) {
  const filter = { status: { $ne: "draft" } };
  if (campaignId) filter.campaignId = campaignId;
  if (status) filter.status = status;
  if (department) filter["departmentPreferences.department"] = department;

  const numericLimit = Math.min(Number(limit) || 20, 100);
  const numericPage = Math.max(Number(page) || 1, 1);

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: -1 })
      .skip((numericPage - 1) * numericLimit)
      .limit(numericLimit)
      .populate("campaignId", "name closeAt status")
      .populate("reviewerIds", "name email"),
    Application.countDocuments(filter),
  ]);

  // Đính kèm điểm trung bình từng vòng (thang 0-100) để FE hiển thị danh sách
  const averages = await ApplicationScore.aggregate([
    { $match: { applicationId: { $in: applications.map((a) => a._id) } } },
    {
      $group: {
        _id: { applicationId: "$applicationId", round: "$round" },
        avg: { $avg: "$totalScore" },
      },
    },
  ]);
  const scoreMap = new Map(
    averages.map((s) => [`${s._id.applicationId}:${s._id.round}`, s.avg]),
  );
  const enriched = applications.map((doc) => {
    const obj = doc.toObject({ virtuals: true });
    const cv = scoreMap.get(`${doc._id}:cv`);
    const interview = scoreMap.get(`${doc._id}:interview`);
    obj.cvScore = cv != null ? Number(cv.toFixed(2)) : null;
    obj.interviewScore =
      interview != null ? Number(interview.toFixed(2)) : null;
    return obj;
  });

  return {
    applications: enriched,
    total,
    page: numericPage,
    limit: numericLimit,
  };
}
