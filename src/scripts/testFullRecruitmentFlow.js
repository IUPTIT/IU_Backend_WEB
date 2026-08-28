/**
 * Script kiểm thử FULL LUỒNG TUYỂN DỤNG THÀNH VIÊN (Recruitment End-to-End Test):
 * 1. Mở đợt tuyển dụng (Campaign & Application Form & Interview Slots)
 * 2. Ứng viên 1 (lethithao2k6yl@gmail.com): Nộp đơn -> Chấm CV điểm thấp -> TRƯỢT VÒNG ĐƠN (failed_cv) -> Gửi email từ chối
 * 3. Ứng viên 2 (lethithao.ptit@gmail.com): Nộp đơn -> Chấm CV điểm cao -> PASS VÒNG ĐƠN (passed_cv) -> Tạo TK Candidate (MK = DOB DDMMYYYY) -> Đặt lịch PV -> Phỏng vấn điểm cao -> PASS PHỎNG VẤN (passed_interview) -> TRÚNG TUYỂN (admitted) -> Bàn giao Tân binh Đào tạo
 * 4. Ứng viên 3 (minhdt.ptit@gmail.com): Nộp đơn -> Chấm CV đạt -> PASS VÒNG ĐƠN (passed_cv) -> Tạo TK Candidate -> Đặt lịch PV -> Phỏng vấn điểm thấp -> TRƯỢT PHỎNG VẤN (failed_interview) -> Khóa TK Candidate -> Gửi email từ chối PV
 * 5. Báo cáo tổng kết & gửi email nghiệm thu về iuptit.com@gmail.com
 *
 * Chạy lệnh: npm run test:recruitment-flow
 * hoặc: node src/scripts/testFullRecruitmentFlow.js
 */

import { connectDatabase, disconnectDatabase } from "../config/database.js";
import config from "../config/env.js";
import User from "../models/user.model.js";
import ClubDepartment from "../models/clubDepartment.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";
import ApplicationForm from "../models/applicationForm.model.js";
import Application from "../models/application.model.js";
import InterviewSlot from "../models/interviewSlot.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import ApplicationScore from "../models/applicationScore.model.js";
import Trainee from "../models/trainee.model.js";
import SlotHold from "../models/slotHold.model.js";

import * as applicationService from "../services/application.service.js";
import * as screeningService from "../services/screening.service.js";
import * as interviewService from "../services/interview.service.js";
import * as emailService from "../services/email.service.js";
import * as emailAutomation from "../services/emailAutomation.service.js";
import { ensureDefaultTemplates } from "../services/emailTemplate.service.js";
import { createCandidateAccountFromApplication, passwordFromDob } from "../jobs/createCandidateAccount.job.js";
import { createTraineeFromApplication } from "../services/training.service.js";

const CANDIDATE_1 = {
  email: "lethithao2k6yl@gmail.com",
  fullName: "Lê Thị Thảo (Fail CV)",
  studentId: "B24DCCC001",
  className: "D24CQCN01-B",
  faculty: "Công nghệ thông tin",
  phone: "0987654321",
  dateOfBirth: new Date("2006-08-20"), // DOB -> 20082006
  department: "Ban Chuyên môn",
  role: "Fail CV",
};

const CANDIDATE_2 = {
  email: "lethithao.ptit@gmail.com",
  fullName: "Lê Thị Thảo (Full Pass)",
  studentId: "B24DCCN123",
  className: "D24CQCN02-B",
  faculty: "Công nghệ thông tin",
  phone: "0912345678",
  dateOfBirth: new Date("2006-05-15"), // DOB -> 15052006
  department: "Ban Truyền thông",
  role: "Full Pass",
};

const CANDIDATE_3 = {
  email: "minhdt.ptit@gmail.com",
  fullName: "Đào Tuấn Minh (Fail Interview)",
  studentId: "B24DCAT088",
  className: "D24CQAT01-B",
  faculty: "An toàn thông tin",
  phone: "0934567890",
  dateOfBirth: new Date("2005-11-10"), // DOB -> 10112005
  department: "Ban Sự kiện",
  role: "Fail Interview",
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "iuptit.com@gmail.com";
const CLUB_REPORT_EMAIL = "iuptit.com@gmail.com";

const resultsLog = [];

function logStep(stepNum, title) {
  console.log(`\n======================================================`);
  console.log(`[BƯỚC ${stepNum}] ${title}`);
  console.log(`======================================================`);
}

async function runAction(label, fn) {
  process.stdout.write(`  → ${label} ... `);
  try {
    const res = await fn();
    const info = res?.provider ? ` [${res.provider}]` : res?.code ? ` [Mã: ${res.code}]` : "";
    console.log(`OK${info}`);
    resultsLog.push({ label, ok: true, details: info });
    return res;
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    resultsLog.push({ label, ok: false, error: err.message });
    throw err;
  }
}

async function prepareDepartments(adminUser) {
  const depts = [
    { name: "Ban Truyền thông", code: "media", field: "Truyền thông & Hình ảnh" },
    { name: "Ban Chuyên môn", code: "tech", field: "Lập trình & Kỹ thuật" },
    { name: "Ban Sự kiện", code: "event", field: "Tổ chức sự kiện" },
  ];

  for (const d of depts) {
    await ClubDepartment.findOneAndUpdate(
      { name: d.name },
      {
        $setOnInsert: {
          name: d.name,
          code: d.code,
          field: d.field,
          status: "active",
          createdBy: adminUser._id,
        },
      },
      { upsert: true },
    );
  }
}

async function prepareCampaignAndSlots(adminUser) {
  const now = new Date();
  const openAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 ngày trước
  const closeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 ngày sau

  let campaign = await RecruitmentCampaign.findOne({
    status: "open",
    closeAt: { $gt: now },
  });

  if (!campaign) {
    campaign = await RecruitmentCampaign.create({
      name: `Tuyển Thành Viên IU Club Kỳ Fall 2026 (Live Test)`,
      description: "Đợt tuyển chọn thành viên chính thức CLB Tin học IU Club PTIT.",
      openAt,
      closeAt,
      status: "open",
      quotas: [
        { department: "Ban Truyền thông", quota: 15 },
        { department: "Ban Chuyên môn", quota: 20 },
        { department: "Ban Sự kiện", quota: 15 },
      ],
      createdBy: adminUser._id,
    });
  }

  // Đảm bảo Form tồn tại
  let form = await ApplicationForm.findOne({ campaignId: campaign._id });
  if (!form) {
    const fixedFields = ApplicationForm.seedFixedFields(campaign.quotas);
    form = await ApplicationForm.create({
      campaignId: campaign._id,
      fields: fixedFields,
      isLocked: false,
      publishedAt: now,
    });
  }

  // Chuẩn bị 2 Ca phỏng vấn
  const slotDate1 = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const slotDate2 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  let slot1 = await InterviewSlot.findOne({
    campaignId: campaign._id,
    startTime: "09:00",
  });
  if (!slot1) {
    slot1 = await InterviewSlot.create({
      campaignId: campaign._id,
      name: "Ca sáng - Ban Truyền thông & Chuyên môn",
      date: slotDate1,
      startTime: "09:00",
      endTime: "10:00",
      location: "Phòng Hội thảo A2 - Tòa A PTIT (hoặc Google Meet)",
      capacity: 10,
      bookedCount: 0,
      interviewerIds: [adminUser._id],
    });
  }

  let slot2 = await InterviewSlot.findOne({
    campaignId: campaign._id,
    startTime: "14:30",
  });
  if (!slot2) {
    slot2 = await InterviewSlot.create({
      campaignId: campaign._id,
      name: "Ca chiều - Ban Sự kiện & Chuyên môn",
      date: slotDate2,
      startTime: "14:30",
      endTime: "15:30",
      location: "Phòng A101 - PTIT (hoặc Google Meet)",
      capacity: 10,
      bookedCount: 0,
      interviewerIds: [adminUser._id],
    });
  }

  return { campaign, form, slot1, slot2 };
}

async function cleanupTestData(emails) {
  for (const email of emails) {
    const lower = email.toLowerCase();
    const apps = await Application.find({ email: lower });
    const appIds = apps.map((a) => a._id);

    await SlotHold.deleteMany({ applicationId: { $in: appIds } });
    await InterviewBooking.deleteMany({ applicationId: { $in: appIds } });
    await ApplicationScore.deleteMany({ applicationId: { $in: appIds } });
    await Application.deleteMany({ email: lower });
    await Trainee.deleteMany({ email: lower });

    // Xoá user candidate cũ nếu có để tạo mới hoàn toàn
    await User.deleteMany({ email: lower, role: "candidate" });
  }
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 BẮT ĐẦU TEST TOÀN DIỆN LUỒNG TUYỂN DỤNG IU CLUB (E2E RECRUITMENT FLOW)");
  console.log(`📧 Mail Provider: ${config.mailProvider} | From: ${config.emailFrom}`);
  console.log(`🎯 Test Emails:`);
  console.log(`   1. ${CANDIDATE_1.email} -> TRƯỢT VÒNG ĐƠN (failed_cv)`);
  console.log(`   2. ${CANDIDATE_2.email} -> FULL PASS (Đậu đơn -> Đặt lịch PV -> Đậu PV -> Trúng tuyển)`);
  console.log(`   3. ${CANDIDATE_3.email} -> TRƯỢT PHỎNG VẤN (Đậu đơn -> Đặt lịch PV -> Rớt PV)`);
  console.log("================================================================================");

  await connectDatabase();
  await ensureDefaultTemplates();
  await emailAutomation.ensureDefaultAutomationRules();

  // 1. Setup Admin
  logStep(1, "Khởi tạo Admin BCN & Danh mục Ban hoạt động");
  let admin = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (!admin) {
    admin = await User.create({
      name: "IU Club Admin",
      email: ADMIN_EMAIL.toLowerCase(),
      password: process.env.ADMIN_PASSWORD || "admin123456",
      role: "bcn",
      roles: ["bcn"],
      status: "active",
      emailVerified: true,
    });
    console.log(`  ✓ Đã tạo Admin BCN: ${admin.email}`);
  } else {
    admin.role = "bcn";
    if (!admin.roles?.includes("bcn")) admin.roles = ["bcn"];
    admin.status = "active";
    await admin.save();
    console.log(`  ✓ Admin BCN sẵn sàng: ${admin.email}`);
  }

  await prepareDepartments(admin);

  // 2. Setup Campaign & Form & Slots
  logStep(2, "Khởi tạo Đợt tuyển dụng (Campaign), Form đăng ký & Ca phỏng vấn");
  const { campaign, slot1, slot2 } = await prepareCampaignAndSlots(admin);
  console.log(`  ✓ Campaign: "${campaign.name}" [ID: ${campaign._id}]`);
  console.log(`  ✓ Ca PV 1: ${slot1.startTime}-${slot1.endTime} ngày ${new Date(slot1.date).toLocaleDateString("vi-VN")}`);
  console.log(`  ✓ Ca PV 2: ${slot2.startTime}-${slot2.endTime} ngày ${new Date(slot2.date).toLocaleDateString("vi-VN")}`);

  // 3. Dọn dẹp dữ liệu cũ của 3 email
  logStep(3, "Làm sạch dữ liệu test cũ của 3 ứng viên");
  await cleanupTestData([CANDIDATE_1.email, CANDIDATE_2.email, CANDIDATE_3.email]);
  console.log("  ✓ Đã xóa sạch dữ liệu cũ, sẵn sàng chạy luồng mới!");

  // =====================================================================================
  // ỨNG VIÊN 1: lethithao2k6yl@gmail.com -> TRƯỢT VÒNG ĐƠN (failed_cv)
  // =====================================================================================
  logStep("4.1", `[Ứng viên 1] ${CANDIDATE_1.fullName} (${CANDIDATE_1.email}) - TRƯỢT VÒNG ĐƠN`);

  // 1. Nộp hồ sơ
  const app1 = await runAction("Ứng viên 1 nộp đơn dự tuyển (Ban Chuyên môn)", async () => {
    return await applicationService.submitApplication({
      campaignId: campaign._id,
      email: CANDIDATE_1.email,
      fullName: CANDIDATE_1.fullName,
      studentId: CANDIDATE_1.studentId,
      className: CANDIDATE_1.className,
      faculty: CANDIDATE_1.faculty,
      phone: CANDIDATE_1.phone,
      dateOfBirth: CANDIDATE_1.dateOfBirth,
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cvUrl: "https://res.cloudinary.com/demo/image/upload/sample.pdf",
      departmentPreferences: [{ department: CANDIDATE_1.department, priority: 1 }],
      answers: [],
    });
  });

  // 2. Chấm điểm CV (thấp)
  await runAction("BCN chấm điểm CV ứng viên 1 (40/100 điểm)", async () => {
    return await screeningService.scoreApplication({
      applicationId: app1._id,
      round: "cv",
      scoredBy: admin._id,
      criteriaScores: [
        { criterion: "Độ phù hợp ban", weight: 50, score: 40 },
        { criterion: "Kinh nghiệm & Kỹ năng", weight: 50, score: 40 },
      ],
      comment: "Hồ sơ chưa thể hiện đủ kỹ năng chuyên môn yêu cầu.",
    });
  });

  // 3. BCN quyết định: failed_cv
  await runAction("BCN cập nhật kết quả: Không đạt vòng đơn (failed_cv)", async () => {
    return await screeningService.decideCv(app1._id, "failed_cv");
  });

  // 4. Gửi email từ chối vòng đơn
  await runAction("Gửi Email Thông báo kết quả vòng đơn (Thư từ chối)", async () => {
    return await emailService.sendApplicationRejectedEmail(app1, "failed_cv");
  });

  // =====================================================================================
  // ỨNG VIÊN 2: lethithao.ptit@gmail.com -> FULL PASS (ĐẬU ĐƠN -> ĐẶT PV -> ĐẬU PV -> ADMITTED)
  // =====================================================================================
  logStep("4.2", `[Ứng viên 2] ${CANDIDATE_2.fullName} (${CANDIDATE_2.email}) - FULL PASS`);

  // 1. Nộp hồ sơ
  const app2 = await runAction("Ứng viên 2 nộp đơn dự tuyển (Ban Truyền thông)", async () => {
    return await applicationService.submitApplication({
      campaignId: campaign._id,
      email: CANDIDATE_2.email,
      fullName: CANDIDATE_2.fullName,
      studentId: CANDIDATE_2.studentId,
      className: CANDIDATE_2.className,
      faculty: CANDIDATE_2.faculty,
      phone: CANDIDATE_2.phone,
      dateOfBirth: CANDIDATE_2.dateOfBirth,
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cvUrl: "https://res.cloudinary.com/demo/image/upload/sample.pdf",
      departmentPreferences: [{ department: CANDIDATE_2.department, priority: 1 }],
      answers: [],
    });
  });

  // 2. Chấm điểm CV (cao)
  await runAction("BCN chấm điểm CV ứng viên 2 (92/100 điểm)", async () => {
    return await screeningService.scoreApplication({
      applicationId: app2._id,
      round: "cv",
      scoredBy: admin._id,
      criteriaScores: [
        { criterion: "Độ phù hợp ban", weight: 50, score: 90 },
        { criterion: "Kinh nghiệm & Kỹ năng", weight: 50, score: 94 },
      ],
      comment: "Hồ sơ xuất sắc, portfolio thiết kế và media rất ấn tượng.",
    });
  });

  // 3. BCN quyết định: passed_cv
  await runAction("BCN cập nhật kết quả: Đạt vòng đơn (passed_cv)", async () => {
    return await screeningService.decideCv(app2._id, "passed_cv");
  });

  // 4. Tạo tài khoản Candidate & Gửi email thông báo trúng tuyển vòng đơn
  const cand2DobPassword = passwordFromDob(CANDIDATE_2.dateOfBirth);
  await runAction(`Cấp tài khoản Candidate (TK: ${CANDIDATE_2.email}, MK: ${cand2DobPassword}) & Gửi Email`, async () => {
    const res = await createCandidateAccountFromApplication(app2._id, { deferEmail: false });
    return { ...res, code: cand2DobPassword };
  });

  // 5. Ứng viên đặt lịch phỏng vấn Ca 1
  const booking2 = await runAction("Ứng viên 2 đặt lịch phỏng vấn (Ca 1)", async () => {
    return await interviewService.assignSlot(app2._id, slot1._id);
  });

  // 6. Gửi email xác nhận đặt lịch & Email nhắc lịch
  await runAction("Gửi Email Xác nhận đặt lịch phỏng vấn thành công", async () => {
    return await emailService.sendBookingConfirmedEmail(app2, slot1);
  });

  await runAction("Gửi Email Nhắc lịch phỏng vấn trước 24h", async () => {
    return await emailService.sendInterviewReminderEmail(app2, slot1, "24 giờ", {
      ruleKey: "interview_remind_24h",
    });
  });

  // 7. Phỏng vấn & Chấm điểm (xuất sắc)
  await runAction("Interviewer chấm điểm phỏng vấn (95/100 điểm, Có mặt)", async () => {
    return await interviewService.scoreBooking(
      booking2._id,
      admin._id,
      {
        criteriaScores: [
          { criterion: "Thái độ & Tác phong", weight: 40, score: 95 },
          { criterion: "Kỹ năng chuyên môn & Xử lý tình huống", weight: 60, score: 95 },
        ],
        comment: "Ứng viên tự tin, định hướng rõ ràng, phù hợp văn hoá CLB.",
        attendance: "present",
      },
      "bcn",
    );
  });

  // 8. BCN quyết định: passed_interview
  await runAction("BCN cập nhật kết quả: Đạt phỏng vấn (passed_interview)", async () => {
    return await screeningService.decideInterview(app2._id, "passed_interview");
  });

  // 9. Gửi email đạt phỏng vấn
  await runAction("Gửi Email Thông báo Đạt vòng phỏng vấn", async () => {
    return await emailService.sendInterviewPassedEmail(app2);
  });

  // 10. BCN xác nhận kết quả cuối: admitted (Trúng tuyển chính thức)
  await runAction("BCN xác nhận Trúng tuyển chính thức (admitted)", async () => {
    return await screeningService.confirmFinal(app2._id, "admitted");
  });

  // 11. Bàn giao sang Tân binh Training & Gửi email chào mừng
  await runAction("Bàn giao sang danh sách Tân binh Đào tạo (Trainee)", async () => {
    const updatedApp = await Application.findById(app2._id);
    return await createTraineeFromApplication(updatedApp);
  });

  await runAction("Gửi Email Chúc mừng trúng tuyển (Admitted Email)", async () => {
    return await emailService.sendAdmittedEmail(app2);
  });

  await runAction("Gửi Email Chào mừng thành viên mới (Welcome Member)", async () => {
    return await emailService.sendWelcomeMemberEmail({
      name: app2.fullName,
      email: app2.email,
    });
  });

  // =====================================================================================
  // ỨNG VIÊN 3: minhdt.ptit@gmail.com -> PASS ĐƠN -> ĐẶT LỊCH PV -> TRƯỢT PHỎNG VẤN
  // =====================================================================================
  logStep("4.3", `[Ứng viên 3] ${CANDIDATE_3.fullName} (${CANDIDATE_3.email}) - TRƯỢT PHỎNG VẤN`);

  // 1. Nộp hồ sơ
  const app3 = await runAction("Ứng viên 3 nộp đơn dự tuyển (Ban Sự kiện)", async () => {
    return await applicationService.submitApplication({
      campaignId: campaign._id,
      email: CANDIDATE_3.email,
      fullName: CANDIDATE_3.fullName,
      studentId: CANDIDATE_3.studentId,
      className: CANDIDATE_3.className,
      faculty: CANDIDATE_3.faculty,
      phone: CANDIDATE_3.phone,
      dateOfBirth: CANDIDATE_3.dateOfBirth,
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cvUrl: "https://res.cloudinary.com/demo/image/upload/sample.pdf",
      departmentPreferences: [{ department: CANDIDATE_3.department, priority: 1 }],
      answers: [],
    });
  });

  // 2. Chấm điểm CV (khá)
  await runAction("BCN chấm điểm CV ứng viên 3 (85/100 điểm)", async () => {
    return await screeningService.scoreApplication({
      applicationId: app3._id,
      round: "cv",
      scoredBy: admin._id,
      criteriaScores: [
        { criterion: "Độ phù hợp ban", weight: 50, score: 85 },
        { criterion: "Kinh nghiệm & Kỹ năng", weight: 50, score: 85 },
      ],
      comment: "Hồ sơ khá tốt, có tinh thần nhiệt huyết.",
    });
  });

  // 3. BCN quyết định: passed_cv
  await runAction("BCN cập nhật kết quả: Đạt vòng đơn (passed_cv)", async () => {
    return await screeningService.decideCv(app3._id, "passed_cv");
  });

  // 4. Cấp tài khoản Candidate
  const cand3DobPassword = passwordFromDob(CANDIDATE_3.dateOfBirth);
  await runAction(`Cấp tài khoản Candidate (TK: ${CANDIDATE_3.email}, MK: ${cand3DobPassword}) & Gửi Email`, async () => {
    const res = await createCandidateAccountFromApplication(app3._id, { deferEmail: false });
    return { ...res, code: cand3DobPassword };
  });

  // 5. Ứng viên đặt lịch phỏng vấn Ca 2
  const booking3 = await runAction("Ứng viên 3 đặt lịch phỏng vấn (Ca 2)", async () => {
    return await interviewService.assignSlot(app3._id, slot2._id);
  });

  // 6. Gửi email xác nhận đặt lịch
  await runAction("Gửi Email Xác nhận đặt lịch phỏng vấn thành công", async () => {
    return await emailService.sendBookingConfirmedEmail(app3, slot2);
  });

  // 7. Phỏng vấn & Chấm điểm (không đạt)
  await runAction("Interviewer chấm điểm phỏng vấn (45/100 điểm, Có mặt)", async () => {
    return await interviewService.scoreBooking(
      booking3._id,
      admin._id,
      {
        criteriaScores: [
          { criterion: "Thái độ & Tác phong", weight: 40, score: 50 },
          { criterion: "Kỹ năng chuyên môn & Xử lý tình huống", weight: 60, score: 42 },
        ],
        comment: "Kỹ năng tổ chức sự kiện chưa đáp ứng yêu cầu của đợt này.",
        attendance: "present",
      },
      "bcn",
    );
  });

  // 8. BCN quyết định: failed_interview
  await runAction("BCN cập nhật kết quả: Không đạt phỏng vấn (failed_interview)", async () => {
    return await screeningService.decideInterview(app3._id, "failed_interview");
  });

  // 9. Khóa tài khoản Candidate & Gửi email từ chối phỏng vấn
  await runAction("Khóa tài khoản Candidate & Gửi Email thông báo không đạt phỏng vấn", async () => {
    const appDoc = await Application.findById(app3._id);
    if (appDoc.userId) {
      await User.updateOne({ _id: appDoc.userId }, { $set: { isActive: false, status: "disabled" } });
    }
    return await emailService.sendApplicationRejectedEmail(app3, "failed_interview");
  });

  // =====================================================================================
  // BÁO CÁO & TỔNG KẾT
  // =====================================================================================
  logStep(5, "Tổng kết kết quả & Gửi báo cáo nghiệm thu về CLB");

  const totalSteps = resultsLog.length;
  const okSteps = resultsLog.filter((x) => x.ok).length;
  const failSteps = resultsLog.filter((x) => !x.ok).length;

  console.log("\n================================================================================");
  console.log("📊 BẢNG TỔNG KẾT LUỒNG TUYỂN DỤNG:");
  console.log("================================================================================");
  console.log(`1. Ứng viên 1: ${CANDIDATE_1.fullName} (${CANDIDATE_1.email})`);
  console.log(`   - Mã hồ sơ: ${app1.applicationCode}`);
  console.log(`   - Trạng thái: TRƯỢT VÒNG ĐƠN (failed_cv)`);
  console.log(`   - Email đã gửi: Xác nhận nộp đơn, Thư từ chối vòng đơn.`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`2. Ứng viên 2: ${CANDIDATE_2.fullName} (${CANDIDATE_2.email})`);
  console.log(`   - Mã hồ sơ: ${app2.applicationCode}`);
  console.log(`   - Trạng thái: TRÚNG TUYỂN CHÍNH THỨC (admitted) -> TÂN BINH ĐÀO TẠO`);
  console.log(`   - Tài khoản đăng nhập: ${CANDIDATE_2.email} / Mật khẩu: ${cand2DobPassword}`);
  console.log(`   - Email đã gửi: Xác nhận nộp đơn, Cấp tài khoản & Pass CV, Xác nhận lịch PV, Nhắc lịch PV 24h, Pass PV, Chúc mừng Trúng tuyển.`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`3. Ứng viên 3: ${CANDIDATE_3.fullName} (${CANDIDATE_3.email})`);
  console.log(`   - Mã hồ sơ: ${app3.applicationCode}`);
  console.log(`   - Trạng thái: TRƯỢT PHỎNG VẤN (failed_interview)`);
  console.log(`   - Tài khoản đăng nhập: ${CANDIDATE_3.email} / Mật khẩu: ${cand3DobPassword} (Đã vô hiệu hóa)`);
  console.log(`   - Email đã gửi: Xác nhận nộp đơn, Cấp tài khoản & Pass CV, Xác nhận lịch PV, Thư từ chối PV.`);
  console.log("================================================================================");
  console.log(`✅ Kết quả: ${okSteps}/${totalSteps} bước thành công (${failSteps} thất bại)`);

  const reportHtml = `
  <h2>IU CLUB — BÁO CÁO NGHIỆM THU TEST FULL LUỒNG TUYỂN DỤNG</h2>
  <p><b>Thời gian:</b> ${new Date().toLocaleString("vi-VN")}</p>
  <p><b>Đợt tuyển dụng:</b> ${campaign.name}</p>
  <p><b>Mail Provider:</b> ${config.mailProvider} (From: <code>${config.emailFrom}</code>)</p>
  <hr/>
  <h3>1. Danh sách ứng viên thử nghiệm:</h3>
  <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%;">
    <tr style="background: #f2f2f2;">
      <th>Họ và tên</th>
      <th>Email</th>
      <th>Mã hồ sơ</th>
      <th>Ban</th>
      <th>Mật khẩu mặc định (DOB)</th>
      <th>Kết quả luồng</th>
    </tr>
    <tr>
      <td>${CANDIDATE_1.fullName}</td>
      <td><b>${CANDIDATE_1.email}</b></td>
      <td>${app1.applicationCode}</td>
      <td>${CANDIDATE_1.department}</td>
      <td>-</td>
      <td style="color: red; font-weight: bold;">Trượt vòng đơn (failed_cv)</td>
    </tr>
    <tr>
      <td>${CANDIDATE_2.fullName}</td>
      <td><b>${CANDIDATE_2.email}</b></td>
      <td>${app2.applicationCode}</td>
      <td>${CANDIDATE_2.department}</td>
      <td><code>${cand2DobPassword}</code></td>
      <td style="color: green; font-weight: bold;">Full Pass (Trúng tuyển admitted)</td>
    </tr>
    <tr>
      <td>${CANDIDATE_3.fullName}</td>
      <td><b>${CANDIDATE_3.email}</b></td>
      <td>${app3.applicationCode}</td>
      <td>${CANDIDATE_3.department}</td>
      <td><code>${cand3DobPassword}</code> (Đã khóa)</td>
      <td style="color: orange; font-weight: bold;">Trượt phỏng vấn (failed_interview)</td>
    </tr>
  </table>
  <hr/>
  <h3>2. Chi tiết các bước thực hiện:</h3>
  <ul>
    ${resultsLog.map((r) => `<li>${r.ok ? "✅" : "❌"} <b>${r.label}</b> ${r.details || ""} ${r.error ? ` - <span style="color:red;">${r.error}</span>` : ""}</li>`).join("")}
  </ul>
  `;

  try {
    await emailService.sendRawEmail({
      to: CLUB_REPORT_EMAIL,
      subject: `[IU CLUB] Báo cáo Nghiệm thu Full Luồng Tuyển Dụng (${okSteps}/${totalSteps} OK)`,
      html: reportHtml,
      text: `Báo cáo Nghiệm thu Full Luồng Tuyển Dụng: ${okSteps}/${totalSteps} OK`,
    });
    console.log(`\n📧 Đã gửi email báo cáo nghiệm thu về ${CLUB_REPORT_EMAIL} thành công!`);
  } catch (err) {
    console.log(`\n⚠️ Gửi email báo cáo nghiệm thu thất bại: ${err.message}`);
  }

  await disconnectDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n❌ LỖI TRONG QUÁ TRÌNH CHẠY SCRIPT:", err);
  try {
    await disconnectDatabase();
  } catch (disconnectErr) {
    console.error("Disconnect error:", disconnectErr);
  }
  process.exit(1);
});
