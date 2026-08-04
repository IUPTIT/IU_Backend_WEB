import ApiError from "../utils/ApiError.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";
import ApplicationForm from "../models/applicationForm.model.js";
import Application from "../models/application.model.js";

// Tạo đợt tuyển (draft) + seed sẵn form với 10 trường cố định (1-1 với campaign)
export async function createCampaign(data, createdBy) {
  const campaign = await RecruitmentCampaign.create({
    ...data,
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

  if (campaign.status !== "draft") {
    // Sau publish chỉ được gia hạn/rút ngắn closeAt hoặc điều chỉnh quotas (spec 2.3)
    const allowed = ["closeAt", "quotas", "description"];
    const illegal = Object.keys(data).filter((k) => !allowed.includes(k));
    if (illegal.length) {
      throw ApiError.badRequest(
        `Đợt tuyển đã publish chỉ cho phép sửa: ${allowed.join(", ")}`,
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

export async function publishCampaign(id) {
  const campaign = await getCampaign(id);
  if (campaign.status !== "draft") {
    throw ApiError.badRequest("Chỉ đợt tuyển ở trạng thái draft mới được publish");
  }

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
  return campaign;
}

export async function closeCampaign(id) {
  const campaign = await getCampaign(id);
  if (campaign.status !== "open") {
    throw ApiError.badRequest("Chỉ đợt tuyển đang mở mới được đóng");
  }
  campaign.status = "closed";
  await campaign.save();
  return campaign;
}

export async function deleteCampaign(id) {
  const campaign = await getCampaign(id);
  const submitted = await Application.countDocuments({
    campaignId: campaign._id,
    status: { $ne: "draft" },
  });
  if (submitted > 0) {
    throw ApiError.badRequest("Không thể xoá đợt tuyển đã có hồ sơ nộp");
  }
  await Application.deleteMany({ campaignId: campaign._id });
  await ApplicationForm.deleteOne({ campaignId: campaign._id });
  await RecruitmentCampaign.deleteOne({ _id: campaign._id });
}

// ---- Form builder ----

export async function getForm(campaignId) {
  await getCampaign(campaignId);
  const form = await ApplicationForm.findOne({ campaignId });
  if (!form) throw ApiError.notFound("Không tìm thấy form của đợt tuyển");
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
