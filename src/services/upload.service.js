import { v2 as cloudinary } from "cloudinary";
import ApiError from "../utils/ApiError.js";
import config from "../config/env.js";

let configured = false;

function ensureConfigured() {
  if (!config.cloudinary.enabled) {
    throw ApiError.badRequest("File upload is not configured on this server");
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
    });
    configured = true;
  }
}

// Giới hạn theo nghiệp vụ 1.1
export const UPLOAD_RULES = {
  avatar: {
    mimes: ["image/jpeg", "image/png"],
    maxBytes: 2 * 1024 * 1024,
    folder: "iuc-images/applications/avatars",
    resourceType: "image",
  },
  cv: {
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    maxBytes: 5 * 1024 * 1024,
    folder: "iuc-images/applications/cv",
    resourceType: "raw", // giữ nguyên file pdf/docx
  },
};

export function validateUpload(kind, file) {
  const rule = UPLOAD_RULES[kind];
  if (!rule) throw ApiError.badRequest("kind must be avatar or cv");
  if (!file) throw ApiError.badRequest("Missing file");
  if (!rule.mimes.includes(file.mimetype)) {
    throw ApiError.badRequest(
      kind === "avatar" ? "Avatar must be JPG/PNG" : "CV must be PDF/DOC/DOCX",
    );
  }
  if (file.size > rule.maxBytes) {
    throw ApiError.badRequest(
      `File exceeds ${Math.round(rule.maxBytes / 1024 / 1024)}MB limit`,
    );
  }
  return rule;
}

export function uploadBuffer(kind, file) {
  ensureConfigured();
  const rule = validateUpload(kind, file);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: rule.folder,
        resource_type: rule.resourceType,
        // Giữ tên gốc (đã slug hoá) cho dễ nhận diện CV khi BCN tải về
        use_filename: true,
        unique_filename: true,
      },
      (err, result) => {
        if (err) return reject(ApiError.badRequest(`Upload failed: ${err.message}`));
        return resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(file.buffer);
  });
}
