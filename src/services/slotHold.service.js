import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
// Import để đăng ký schema với mongoose — service tra model qua mongoose.model("...")
import "../models/slotHold.model.js";
import "../models/interviewSlot.model.js";
import "../models/interviewBooking.model.js";

// Đặt thời gian giữ chỗ tạm thời (2.5 phút = 150 giây)
const HOLD_DURATION_MS = 150 * 1000;

/**
 * 1. GIỮ CHỖ TẠM THỜI (Hold Slot)
 * Ứng viên chọn ca phỏng vấn -> Giữ chỗ trong 150s để chuẩn bị xác nhận.
 *
 * TẠI SAO BẮT BUỘC DÙNG TRANSACTION?
 * Vì bước đọc (kiểm tra bookedCount + activeHolds < capacity) và bước ghi (insert SlotHold)
 * phải thực thi Atomic (nguyên tử). Nếu chỉ dùng query riêng lẻ, 2 request đến cùng milisecond
 * sẽ cùng đọc thấy "còn 1 chỗ" và cùng insert hold thành công -> Dẫn tới Overbooking (vượt capacity).
 */
export async function holdSlot(slotId, applicationId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const InterviewSlot = mongoose.model("InterviewSlot");
    const SlotHold = mongoose.model("SlotHold");

    // Lấy thông tin slot trong transaction
    const slot = await InterviewSlot.findById(slotId).session(session);
    if (!slot) {
      throw ApiError.notFound("Ca phỏng vấn không tồn tại");
    }

    // Kiểm tra xem ứng viên này đã đang giữ chỗ ở bất kỳ slot nào chưa
    const existingHold = await SlotHold.findOne({
      applicationId,
      expiresAt: { $gt: new Date() },
    }).session(session);

    if (existingHold) {
      throw ApiError.badRequest(
        "Bạn đang giữ chỗ cho một ca phỏng vấn khác. Vui lòng xác nhận hoặc chờ hết hạn.",
      );
    }

    // Đếm số lượng hold đang còn hiệu lực cho slot này
    const activeHoldsCount = await SlotHold.countDocuments({
      slotId,
      expiresAt: { $gt: new Date() },
    }).session(session);

    // Bắt buộc: tổng (đã đặt + đang giữ) phải nhỏ hơn sức chứa tối đa
    if (slot.bookedCount + activeHoldsCount >= slot.capacity) {
      throw ApiError.badRequest("Ca phỏng vấn này đã hết chỗ trống");
    }

    // Tạo bản ghi hold mới
    const expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
    const [hold] = await SlotHold.create(
      [
        {
          slotId,
          applicationId,
          expiresAt,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    return hold;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * 2. XÁC NHẬN ĐẶT LỊCH CHÍNH THỨC (Confirm Booking)
 * Chuyển trạng thái từ Hold -> Booking chính thức trong thời hạn 150s.
 */
export async function confirmBooking(slotId, applicationId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const InterviewSlot = mongoose.model("InterviewSlot");
    const SlotHold = mongoose.model("SlotHold");
    const InterviewBooking = mongoose.model("InterviewBooking");

    // Kiểm tra bản ghi Hold còn hiệu lực và đúng chủ
    const hold = await SlotHold.findOne({
      slotId,
      applicationId,
      expiresAt: { $gt: new Date() },
    }).session(session);

    if (!hold) {
      throw ApiError.badRequest(
        "Thời gian giữ chỗ đã hết hạn hoặc không tìm thấy thông tin giữ chỗ.",
      );
    }

    // Lấy thông tin slot để kiểm tra version
    const slot = await InterviewSlot.findById(slotId).session(session);
    if (!slot) {
      throw ApiError.notFound("Ca phỏng vấn không tồn tại");
    }

    // Optimistic Locking: Tăng bookedCount và version một cách an toàn
    const updatedSlot = await InterviewSlot.findOneAndUpdate(
      {
        _id: slotId,
        version: slot.version || 0,
        bookedCount: { $lt: slot.capacity }, // Đảm bảo an toàn không quá capacity
      },
      {
        $inc: { bookedCount: 1, version: 1 },
      },
      { new: true, session },
    );

    if (!updatedSlot) {
      throw ApiError.conflict(
        "Dữ liệu ca phỏng vấn đã thay đổi hoặc đã đầy. Vui lòng thử lại.",
      );
    }

    // Tạo bản ghi đặt lịch chính thức
    const [booking] = await InterviewBooking.create(
      [
        {
          applicationId,
          slotId,
          status: "booked",
          changeCount: 0,
          bookedAt: new Date(),
        },
      ],
      { session },
    );

    // Xoá bản ghi hold sau khi đã confirm thành công
    await SlotHold.deleteOne({ _id: hold._id }).session(session);

    await session.commitTransaction();
    return booking;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/*
 ====================================================================================
 📌 HƯỚNG DẪN MỞ RỘNG VỚI REDIS (KHI TRAFFIC TĂNG LÊN HÀNG NGHÌN REQ/GIÂY TRONG TƯƠNG LAI)
 ====================================================================================
 Nếu sau này quy mô đăng ký phỏng vấn bùng nổ (nhiều nghìn ứng viên bấm đặt lịch cùng giây),
 bạn chỉ cần thay thế phần xử lý giữ chỗ trong hàm `holdSlot` bằng Redis SETNX mà KHÔNG cần
 đập đi xây lại luồng nghiệp vụ phía trên.

 Cụ thể vị trí thay thế trong hàm `holdSlot`:

 1. Thay vì query MongoDB để đếm activeHoldsCount:
    const lockKey = `slot_hold:${slotId}:${applicationId}`;
    const acquired = await redis.set(lockKey, 'held', 'NX', 'EX', 150); // 150 giây
    if (!acquired) {
      throw ApiError.badRequest("Bạn đang giữ chỗ hoặc ca phỏng vấn đang được xử lý.");
    }

 2. Sử dụng Redis Atomic Counter cho từng Slot:
    const slotCountKey = `slot_capacity:${slotId}`;
    const currentCount = await redis.incr(slotCountKey);
    if (currentCount > capacity) {
      await redis.decr(slotCountKey); // rollback
      await redis.del(lockKey);
      throw ApiError.badRequest("Ca phỏng vấn đã đầy");
    }

 Phương án MongoDB Session + Optimistic Locking hiện tại đã hoàn toàn an toàn và đủ đáp ứng
 cho quy mô vài trăm đến hàng nghìn ứng viên mà không phát sinh phức tạp về hạ tầng Redis.
 ====================================================================================
*/
