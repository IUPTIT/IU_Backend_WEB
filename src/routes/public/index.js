// Route trong thư mục này TUYỆT ĐỐI không được import/dùng middleware authenticate.js — đây là API cho Guest chưa đăng nhập.

import { Router } from "express";
import multer from "multer";
import * as controller from "../../controllers/public.controller.js";
import * as applicationValidation from "../../validations/application.validation.js";
import * as publicValidation from "../../validations/publicApplication.validation.js";
import {
  idParam,
  tokenParam,
  codeParam,
} from "../../validations/common.validation.js";
import {
  publicReadLimiter,
  publicWriteLimiter,
} from "../../middlewares/rateLimiter.js";

const router = Router();

// Upload file vào RAM rồi đẩy thẳng Cloudinary — giới hạn cứng 5MB tại multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ---- Đợt tuyển & form (nghiệp vụ 1.1) ----
router.get(
  "/campaigns/active",
  publicReadLimiter,
  controller.listActiveCampaigns,
);
router.get(
  "/campaigns/:id/form",
  publicReadLimiter,
  idParam,
  controller.getForm,
);

// ---- Upload avatar/CV trước khi nộp ----
router.post(
  "/uploads",
  publicWriteLimiter,
  upload.single("file"),
  controller.uploadFile,
);

// ---- Đơn nháp (nghiệp vụ 1.2) ----
router.post(
  "/applications/draft",
  publicWriteLimiter,
  applicationValidation.saveDraft,
  controller.saveDraft,
);
router.get(
  "/applications/draft/:token",
  publicReadLimiter,
  tokenParam,
  controller.getDraft,
);
router.put(
  "/applications/draft/:token",
  publicWriteLimiter,
  tokenParam,
  publicValidation.updateDraftBody,
  controller.updateDraft,
);

// ---- Nộp đơn chính thức (nghiệp vụ 1.1) ----
router.post(
  "/applications/submit",
  publicWriteLimiter,
  applicationValidation.submitApplication,
  controller.submitApplication,
);
router.post(
  "/applications/:token/submit",
  publicWriteLimiter,
  tokenParam,
  applicationValidation.submitApplication,
  controller.submitApplication,
);

// ---- Tra cứu / sửa / rút đơn (nghiệp vụ 1.5) ----
router.get(
  "/applications/lookup",
  publicReadLimiter,
  publicValidation.lookup,
  controller.lookupApplication,
);
router.put(
  "/applications/:code/edit",
  publicWriteLimiter,
  codeParam,
  publicValidation.editWithEmail,
  controller.editApplication,
);
router.delete(
  "/applications/:code",
  publicWriteLimiter,
  codeParam,
  publicValidation.withdraw,
  controller.withdrawApplication,
);

export default router;
