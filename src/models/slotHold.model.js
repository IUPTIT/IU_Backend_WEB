/**
 * =====================================================================================
 * ⚠️ LƯU Ý KỸ THUẬT DÀNH CHO DEVELOPER:
 * TTL index của MongoDB dọn dẹp các document hết hạn theo chu kỳ nền (~60s một lần),
 * KHÔNG diễn ra tức thời tại chính xác milisecond hết hạn.
 *
 * Để giữ chỗ chính xác tuyệt đối theo thời gian thực (real-time), service sẽ kết hợp
 * điều kiện filter query `{ expiresAt: { $gt: new Date() } }` trong các transaction.
 * Nếu về sau lưu lượng truy cập tăng đột biến (hàng nghìn req/s), có thể thay thế bước
 * này bằng Redis SETNX+EX ở tầng service thay vì hoàn toàn phụ thuộc vào TTL index.
 * Model này được khởi tạo để phục vụ giữ chỗ chạy trực tiếp với MongoDB thuần.
 * =====================================================================================
 */

import mongoose from "mongoose";

// Thời gian giữ chỗ mặc định 150 giây (2.5 phút)
const HOLD_TTL_SECONDS = 150;

const slotHoldSchema = new mongoose.Schema(
  {
    // ID ca phỏng vấn đang được giữ chỗ
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InterviewSlot",
      required: true,
    },

    // ID hồ sơ ứng viên thực hiện giữ chỗ
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },

    // Thời điểm bản ghi giữ chỗ hết hạn (Mặc định 150 giây kể từ lúc tạo)
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + HOLD_TTL_SECONDS * 1000),
    },
  },
  {
    timestamps: true,
    collection: "slot_holds",
  },
);

// TTL Index: Tự động xóa document khi thời gian hiện tại đạt đến expiresAt
slotHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Unique Index: Đảm bảo 1 ứng viên chỉ giữ 1 bản ghi hold cho 1 slot tại một thời điểm
slotHoldSchema.index({ slotId: 1, applicationId: 1 }, { unique: true });

const SlotHold = mongoose.model("SlotHold", slotHoldSchema);

export default SlotHold;
