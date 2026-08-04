import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import ApplicationScore from "../models/applicationScore.model.js";
import { transition } from "./applicationStateMachine.js";

// Ngưỡng chênh lệch điểm giữa 2 reviewer → bật cờ xem xét thủ công (nghiệp vụ 2.2)
const MANUAL_REVIEW_DIFF_PERCENT = 30;

const ROUND_ALLOWED_STATUS = {
  cv: ["pending_review"],
  interview: ["passed_cv"],
};

async function getApplication(id) {
  const application = await Application.findById(id);
  if (!application) throw ApiError.notFound("Không tìm thấy hồ sơ ứng tuyển");
  return application;
}

// Chấm điểm 1 vòng — mỗi reviewer 1 bản ghi (chấm lại thì ghi đè)
export async function scoreApplication({
  applicationId,
  round,
  scoredBy,
  criteriaScores,
  comment = "",
  attendance = null,
}) {
  const application = await getApplication(applicationId);
  if (!ROUND_ALLOWED_STATUS[round].includes(application.status)) {
    throw ApiError.badRequest(
      `Hồ sơ ở trạng thái "${application.status}" không chấm được vòng "${round}"`,
    );
  }

  let score = await ApplicationScore.findOne({ applicationId, round, scoredBy });
  if (score) {
    score.criteriaScores = criteriaScores;
    score.comment = comment;
    score.attendance = round === "interview" ? attendance : null;
    await score.save();
  } else {
    score = await ApplicationScore.create({
      applicationId,
      round,
      scoredBy,
      criteriaScores,
      comment,
      attendance: round === "interview" ? attendance : null,
    });
  }

  // Chênh lệch điểm 2 reviewer > ngưỡng → cần BCN xem xét thủ công
  const summary = await ApplicationScore.getAverageAndVariance(applicationId, round);
  if (
    round === "cv" &&
    summary.count >= 2 &&
    summary.maxDiffPercent > MANUAL_REVIEW_DIFF_PERCENT
  ) {
    await Application.updateOne(
      { _id: applicationId },
      { $set: { needsManualReview: true } },
    );
  }

  return { score, summary };
}

export async function getScoreSummary(applicationId, round) {
  await getApplication(applicationId);
  return ApplicationScore.getAverageAndVariance(applicationId, round);
}

// Quyết định Pass/Fail vòng đơn — side-effect (tạo tài khoản candidate...) chạy qua state machine
export async function decideCv(applicationId, status) {
  if (!["passed_cv", "failed_cv"].includes(status)) {
    throw ApiError.badRequest("status phải là passed_cv hoặc failed_cv");
  }
  return transition(applicationId, status);
}

export async function decideInterview(applicationId, status) {
  if (!["passed_interview", "failed_interview"].includes(status)) {
    throw ApiError.badRequest("status phải là passed_interview hoặc failed_interview");
  }
  return transition(applicationId, status);
}

// Kết quả cuối — admitted enqueue promote-to-member, rejected enqueue disable-account
export async function confirmFinal(applicationId, status) {
  if (!["admitted", "rejected"].includes(status)) {
    throw ApiError.badRequest("status phải là admitted hoặc rejected");
  }
  const application = await transition(applicationId, status);
  if (status === "admitted") {
    await Application.updateOne(
      { _id: applicationId },
      { $set: { resultNotifyStatus: "converted" } },
    );
  }
  return application;
}

// Đánh dấu đã gửi email kết quả (gọi sau khi FE gửi mail qua module email)
export async function markResultNotified(applicationIds) {
  const result = await Application.updateMany(
    { _id: { $in: applicationIds }, resultNotifyStatus: { $ne: "converted" } },
    { $set: { resultNotifyStatus: "email_sent" } },
  );
  return { notified: result.modifiedCount };
}

// Danh sách tân thành viên bàn giao cho Đào tạo (nghiệp vụ 4.2)
export function listNewMembers(campaignId) {
  return Application.find({ campaignId, status: "admitted" })
    .sort({ fullName: 1 })
    .populate("userId", "name email role isActive");
}
