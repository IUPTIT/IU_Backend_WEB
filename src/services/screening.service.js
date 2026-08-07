import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import ApplicationScore from "../models/applicationScore.model.js";
import { transition } from "./applicationStateMachine.js";

// Ngưỡng chênh lệch điểm giữa 2 reviewer → bật cờ xem xét thủ công (nghiệp vụ 2.2)
const MANUAL_REVIEW_DIFF_PERCENT = 30;

const ROUND_ALLOWED_STATUS = {
  cv: ["pending_review"],
  // Cho phép BCN/interviewer cập nhật điểm cả sau khi đã chốt Đạt/Trượt
  interview: ["passed_cv", "passed_interview", "failed_interview"],
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

  // Vòng đơn: nếu đã phân công reviewer thì chỉ người được gán (hoặc BCN) mới được chấm
  if (round === "cv" && application.reviewerIds?.length) {
    const allowed = application.reviewerIds.map(String);
    if (!allowed.includes(String(scoredBy))) {
      const User = (await import("../models/user.model.js")).default;
      const scorer = await User.findById(scoredBy).select("role");
      if (scorer?.role !== "bcn") {
        throw ApiError.forbidden(
          "Bạn không được phân công chấm hồ sơ này — liên hệ BCN để được gán",
        );
      }
    }
  }

  let score = await ApplicationScore.findOne({
    applicationId,
    round,
    scoredBy,
  });
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
  const summary = await ApplicationScore.getAverageAndVariance(
    applicationId,
    round,
  );
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

/** Phân công 1–n người chấm vòng đơn */
export async function assignReviewers(applicationId, reviewerIds) {
  const application = await getApplication(applicationId);
  if (application.status !== "pending_review") {
    throw ApiError.badRequest(
      "Chỉ phân công người chấm khi hồ sơ còn ở trạng thái Chờ xét duyệt",
    );
  }
  const ids = [...new Set((reviewerIds ?? []).map(String))];
  if (!ids.length) {
    throw ApiError.badRequest("Cần chọn ít nhất 1 người chấm");
  }
  application.reviewerIds = ids;
  await application.save();
  return application.populate("reviewerIds", "name email role");
}

// Quyết định Pass/Fail vòng đơn — side-effect (tạo tài khoản candidate...) chạy qua state machine
export async function decideCv(applicationId, status) {
  if (!["passed_cv", "failed_cv"].includes(status)) {
    throw ApiError.badRequest("status phải là passed_cv hoặc failed_cv");
  }
  return transition(applicationId, status);
}

/**
 * Duyệt hàng loạt vòng đơn theo ngưỡng điểm trung bình (thang 0–100).
 * Chỉ áp dụng hồ sơ pending_review đã có ≥1 điểm CV.
 * Điểm ≥ threshold → passed_cv; còn lại → failed_cv (nếu failBelow=true).
 */
export async function bulkDecideCvByThreshold({
  campaignId,
  threshold,
  failBelow = true,
}) {
  if (threshold == null || Number.isNaN(Number(threshold))) {
    throw ApiError.badRequest("threshold là bắt buộc");
  }
  const minScore = Number(threshold);
  const apps = await Application.find({
    campaignId,
    status: "pending_review",
  }).select("_id");
  const ids = apps.map((a) => a._id);
  if (!ids.length) return { passed: 0, failed: 0, skipped: 0 };

  const averages = await ApplicationScore.aggregate([
    { $match: { applicationId: { $in: ids }, round: "cv" } },
    {
      $group: {
        _id: "$applicationId",
        avg: { $avg: "$totalScore" },
      },
    },
  ]);
  const avgMap = new Map(averages.map((r) => [String(r._id), r.avg]));

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const app of apps) {
    const avg = avgMap.get(String(app._id));
    if (avg == null) {
      skipped += 1;
      continue;
    }
    try {
      if (avg >= minScore) {
        await transition(app._id, "passed_cv");
        passed += 1;
      } else if (failBelow) {
        await transition(app._id, "failed_cv");
        failed += 1;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { passed, failed, skipped };
}

/** BCN đổi ban chính thức sang NV2/NV3 trước khi xác nhận trúng tuyển */
export async function assignOfficialDepartment(applicationId, department) {
  const application = await getApplication(applicationId);
  if (application.status !== "passed_interview") {
    throw ApiError.badRequest(
      "Chỉ đổi ban khi hồ sơ đang ở trạng thái Đạt phỏng vấn (chờ kết quả cuối)",
    );
  }
  const prefs = application.departmentPreferences ?? [];
  const allowed = prefs.map((p) => p.department);
  if (!allowed.includes(department)) {
    throw ApiError.badRequest(
      `Ban "${department}" không nằm trong nguyện vọng của ứng viên`,
    );
  }
  application.assignedDepartment = department;
  await application.save();
  return application;
}

export async function decideInterview(applicationId, status) {
  if (!["passed_interview", "failed_interview"].includes(status)) {
    throw ApiError.badRequest(
      "status phải là passed_interview hoặc failed_interview",
    );
  }
  return transition(applicationId, status);
}

// Kết quả cuối — admitted enqueue promote-to-member, rejected enqueue disable-account
export async function confirmFinal(applicationId, status) {
  if (!["admitted", "rejected"].includes(status)) {
    throw ApiError.badRequest("status phải là admitted hoặc rejected");
  }
  if (status === "admitted") {
    const app = await getApplication(applicationId);
    if (!app.assignedDepartment) {
      const nv1 = [...(app.departmentPreferences ?? [])].sort(
        (a, b) => a.priority - b.priority,
      )[0]?.department;
      if (nv1) {
        app.assignedDepartment = nv1;
        await app.save();
      }
    }
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

/** Đánh dấu đã gửi email kết quả vòng phỏng vấn */
export async function markInterviewResultNotified(applicationIds) {
  const result = await Application.updateMany(
    { _id: { $in: applicationIds } },
    { $set: { interviewResultNotifiedAt: new Date() } },
  );
  return { notified: result.modifiedCount };
}

// Danh sách tân thành viên bàn giao cho Đào tạo (nghiệp vụ 4.2)
export function listNewMembers(campaignId) {
  return Application.find({ campaignId, status: "admitted" })
    .sort({ fullName: 1 })
    .populate("userId", "name email role isActive");
}
