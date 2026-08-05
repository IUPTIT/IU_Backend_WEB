import ApiError from "../utils/ApiError.js";
import Application from "../models/application.model.js";
import InterviewSlot from "../models/interviewSlot.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import ApplicationScore from "../models/applicationScore.model.js";
import User from "../models/user.model.js";
import * as campaignService from "./campaign.service.js";
import * as screeningService from "./screening.service.js";
import * as notificationService from "./notification.service.js";
import * as emailService from "./email.service.js";

// ---- Helpers phân quyền panel ca phỏng vấn ----

/** Ca phải có ≥1 người PV trước khi cho book / gán ứng viên */
export function assertSlotHasInterviewers(slot) {
  if (!slot?.interviewerIds?.length) {
    throw ApiError.badRequest(
      "Ca chưa có người phỏng vấn phụ trách — BCN cần phân công trước khi đặt/gán lịch",
    );
  }
}

/** BCN toàn quyền; Leader chỉ ca mình nằm trong interviewerIds */
export function assertCanAccessSlot(slot, actor) {
  if (!actor) return;
  if (actor.role === "bcn") return;
  const uid = String(actor.id ?? actor._id);
  const ids = (slot.interviewerIds ?? []).map((id) =>
    String(id?._id ?? id),
  );
  if (!ids.includes(uid)) {
    throw ApiError.forbidden(
      "Bạn không được phân công phụ trách ca phỏng vấn này",
    );
  }
}

/** Thông báo panel khi có ứng viên mới vào ca (book / gán) */
export async function notifyInterviewersNewBooking(slot, application) {
  const ids = (slot.interviewerIds ?? []).map((id) => String(id)).filter(Boolean);
  if (!ids.length) return;
  const users = await User.find({
    _id: { $in: ids },
    isActive: { $ne: false },
  }).select("name email role");
  const dateLabel = new Date(slot.date).toLocaleDateString("vi-VN");
  const name = application.fullName ?? "Ứng viên";
  for (const u of users) {
    try {
      const link =
        u.role === "bcn"
          ? `/admin/recruitment/interviews/slots/${slot._id}`
          : `/leader/recruitment/interviews/slots/${slot._id}`;
      await notificationService.createNotification({
        userId: u._id,
        title: "Ứng viên mới đặt lịch phỏng vấn",
        body: `${name} · ${dateLabel} ${slot.startTime}–${slot.endTime} · ${slot.location}`,
        type: "booking_confirmed",
        link,
      });
    } catch (err) {
      console.warn("[interview] notify panel booking failed:", err.message);
    }
  }
}

// ---- BCN: quản lý ca phỏng vấn ----

/** Thông báo in-app + email cho interviewer vừa được thêm vào ca */
async function notifyInterviewersAssigned(slot, addedUserIds) {
  if (!addedUserIds?.length) return;
  const users = await User.find({
    _id: { $in: addedUserIds },
    isActive: { $ne: false },
  }).select("name email role");
  const dateLabel = new Date(slot.date).toLocaleDateString("vi-VN");
  for (const u of users) {
    try {
      const link =
        u.role === "bcn"
          ? `/admin/recruitment/interviews/slots/${slot._id}`
          : `/leader/recruitment/interviews/slots/${slot._id}`;
      await notificationService.createNotification({
        userId: u._id,
        title: "Bạn được phân công phỏng vấn",
        body: `Ca ${slot.startTime}–${slot.endTime} ngày ${dateLabel} · ${slot.location}`,
        type: "interview_assignment",
        link,
      });
      if (u.email) {
        await emailService.sendInterviewerAssignedEmail(u, slot);
      }
    } catch (err) {
      console.warn("[interview] notify interviewer failed:", err.message);
    }
  }
}

export async function createSlot(data) {
  await campaignService.getCampaign(data.campaignId);
  const slot = await InterviewSlot.create(data);
  const ids = (data.interviewerIds ?? []).map(String).filter(Boolean);
  if (ids.length) {
    await notifyInterviewersAssigned(slot, ids);
  }
  return slot.populate("interviewerIds", "name email");
}

export async function bulkGenerateSlots(data) {
  await campaignService.getCampaign(data.campaignId);
  const slots = InterviewSlot.bulkGenerate(data);
  if (!slots.length) {
    throw ApiError.badRequest(
      "Khung giờ không sinh được ca nào — kiểm tra lại startHour/endHour/durationMinutes",
    );
  }
  const created = await InterviewSlot.insertMany(slots);
  const ids = (data.interviewerIds ?? []).map(String).filter(Boolean);
  if (ids.length) {
    for (const slot of created) {
      await notifyInterviewersAssigned(slot, ids);
    }
  }
  return created;
}

// Danh sách slot của đợt + booking kèm hồ sơ ứng viên (cho bảng lịch PV của BCN)
export async function listSlots(campaignId) {
  const slots = await InterviewSlot.find({ campaignId })
    .sort({ date: 1, startTime: 1 })
    .populate("interviewerIds", "name email");
  const bookings = await InterviewBooking.find({
    slotId: { $in: slots.map((s) => s._id) },
  }).populate(
    "applicationId",
    "fullName email departmentPreferences status applicationCode",
  );
  return { slots, bookings };
}

/** Ca mà user đang phụ trách (Leader / BCN panel) */
export async function listMyInterviewSlots(userId) {
  const slots = await InterviewSlot.find({ interviewerIds: userId })
    .sort({ date: 1, startTime: 1 })
    .populate("interviewerIds", "name email")
    .populate("campaignId", "name");
  const bookings = await InterviewBooking.find({
    slotId: { $in: slots.map((s) => s._id) },
  }).populate(
    "applicationId",
    "fullName email departmentPreferences status applicationCode",
  );
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

  const prevInterviewers = new Set(
    (slot.interviewerIds ?? []).map((id) => String(id)),
  );

  // Đổi startTime mà không gửi endTime → dời endTime giữ nguyên thời lượng ca
  if (data.startTime !== undefined && data.endTime === undefined) {
    const duration =
      timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
    data = {
      ...data,
      endTime: minutesToTime(timeToMinutes(data.startTime) + duration),
    };
  }

  const allowed = [
    "interviewerIds",
    "location",
    "date",
    "startTime",
    "endTime",
    "capacity",
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) slot[key] = data[key];
  }
  if (data.interviewerIds !== undefined && !slot.interviewerIds?.length) {
    throw ApiError.badRequest(
      "Ca phải có ít nhất 1 người phỏng vấn phụ trách",
    );
  }
  if (slot.capacity < slot.bookedCount) {
    throw ApiError.badRequest("Sức chứa mới nhỏ hơn số ứng viên đã đặt");
  }
  await slot.save();

  if (data.interviewerIds !== undefined) {
    const added = (slot.interviewerIds ?? [])
      .map((id) => String(id))
      .filter((id) => !prevInterviewers.has(id));
    if (added.length) {
      await notifyInterviewersAssigned(slot, added);
    }
  }

  return slot.populate("interviewerIds", "name email");
}

// Xoá ca — chỉ khi chưa có ứng viên đặt lịch (bảo vệ booking của ứng viên)
export async function deleteSlot(slotId) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound("Không tìm thấy ca phỏng vấn");
  const bookings = await InterviewBooking.countDocuments({ slotId });
  if (bookings > 0) {
    throw ApiError.badRequest(
      "Ca đã có ứng viên đặt lịch — chuyển ứng viên sang ca khác trước khi xoá",
    );
  }
  await InterviewSlot.deleteOne({ _id: slotId });
}

// BCN gán ca phỏng vấn thay ứng viên (nghiệp vụ 3.1) — có booking cũ thì chuyển ca
export async function assignSlot(applicationId, slotId) {
  const application = await Application.findById(applicationId);
  if (!application) throw ApiError.notFound("Không tìm thấy hồ sơ");
  if (application.status !== "passed_cv") {
    throw ApiError.badRequest(
      "Chỉ gán lịch phỏng vấn cho hồ sơ đã đạt vòng đơn",
    );
  }

  const targetPreview = await InterviewSlot.findById(slotId);
  if (!targetPreview) throw ApiError.notFound("Ca phỏng vấn không tồn tại");
  assertSlotHasInterviewers(targetPreview);
  if (
    String(application.campaignId) !== String(targetPreview.campaignId)
  ) {
    throw ApiError.badRequest(
      "Ca phỏng vấn không thuộc cùng đợt tuyển với hồ sơ ứng viên",
    );
  }

  const existing = await InterviewBooking.findOne({ applicationId });
  if (existing && String(existing.slotId) === String(slotId)) return existing;

  // Giữ chỗ ở slot mới trước (guard capacity atomic), rồi mới nhả slot cũ
  const target = await InterviewSlot.findOneAndUpdate(
    { _id: slotId, $expr: { $lt: ["$bookedCount", "$capacity"] } },
    { $inc: { bookedCount: 1, version: 1 } },
    { new: true },
  );
  if (!target)
    throw ApiError.badRequest("Ca phỏng vấn không tồn tại hoặc đã hết chỗ");

  let booking;
  if (existing) {
    await InterviewSlot.updateOne(
      { _id: existing.slotId, bookedCount: { $gt: 0 } },
      { $inc: { bookedCount: -1, version: 1 } },
    );
    existing.slotId = slotId;
    existing.status = "changed";
    existing.bookedAt = new Date();
    await existing.save();
    booking = existing;
  } else {
    booking = await InterviewBooking.create({
      applicationId,
      slotId,
      status: "booked",
    });
  }

  try {
    await emailService.sendBookingConfirmedEmail(application, target);
    if (application.userId) {
      const dateLabel = new Date(target.date).toLocaleDateString("vi-VN");
      await notificationService.createNotification({
        userId: application.userId,
        title: "Đã gán lịch phỏng vấn",
        body: `${dateLabel} · ${target.startTime}–${target.endTime} · ${target.location}`,
        type: "booking_confirmed",
        link: "/candidate/interview",
      });
    }
    await notifyInterviewersNewBooking(target, application);
  } catch (err) {
    console.warn("[interview] assignSlot notify failed:", err.message);
  }

  return booking;
}

/**
 * Chấm điểm + điểm danh theo booking.
 * Chỉ BCN hoặc người nằm trong interviewerIds của ca mới được chấm.
 * Vắng mặt → booking no_show; KHÔNG auto Fail — BCN xác nhận Fail riêng.
 */
export async function scoreBooking(
  bookingId,
  scoredBy,
  { criteriaScores, comment, attendance, asUserId },
  actorRole,
) {
  const booking = await InterviewBooking.findById(bookingId);
  if (!booking) throw ApiError.notFound("Không tìm thấy lịch phỏng vấn");

  const slot = await InterviewSlot.findById(booking.slotId);
  if (!slot) throw ApiError.notFound("Không tìm thấy ca phỏng vấn");
  assertCanAccessSlot(slot, { id: scoredBy, role: actorRole });

  let effectiveScorer = scoredBy;
  if (asUserId) {
    if (actorRole !== "bcn") {
      throw ApiError.forbidden("Chỉ Ban Chủ nhiệm được sửa điểm hộ người khác");
    }
    effectiveScorer = asUserId;
  }

  const result = await screeningService.scoreApplication({
    applicationId: booking.applicationId,
    round: "interview",
    scoredBy: effectiveScorer,
    criteriaScores,
    comment,
    attendance,
  });

  // Chỉ đánh dấu điểm danh trên booking — Fail vòng PV do BCN decide-interview
  booking.status = attendance === "absent" ? "no_show" : "completed";
  await booking.save();

  return { ...result, booking };
}

// Chi tiết 1 ca + danh sách ứng viên đã đặt kèm điểm từng reviewer
export async function getSlotDetail(slotId, actor) {
  const slot = await InterviewSlot.findById(slotId).populate(
    "interviewerIds",
    "name email",
  );
  if (!slot) throw ApiError.notFound("Không tìm thấy ca phỏng vấn");
  if (actor) assertCanAccessSlot(slot, actor);
  const bookings = await InterviewBooking.find({ slotId }).populate(
    "applicationId",
    "fullName email phone applicationCode status departmentPreferences",
  );

  const appIds = bookings.map((b) => b.applicationId?._id).filter(Boolean);
  const scoreDocs = await ApplicationScore.find({
    applicationId: { $in: appIds },
    round: "interview",
  }).populate("scoredBy", "name");

  const scoresByApp = new Map();
  for (const s of scoreDocs) {
    const key = String(s.applicationId);
    const list = scoresByApp.get(key) ?? [];
    list.push({
      scoredBy: s.scoredBy?._id ? String(s.scoredBy._id) : String(s.scoredBy),
      name: s.scoredBy?.name ?? "Reviewer",
      totalScore: s.totalScore,
      comment: s.comment ?? "",
      attendance: s.attendance ?? null,
    });
    scoresByApp.set(key, list);
  }

  return {
    slot,
    bookings: bookings.map((b) => {
      const obj = b.toObject();
      const scores = scoresByApp.get(String(b.applicationId?._id)) ?? [];
      const avg =
        scores.length > 0
          ? scores.reduce((a, x) => a + x.totalScore, 0) / scores.length
          : null;
      obj.interviewScore = avg != null ? Number(avg.toFixed(2)) : null;
      obj.scoreCount = scores.length;
      obj.scores = scores;
      return obj;
    }),
  };
}

// Chi tiết 1 booking cho trang note phỏng vấn: ứng viên + ca + toàn bộ điểm các reviewer
export async function getBookingDetail(bookingId, actor) {
  const booking = await InterviewBooking.findById(bookingId)
    .populate(
      "applicationId",
      "fullName email phone applicationCode status departmentPreferences avatarUrl cvUrl campaignId",
    )
    .populate("slotId");
  if (!booking) throw ApiError.notFound("Không tìm thấy lịch phỏng vấn");
  if (actor && booking.slotId) {
    assertCanAccessSlot(booking.slotId, actor);
  }

  const summary = await ApplicationScore.getAverageAndVariance(
    booking.applicationId._id,
    "interview",
  );
  return { booking, summary };
}

// Kết quả phỏng vấn toàn đợt (mọi ca) — phục vụ xuất file thảo luận
export async function listInterviewResults(campaignId) {
  await campaignService.getCampaign(campaignId);
  const slots = await InterviewSlot.find({ campaignId });
  const slotMap = new Map(slots.map((s) => [String(s._id), s]));
  const bookings = await InterviewBooking.find({
    slotId: { $in: slots.map((s) => s._id) },
  }).populate(
    "applicationId",
    "fullName email phone applicationCode status departmentPreferences",
  );

  const appIds = bookings.map((b) => b.applicationId?._id).filter(Boolean);
  const scores = await ApplicationScore.find({
    applicationId: { $in: appIds },
    round: "interview",
  }).populate("scoredBy", "name");

  const byApp = new Map();
  for (const s of scores) {
    const key = String(s.applicationId);
    const list = byApp.get(key) ?? [];
    list.push(s);
    byApp.set(key, list);
  }

  return bookings.map((b) => {
    const slot = slotMap.get(String(b.slotId));
    const appScores = byApp.get(String(b.applicationId?._id)) ?? [];
    const avg = appScores.length
      ? appScores.reduce((sum, s) => sum + s.totalScore, 0) / appScores.length
      : null;
    return {
      booking: b,
      slot,
      averageScore: avg != null ? Number(avg.toFixed(2)) : null,
      scores: appScores.map((s) => ({
        reviewerName: s.scoredBy?.name ?? "",
        totalScore: s.totalScore,
        comment: s.comment,
        attendance: s.attendance,
      })),
    };
  });
}

// Danh sách người có thể phỏng vấn / chấm hồ sơ (BCN/Leader đang hoạt động)
// $ne:false thay vì true — tài khoản cũ tạo trước khi có field isActive vẫn được tính
export function listInterviewers() {
  return User.find({
    role: { $in: ["bcn", "leader"] },
    isActive: { $ne: false },
  })
    .select("name email role")
    .sort({ name: 1 });
}

/** Ứng viên đã Pass CV nhưng chưa đặt lịch phỏng vấn */
export async function listUnbookedApplications(campaignId) {
  await campaignService.getCampaign(campaignId);
  const bookedAppIds = await InterviewBooking.distinct("applicationId", {});
  return Application.find({
    campaignId,
    status: "passed_cv",
    _id: { $nin: bookedAppIds },
  })
    .sort({ updatedAt: 1 })
    .select(
      "fullName email phone applicationCode departmentPreferences status userId bookingReminderSentAt createdAt updatedAt",
    );
}

/**
 * Đánh dấu "Vắng, không đặt lịch" — Fail vòng phỏng vấn khi ứng viên không đặt lịch
 * (nghiệp vụ 3.2)
 */
export async function markUnbookedNoShow(applicationId) {
  const application = await Application.findById(applicationId);
  if (!application) throw ApiError.notFound("Không tìm thấy hồ sơ");
  if (application.status !== "passed_cv") {
    throw ApiError.badRequest("Chỉ áp dụng cho hồ sơ Đạt vòng đơn chưa có kết quả PV");
  }
  const existing = await InterviewBooking.findOne({ applicationId });
  if (existing) {
    throw ApiError.badRequest("Ứng viên đã có lịch phỏng vấn — dùng điểm danh vắng trên ca");
  }
  return screeningService.decideInterview(applicationId, "failed_interview");
}
