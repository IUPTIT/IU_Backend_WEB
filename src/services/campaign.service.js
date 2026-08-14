import ApiError from "../utils/ApiError.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";
import ApplicationForm from "../models/applicationForm.model.js";
import Application from "../models/application.model.js";
import ClubDepartment from "../models/clubDepartment.model.js";
import User from "../models/user.model.js";
import { hasRole, mongoRoleIn } from "../utils/roles.js";

/** Chỉ tiêu phải trùng tên Ban CLB đang active. */
async function assertQuotasMatchDepartments(quotas) {
  if (!Array.isArray(quotas) || quotas.length === 0) return;
  const names = quotas
    .map((q) => String(q.department || "").trim())
    .filter(Boolean);
  const depts = await ClubDepartment.find({
    status: "active",
    name: { $in: names },
  }).select("name");
  const ok = new Set(depts.map((d) => d.name));
  const unknown = names.filter((n) => !ok.has(n));
  if (unknown.length) {
    throw ApiError.badRequest(
      `Chỉ tiêu không khớp Ban CLB: ${unknown.join(", ")}. Tạo Ban trước hoặc chọn đúng tên Ban.`,
    );
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function countRegisteredApplicants(campaignId) {
  return Application.countDocuments({
    campaignId,
    status: { $ne: "draft" },
  });
}

// Tạo đợt tuyển (draft) + seed sẵn form với 10 trường cố định (1-1 với campaign)
export async function createCampaign(data, createdBy) {
  await assertQuotasMatchDepartments(data.quotas);

  const name = String(data.name || "").trim();
  if (!name) throw ApiError.badRequest("Tên đợt đăng ký là bắt buộc");

  const dup = await RecruitmentCampaign.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  });
  if (dup) {
    throw ApiError.conflict("Tên đợt đăng ký đã tồn tại");
  }

  if (
    data.openAt &&
    data.closeAt &&
    new Date(data.openAt) >= new Date(data.closeAt)
  ) {
    throw ApiError.badRequest(
      "Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc",
    );
  }

  const campaign = await RecruitmentCampaign.create({
    ...data,
    name,
    status: "draft",
    createdBy,
  });
  await ApplicationForm.create({
    campaignId: campaign._id,
    fields: ApplicationForm.seedFixedFields(campaign.quotas),
  });
  return campaign;
}

export function listCampaigns() {
  return RecruitmentCampaign.find().sort({ createdAt: -1 });
}

export async function getCampaign(id) {
  const campaign = await RecruitmentCampaign.findById(id);
  if (!campaign) throw ApiError.notFound("Không tìm thấy đợt tuyển");
  return campaign;
}

// Public: các đợt đã publish và chưa hết hạn — trả về cả khi CHƯA tới giờ mở đơn
// (frontend hiển thị "mở đơn từ ...", còn nộp đơn thì service chặn theo openAt)
export function listActiveCampaigns() {
  return RecruitmentCampaign.find({
    status: "open",
    closeAt: { $gt: new Date() },
  }).sort({ openAt: 1 });
}

export async function updateCampaign(id, data) {
  const campaign = await getCampaign(id);

  if (data.quotas) await assertQuotasMatchDepartments(data.quotas);

  const applicants = await countRegisteredApplicants(campaign._id);
  if (applicants > 0) {
    // Đã có ứng viên: không cho sửa tên / thời gian mở-đóng
    const lockedKeys = ["name", "openAt", "closeAt"];
    const tryingLocked = lockedKeys.filter((k) => data[k] !== undefined);
    if (tryingLocked.length) {
      throw ApiError.badRequest(
        "This recruitment campaign already has registered applicants. Recruitment information cannot be modified.",
      );
    }
  }

  if (data.name) {
    const name = String(data.name).trim();
    const dup = await RecruitmentCampaign.findOne({
      _id: { $ne: campaign._id },
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });
    if (dup) throw ApiError.conflict("Tên đợt đăng ký đã tồn tại");
    data.name = name;
  }

  if ((data.openAt || campaign.openAt) && (data.closeAt || campaign.closeAt)) {
    const open = new Date(data.openAt ?? campaign.openAt);
    const close = new Date(data.closeAt ?? campaign.closeAt);
    if (open >= close) {
      throw ApiError.badRequest(
        "Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc",
      );
    }
  }

  Object.assign(campaign, data);
  await campaign.save();

  // Ban trong quotas đổi thì đồng bộ lại options của trường Ban nguyện vọng trong form
  if (data.quotas) {
    const form = await ApplicationForm.findOne({ campaignId: campaign._id });
    if (form && !form.isLocked) {
      const deptField = form.fields.find(
        (f) => f.fieldId === "department_preferences",
      );
      if (deptField) {
        deptField.options = campaign.quotas.map((q) => q.department);
        await form.save();
      }
    }
  }
  return campaign;
}

/** Kích hoạt: draft/closed → open (Inactive → Active). Chỉ Active hiện cho SV. */
export async function publishCampaign(id, { notify = true } = {}) {
  const campaign = await getCampaign(id);
  if (campaign.status === "completed") {
    throw ApiError.badRequest("Không thể kích hoạt đợt đã hoàn tất");
  }
  if (campaign.status === "open") return campaign;

  // Không cho 2 đợt "open" trùng thời gian cho cùng một ban (nghiệp vụ 0.1)
  const departments = campaign.quotas.map((q) => q.department);
  const overlap = await RecruitmentCampaign.checkOverlap(
    departments,
    campaign.openAt,
    campaign.closeAt,
    campaign._id,
  );
  if (overlap) {
    throw ApiError.badRequest(
      "Đã tồn tại đợt tuyển đang mở trùng thời gian cho cùng ban",
    );
  }

  campaign.status = "open";
  await campaign.save();

  const form = await ApplicationForm.findOne({ campaignId: campaign._id });
  if (form && !form.publishedAt) {
    form.publishedAt = new Date();
    await form.save();
  }

  if (notify) {
    await notifyCampaignPublished(campaign);
  }
  return campaign;
}

/** In-app cho BCN + Leader khi đợt tuyển được mở */
async function notifyCampaignPublished(campaign) {
  try {
    const notificationService = await import("./notification.service.js");
    const users = await User.find({
      ...mongoRoleIn(["bcn", "leader"]),
      isActive: { $ne: false },
      status: { $ne: "disabled" },
    }).select("_id role roles");

    for (const u of users) {
      const link = hasRole(u, "bcn")
        ? "/admin/recruitment/open"
        : "/leader/recruitment/interviews";
      await notificationService.createNotification({
        userId: u._id,
        title: "Đợt tuyển đã mở",
        body: `"${campaign.name}" đã được xuất bản / kích hoạt.`,
        type: "general",
        link,
      });
    }
  } catch (err) {
    console.warn("[campaign] publish notify failed:", err.message);
  }
}

/** Tắt kích hoạt: ngừng nhận đăng ký, giữ dữ liệu (open → closed). */
export async function closeCampaign(id) {
  const campaign = await getCampaign(id);
  if (campaign.status === "completed") {
    throw ApiError.badRequest("Đợt đã hoàn tất");
  }
  if (campaign.status !== "open") {
    return campaign;
  }
  campaign.status = "closed";
  await campaign.save();
  return campaign;
}

/** Đóng vòng đời đợt: Closed → Completed (sau khi đã chốt kết quả cuối) */
export async function completeCampaign(id) {
  const campaign = await getCampaign(id);
  if (campaign.status !== "closed") {
    throw ApiError.badRequest(
      "Chỉ đợt tuyển đã đóng mới được đánh dấu hoàn tất",
    );
  }
  campaign.status = "completed";
  await campaign.save();
  return campaign;
}

export async function deleteCampaign(id) {
  const campaign = await getCampaign(id);
  const submitted = await countRegisteredApplicants(campaign._id);
  if (submitted > 0) {
    throw ApiError.badRequest(
      "This recruitment campaign has registered applicants and cannot be deleted.",
    );
  }
  await Application.deleteMany({ campaignId: campaign._id });
  await ApplicationForm.deleteOne({ campaignId: campaign._id });
  await RecruitmentCampaign.deleteOne({ _id: campaign._id });
}

// ---- Form builder ----

export async function getForm(campaignId) {
  const campaign = await getCampaign(campaignId);
  let form = await ApplicationForm.findOne({ campaignId });
  // Đợt tạo tay / seed thiếu form → tự seed 10 trường cố định để public không 404
  if (!form) {
    form = await ApplicationForm.create({
      campaignId: campaign._id,
      fields: ApplicationForm.seedFixedFields(campaign.quotas),
      publishedAt: campaign.status === "open" ? new Date() : null,
    });
  }
  return form;
}

export async function updateForm(campaignId, fields) {
  const form = await getForm(campaignId);
  if (form.isLocked) {
    throw ApiError.badRequest(
      "Form đã bị khoá do có hồ sơ nộp — không được sửa cấu trúc",
    );
  }

  // Không cho xoá/đổi loại các trường cố định hệ thống
  const fixedIds = form.fields.filter((f) => f.isFixed).map((f) => f.fieldId);
  const nextIds = fields.map((f) => f.fieldId);
  const missing = fixedIds.filter((fid) => !nextIds.includes(fid));
  if (missing.length) {
    throw ApiError.badRequest(
      `Không được xoá trường cố định: ${missing.join(", ")}`,
    );
  }

  form.fields = fields;
  await form.save();
  return form;
}
