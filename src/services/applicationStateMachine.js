/**
 * =====================================================================================
 * ⚠️ LƯU Ý BẮT BUỘC DÀNH CHO DEVELOPER:
 * ĐÂY LÀ ĐIỂM DUY NHẤT TRONG TOÀN BỘ CODEBASE ĐƯỢC PHÉP THAY ĐỔI FIELD status CỦA APPLICATION.
 * Tuyệt đối không update trực tiếp status bằng findByIdAndUpdate hay save() ở bất kỳ
 * controller/service nào khác.
 * =====================================================================================
 */

import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import {
  agenda,
  JOB_CREATE_CANDIDATE_ACCOUNT,
  JOB_DISABLE_ACCOUNT,
  JOB_PROMOTE_TO_MEMBER,
} from "../jobs/index.js";

export const APPLICATION_STATUS = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  PASSED_CV: "passed_cv",
  FAILED_CV: "failed_cv",
  PASSED_INTERVIEW: "passed_interview",
  FAILED_INTERVIEW: "failed_interview",
  ADMITTED: "admitted",
  REJECTED: "rejected",
};

/**
 * Bảng quy định luồng chuyển đổi trạng thái (Transition Map).
 * Mỗi trạng thái chỉ được chuyển sang các trạng thái con được khai báo trong mảng.
 */
export const TRANSITION_MAP = {
  [APPLICATION_STATUS.DRAFT]: [APPLICATION_STATUS.PENDING_REVIEW],
  [APPLICATION_STATUS.PENDING_REVIEW]: [
    APPLICATION_STATUS.PASSED_CV,
    APPLICATION_STATUS.FAILED_CV,
  ],
  [APPLICATION_STATUS.PASSED_CV]: [
    APPLICATION_STATUS.PASSED_INTERVIEW,
    APPLICATION_STATUS.FAILED_INTERVIEW,
  ],
  [APPLICATION_STATUS.PASSED_INTERVIEW]: [
    APPLICATION_STATUS.ADMITTED,
    APPLICATION_STATUS.REJECTED,
  ],
  // Các trạng thái kết thúc (Terminal states) - Không thể chuyển đi tiếp
  [APPLICATION_STATUS.FAILED_CV]: [],
  [APPLICATION_STATUS.FAILED_INTERVIEW]: [],
  [APPLICATION_STATUS.ADMITTED]: [],
  [APPLICATION_STATUS.REJECTED]: [],
};

/**
 * Kiểm tra tính hợp lệ của bước chuyển trạng thái.
 * @param {string} currentStatus Trạng thái hiện tại
 * @param {string} nextStatus Trạng thái đích muốn chuyển sang
 * @returns {boolean} true nếu hợp lệ, false nếu bất hợp lệ
 */
export function canTransition(currentStatus, nextStatus) {
  const allowedNextStatuses = TRANSITION_MAP[currentStatus];
  if (!allowedNextStatuses) return false;
  return allowedNextStatuses.includes(nextStatus);
}

/**
 * Thực hiện chuyển trạng thái hồ sơ ứng tuyển.
 * @param {string|ObjectId} applicationId ID hồ sơ ứng tuyển
 * @param {string} nextStatus Trạng thái mới
 * @param {Object} [options]
 * @param {mongoose.ClientSession} [options.session] External mongoose session
 * @param {Object} [options.meta] Thông tin bổ sung (người thực hiện, lý do, ...)
 */
export async function transition(applicationId, nextStatus, { session } = {}) {
  const Application = mongoose.model("Application");

  const query = Application.findById(applicationId);
  if (session) query.session(session);

  const application = await query;
  if (!application) {
    throw ApiError.notFound("Không tìm thấy hồ sơ ứng tuyển");
  }

  // 1. Validate bước chuyển trạng thái
  if (!canTransition(application.status, nextStatus)) {
    throw ApiError.badRequest(
      `Không thể chuyển trạng thái hồ sơ từ "${application.status}" sang "${nextStatus}"`,
    );
  }

  // 2. Cập nhật trạng thái mới
  const previousStatus = application.status;
  application.status = nextStatus;
  await application.save({ session });

  // 3. Emit side-effect bằng cách enqueue Agenda job (Background Processing)
  await handleSideEffects(application, previousStatus, nextStatus);

  return application;
}

/**
 * Xử lý enqueue các background job side-effect dựa trên trạng thái mới.
 * Không gửi email trực tiếp tại đây, chỉ enqueue job.
 */
async function handleSideEffects(application, _previousStatus, nextStatus) {
  const applicationId = application._id;

  // Case 1: Pass vòng đơn -> Enqueue job tạo tài khoản candidate & gửi email thông báo
  if (nextStatus === APPLICATION_STATUS.PASSED_CV) {
    await agenda.now(JOB_CREATE_CANDIDATE_ACCOUNT, { applicationId });
  }

  // Case 2: Rớt (CV / Phỏng vấn / Rejected) -> Khoá tài khoản (nếu có) + email báo loại.
  // KHÔNG điều kiện theo userId: rớt vòng đơn chưa có tài khoản vẫn phải nhận email —
  // job tự bỏ qua bước khoá khi application chưa gắn user.
  if (
    [
      APPLICATION_STATUS.FAILED_CV,
      APPLICATION_STATUS.FAILED_INTERVIEW,
      APPLICATION_STATUS.REJECTED,
    ].includes(nextStatus)
  ) {
    await agenda.now(JOB_DISABLE_ACCOUNT, { applicationId });
    if (application.userId) {
      const notificationService = await import("./notification.service.js");
      const title =
        nextStatus === APPLICATION_STATUS.FAILED_INTERVIEW
          ? "Không đạt vòng phỏng vấn"
          : nextStatus === APPLICATION_STATUS.REJECTED
            ? "Không trúng tuyển"
            : "Không đạt vòng đơn";
      await notificationService.createNotification({
        userId: application.userId,
        title,
        body: "Cảm ơn bạn đã ứng tuyển IU Club. Kết quả chi tiết đã được gửi qua email.",
        type:
          nextStatus === APPLICATION_STATUS.FAILED_CV
            ? "cv_result"
            : nextStatus === APPLICATION_STATUS.FAILED_INTERVIEW
              ? "interview_result"
              : "final_result",
        link: "/candidate/profile",
      });
    }
  }

  // Case 3: Đạt vòng phỏng vấn -> chờ BCN tổng hợp kết quả cuối (email + in-app)
  if (nextStatus === APPLICATION_STATUS.PASSED_INTERVIEW) {
    const [emailService, notificationService] = await Promise.all([
      import("./email.service.js"),
      import("./notification.service.js"),
    ]);
    await emailService.sendInterviewPassedEmail(application);
    if (application.userId) {
      await notificationService.createNotification({
        userId: application.userId,
        title: "Đạt vòng phỏng vấn",
        body: "Bạn đã vượt qua vòng phỏng vấn. Ban Chủ nhiệm đang tổng hợp kết quả cuối.",
        type: "interview_result",
        link: "/candidate/profile",
      });
    }
  }

  // Case 4: Trúng tuyển -> tạo hồ sơ tân binh (giữ role candidate đến khi xong training)
  if (nextStatus === APPLICATION_STATUS.ADMITTED) {
    await agenda.now(JOB_PROMOTE_TO_MEMBER, { applicationId });
  }
}
