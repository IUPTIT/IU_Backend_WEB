import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import InterviewSlot from "../models/interviewSlot.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import User from "../models/user.model.js";
import * as campaignService from "./campaign.service.js";
import * as screeningService from "./screening.service.js";

// ---- BCN: quản lý ca phỏng vấn ----

export async function createSlot(data) {
  await campaignService.getCampaign(data.campaignId);
  return InterviewSlot.create(data);
}

export async function bulkGenerateSlots(data) {
  await campaignService.getCampaign(data.campaignId);
  const slots = InterviewSlot.bulkGenerate(data);
  if (!slots.length) {
    throw ApiError.badRequest("Khung giờ không sinh được ca nào — kiểm tra lại startHour/endHour/durationMinutes");
  }
  return InterviewSlot.insertMany(slots);
}

// Danh sách slot của đợt + booking kèm hồ sơ ứng viên (cho bảng lịch PV của BCN)
export async function listSlots(campaignId) {
  const slots = await InterviewSlot.find({ campaignId })
    .sort({ date: 1, startTime: 1 })
    .populate("interviewerIds", "name email");
  const bookings = await InterviewBooking.find({
    slotId: { $in: slots.map((s) => s._id) },
  }).populate("applicationId", "fullName email departmentPreferences status applicationCode");
  return { slots, bookings };
}

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Sửa slot (phân công người phỏng vấn, đổi địa điểm/giờ) — không đụng bookedCount
export async function updateSlot(slotId, data) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound("Không tìm thấy ca phỏng vấn");

  // Đổi startTime mà không gửi endTime → dời endTime giữ nguyên thời lượng ca
  if (data.startTime !== undefined && data.endTime === undefined) {
    const duration = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
    data = { ...data, endTime: minutesToTime(timeToMinutes(data.startTime) + duration) };
  }

  const allowed = ["interviewerIds", "location", "date", "startTime", "endTime", "capacity"];
  for (const key of allowed) {
    if (data[key] !== undefined) slot[key] = data[key];
  }
  if (slot.capacity < slot.bookedCount) {
    throw ApiError.badRequest("Sức chứa mới nhỏ hơn số ứng viên đã đặt");
  }
  await slot.save();
  return slot;
}

// BCN gán ca phỏng vấn thay ứng viên (nghiệp vụ 3.1) — có booking cũ thì chuyển ca
export async function assignSlot(applicationId, slotId) {
  const application = await Application.findById(applicationId);
  if (!application) throw ApiError.notFound("Không tìm thấy hồ sơ");
  if (application.status !== "passed_cv") {
    throw ApiError.badRequest("Chỉ gán lịch phỏng vấn cho hồ sơ đã đạt vòng đơn");
  }

  const existing = await InterviewBooking.findOne({ applicationId });
  if (existing && String(existing.slotId) === String(slotId)) return existing;

  // Giữ chỗ ở slot mới trước (guard capacity atomic), rồi mới nhả slot cũ
  const target = await InterviewSlot.findOneAndUpdate(
    { _id: slotId, $expr: { $lt: ["$bookedCount", "$capacity"] } },
    { $inc: { bookedCount: 1, version: 1 } },
    { new: true },
  );
  if (!target) throw ApiError.badRequest("Ca phỏng vấn không tồn tại hoặc đã hết chỗ");

  if (existing) {
    await InterviewSlot.updateOne(
      { _id: existing.slotId, bookedCount: { $gt: 0 } },
      { $inc: { bookedCount: -1, version: 1 } },
    );
    existing.slotId = slotId;
    existing.status = "changed";
    existing.bookedAt = new Date();
    await existing.save();
    return existing;
  }

  return InterviewBooking.create({ applicationId, slotId, status: "booked" });
}

// Chấm điểm + điểm danh phỏng vấn theo booking (nghiệp vụ 3.1)
export async function scoreBooking(bookingId, scoredBy, { criteriaScores, comment, attendance }) {
  const booking = await InterviewBooking.findById(bookingId);
  if (!booking) throw ApiError.notFound("Không tìm thấy lịch phỏng vấn");

  const result = await screeningService.scoreApplication({
    applicationId: booking.applicationId,
    round: "interview",
    scoredBy,
    criteriaScores,
    comment,
    attendance,
  });

  booking.status = attendance === "absent" ? "no_show" : "completed";
  await booking.save();
  return { ...result, booking };
}

// Danh sách người có thể phỏng vấn (BCN/Leader đang hoạt động)
// $ne:false thay vì true — tài khoản cũ tạo trước khi có field isActive vẫn được tính
export function listInterviewers() {
  return User.find({ role: { $in: ["bcn", "leader"] }, isActive: { $ne: false } })
    .select("name email role")
    .sort({ name: 1 });
}
