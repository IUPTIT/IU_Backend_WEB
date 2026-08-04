import ApiError from "../utils/ApiError.js";
import Campaign from "../models/campaign.model.js";
import Application from "../models/application.model.js";

export async function createCampaign(data, createdBy) {
  if (new Date(data.openAt) >= new Date(data.closeAt)) {
    throw ApiError.badRequest("closeAt must be after openAt");
  }
  return Campaign.create({ ...data, status: "draft", createdBy });
}

export function listCampaigns() {
  return Campaign.find().sort({ createdAt: -1 });
}

export async function getCampaign(id) {
  const campaign = await Campaign.findById(id);
  if (!campaign) throw ApiError.notFound("Campaign not found");
  return campaign;
}

// Đợt tuyển đang mở cho form công khai (openAt <= now, chưa hết hạn)
export function getActiveCampaign() {
  const now = new Date();
  return Campaign.findOne({
    status: "open",
    openAt: { $lte: now },
    closeAt: { $gt: now },
  }).sort({ openAt: -1 });
}

export async function updateCampaign(id, data) {
  const campaign = await getCampaign(id);

  if (campaign.status !== "draft") {
    // Sau publish chỉ được sửa thời gian đóng đơn và chỉ tiêu (nghiệp vụ 0.3)
    const allowed = ["closeAt", "quotas", "description"];
    const illegal = Object.keys(data).filter((k) => !allowed.includes(k));
    if (illegal.length) {
      throw ApiError.badRequest(
        `Published campaign only allows editing: ${allowed.join(", ")}`,
      );
    }
  }

  // Không sửa/xoá câu hỏi nếu đã có hồ sơ nộp (nghiệp vụ 0.3)
  if (data.customQuestions) {
    const submitted = await Application.countDocuments({ campaign: id });
    if (submitted > 0) {
      throw ApiError.badRequest(
        "Cannot edit form questions after applications have been submitted",
      );
    }
  }

  Object.assign(campaign, data);
  if (campaign.openAt >= campaign.closeAt) {
    throw ApiError.badRequest("closeAt must be after openAt");
  }
  await campaign.save();
  return campaign;
}

export async function publishCampaign(id) {
  const campaign = await getCampaign(id);
  if (campaign.status !== "draft") {
    throw ApiError.badRequest("Only draft campaigns can be published");
  }

  // Không cho 2 đợt "Đang mở" trùng thời gian cho cùng một ban (nghiệp vụ 0.1)
  const teams = campaign.quotas.map((q) => q.team);
  const overlapping = await Campaign.findOne({
    _id: { $ne: campaign.id },
    status: "open",
    "quotas.team": { $in: teams },
    openAt: { $lt: campaign.closeAt },
    closeAt: { $gt: campaign.openAt },
  });
  if (overlapping) {
    throw ApiError.conflict(
      `Another open campaign overlaps for the same team(s): ${overlapping.name}`,
    );
  }

  campaign.status = "open";
  await campaign.save();
  return campaign;
}

export async function closeCampaign(id) {
  const campaign = await getCampaign(id);
  if (campaign.status !== "open") {
    throw ApiError.badRequest("Only open campaigns can be closed");
  }
  campaign.status = "closed";
  await campaign.save();
  return campaign;
}
