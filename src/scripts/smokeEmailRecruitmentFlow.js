/**
 * Smoke test TOÀN BỘ luồng email (auto + cấu hình hardcoded).
 *
 * Pass → lethithao.ptit@gmail.com  (MK = DOB DDMMYYYY)
 * Fail → lethithao2k6yl@gmail.com
 * Bản sao + báo cáo → iuptit.com@gmail.com
 *
 * Chạy: node src/scripts/smokeEmailRecruitmentFlow.js
 */
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import config from "../config/env.js";
import * as emailService from "../services/email.service.js";
import * as emailAutomation from "../services/emailAutomation.service.js";
import { ensureDefaultTemplates } from "../services/emailTemplate.service.js";

const PASS_TO = "lethithao.ptit@gmail.com";
const FAIL_TO = "lethithao2k6yl@gmail.com";
const CLUB_CC = "iuptit.com@gmail.com";

/** DOB mẫu → mật khẩu mặc định DDMMYYYY (giống createCandidateAccount.job) */
const PASS_DOB = new Date("2006-05-15"); // → 15052006
const FAIL_DOB = new Date("2006-08-20"); // → 20082006

function passwordFromDob(dateOfBirth) {
  const d = new Date(dateOfBirth);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${d.getFullYear()}`;
}

function fakeApp(overrides) {
  return {
    fullName: overrides.fullName,
    email: overrides.email,
    applicationCode: overrides.applicationCode,
    dateOfBirth: overrides.dateOfBirth || PASS_DOB,
    assignedDepartment: overrides.department || "Truyền thông",
    departmentPreferences: [
      { department: overrides.department || "Truyền thông" },
    ],
    cvScore: overrides.cvScore ?? 8.5,
    interviewScore: overrides.interviewScore ?? 9,
  };
}

function fakeSlot() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return {
    date: d,
    startTime: "14:00",
    endTime: "14:30",
    location: "Phòng A101 – Tòa A, PTIT (hoặc Google Meet)",
    meetingLink: "https://meet.google.com/iu-club-demo",
    bookedCount: 3,
    capacity: 8,
    _id: "000000000000000000000001",
  };
}

function fakeStaff(email, name, role = "leader") {
  return { email, name, role };
}

async function runStep(label, fn) {
  process.stdout.write(`  → ${label} ... `);
  try {
    const res = await fn();
    if (res?.skipped) {
      console.log(`SKIP (${res.reason || "disabled/missing"})`);
      return { label, ok: false, skipped: true, reason: res.reason };
    }
    console.log(`OK${res?.provider ? ` [${res.provider}]` : ""}`);
    return { label, ok: true, provider: res?.provider };
  } catch (err) {
    console.log(`FAIL: ${err.message}`);
    return { label, ok: false, error: err.message };
  }
}

async function autoRecruitmentPass(to, name, code, dob) {
  const app = fakeApp({
    fullName: name,
    email: to,
    applicationCode: code,
    dateOfBirth: dob,
    department: "Truyền thông",
  });
  const pwd = passwordFromDob(dob);
  const slot = fakeSlot();
  const results = [];

  console.log(`\n=== AUTO · PASS → ${to} (MK mặc định ${pwd}) ===`);
  results.push(
    await runStep("cv_pass (email=TK, MK=DOB)", () =>
      emailService.sendCandidateAccountEmail(app, pwd),
    ),
  );
  results.push(
    await runStep("book_slot_remind", () =>
      emailService.sendUnbookedReminderEmail(app, {
        deadlineLabel: "10/08/2026 23:59 (còn khoảng 4 ngày)",
      }),
    ),
  );
  results.push(
    await runStep("booking_confirmed", () =>
      emailService.sendBookingConfirmedEmail(app, slot),
    ),
  );
  results.push(
    await runStep("interview_remind_24h", () =>
      emailService.sendInterviewReminderEmail(app, slot, "24 giờ", {
        ruleKey: "interview_remind_24h",
      }),
    ),
  );
  results.push(
    await runStep("interview_remind_2h", () =>
      emailService.sendInterviewReminderEmail(app, slot, "2 giờ", {
        ruleKey: "interview_remind_2h",
      }),
    ),
  );
  results.push(
    await runStep("interview_pass", () =>
      emailService.sendInterviewPassedEmail(app),
    ),
  );
  results.push(
    await runStep("final_pass + welcome_member", () =>
      emailService.sendAdmittedEmail(app),
    ),
  );
  return results;
}

async function autoRecruitmentFail(to, name, code, dob) {
  const app = fakeApp({
    fullName: name,
    email: to,
    applicationCode: code,
    dateOfBirth: dob,
    department: "Chuyên môn",
    cvScore: 4.2,
  });
  const results = [];

  console.log(`\n=== AUTO · FAIL → ${to} ===`);
  results.push(
    await runStep("cv_fail", () =>
      emailService.sendApplicationRejectedEmail(app, "failed_cv"),
    ),
  );
  results.push(
    await runStep("interview_fail", () =>
      emailService.sendApplicationRejectedEmail(app, "failed_interview"),
    ),
  );
  results.push(
    await runStep("final_fail", () =>
      emailService.sendApplicationRejectedEmail(app, "failed_final"),
    ),
  );
  return results;
}

/** Email hệ thống / ops (không qua Auto Rules — vẫn cấu hình wording trong code) */
async function systemAndOpsMails(to) {
  const app = fakeApp({
    fullName: "Ứng viên hệ thống test",
    email: to,
    applicationCode: "TEST-SYS-001",
    dateOfBirth: PASS_DOB,
  });
  const slot = fakeSlot();
  const staff = fakeStaff(to, "Leader Test", "leader");
  const results = [];

  console.log(`\n=== SYSTEM / OPS → ${to} ===`);
  results.push(
    await runStep("verification OTP", () =>
      emailService.sendVerificationEmail(to, "123456"),
    ),
  );
  results.push(
    await runStep("application_received", () =>
      emailService.sendApplicationReceivedEmail(app),
    ),
  );
  results.push(
    await runStep("draft_link", () =>
      emailService.sendDraftLinkEmail(app, "draft-token-demo"),
    ),
  );
  results.push(
    await runStep("password_reset", () =>
      emailService.sendPasswordResetEmail(to, "reset-token-demo"),
    ),
  );
  results.push(
    await runStep("interviewer_assigned", () =>
      emailService.sendInterviewerAssignedEmail(staff, slot),
    ),
  );
  results.push(
    await runStep("training_group_assigned", () =>
      emailService.sendTrainingGroupAssignedEmail(
        { fullName: app.fullName, email: to },
        { name: "Nhóm Alpha" },
        "Mentor Demo",
      ),
    ),
  );
  results.push(
    await runStep("training_incomplete_reminder", () =>
      emailService.sendTrainingIncompleteReminderEmail(
        { fullName: app.fullName, email: to },
        "Chưa nộp đủ task bắt buộc",
      ),
    ),
  );
  results.push(
    await runStep("task_deadline_reminder", () =>
      emailService.sendTaskDeadlineReminderEmail(
        { fullName: app.fullName, email: to },
        { title: "Bài tập #1 — Giới thiệu bản thân" },
        "còn 24 giờ",
      ),
    ),
  );
  results.push(
    await runStep("department_membership", () =>
      emailService.sendDepartmentMembershipEmail(
        { name: "Thành viên Test", email: to },
        "Bạn đã được gán Ban",
        "Bạn thuộc Ban Truyền thông.",
      ),
    ),
  );
  results.push(
    await runStep("leader_appointment", () =>
      emailService.sendLeaderAppointmentEmail(
        { name: "Leader Test", email: to },
        "Bổ nhiệm Leader",
        "Bạn được bổ nhiệm Leader Ban Truyền thông.",
      ),
    ),
  );
  results.push(
    await runStep("manual bulk (SendEmailModal)", () =>
      emailService.sendRawEmail({
        to,
        subject: "[IU CLUB] Gửi tay / bulk test",
        html: "<p>Đây là mail <b>gửi tay</b> (Settings › Email / SendEmailModal) — độc lập Auto Rules.</p>",
        text: "Mail gui tay test",
      }),
    ),
  );
  return results;
}

async function main() {
  console.log("[smoke-email] Provider:", config.mailProvider);
  console.log("[smoke-email] From:", config.emailFrom);

  if (!config.mailEnabled) {
    throw new Error(
      "Chưa cấu hình mail — set SENDGRID_API_KEY (khuyên dùng) hoặc SMTP_* trong .env",
    );
  }

  await connectDatabase();
  await ensureDefaultTemplates();
  await emailAutomation.ensureDefaultAutomationRules();

  const all = [];
  all.push(
    ...(await autoRecruitmentPass(
      PASS_TO,
      "Lê Thị Thảo (Pass test)",
      "TEST-PASS-001",
      PASS_DOB,
    )),
  );
  all.push(
    ...(await autoRecruitmentFail(
      FAIL_TO,
      "Lê Thị Thảo (Fail test)",
      "TEST-FAIL-001",
      FAIL_DOB,
    )),
  );
  // System/ops → club inbox (tránh spam 2 mailbox ứng viên)
  all.push(...(await systemAndOpsMails(CLUB_CC)));

  // Bản sao Pass/Fail ngắn vào CLB
  console.log(`\n=== BẢN SAO PASS/FAIL → ${CLUB_CC} ===`);
  const clubPass = fakeApp({
    fullName: "Bản sao — Pass vòng đơn",
    email: CLUB_CC,
    applicationCode: "TEST-CC-PASS",
    dateOfBirth: PASS_DOB,
  });
  all.push(
    await runStep("cv_pass (bản sao CLB, MK=DOB)", () =>
      emailService.sendCandidateAccountEmail(
        clubPass,
        passwordFromDob(PASS_DOB),
      ),
    ),
  );
  all.push(
    await runStep("cv_fail (bản sao CLB)", () =>
      emailService.sendApplicationRejectedEmail(
        fakeApp({
          fullName: "Bản sao — Trượt vòng đơn",
          email: CLUB_CC,
          applicationCode: "TEST-CC-FAIL",
          department: "Chuyên môn",
          cvScore: 3.5,
        }),
        "failed_cv",
      ),
    ),
  );

  const ok = all.filter((x) => x.ok).length;
  const skip = all.filter((x) => x.skipped).length;
  const fail = all.filter((x) => !x.ok && !x.skipped).length;

  const reportHtml = `<p><b>IU CLUB — Báo cáo smoke email FULL</b></p>
<p>Provider: <b>${config.mailProvider}</b> · From: <code>${config.emailFrom}</code></p>
<ul>
<li>Pass auto → <b>${PASS_TO}</b> (MK mặc định <code>${passwordFromDob(PASS_DOB)}</code> = DOB)</li>
<li>Fail auto → <b>${FAIL_TO}</b></li>
<li>System/ops + bản sao → <b>${CLUB_CC}</b></li>
</ul>
<p>Kết quả: <b>${ok} OK</b>, ${skip} skip, ${fail} fail / tổng ${all.length}</p>
<pre>${all
    .map(
      (r) =>
        `${r.ok ? "OK" : r.skipped ? "SKIP" : "FAIL"}  ${r.label}${
          r.error ? " — " + r.error : r.reason ? " — " + r.reason : ""
        }`,
    )
    .join("\n")}</pre>`;

  try {
    await emailService.sendRawEmail({
      to: CLUB_CC,
      subject: `[IU CLUB] Smoke FULL OK=${ok} SKIP=${skip} FAIL=${fail}`,
      html: reportHtml,
      text: `Smoke FULL: ${ok} OK, ${skip} skip, ${fail} fail`,
    });
    console.log(`\n=== REPORT → ${CLUB_CC} === OK`);
  } catch (err) {
    console.log(`\n=== REPORT → ${CLUB_CC} === FAIL: ${err.message}`);
  }

  console.log("\n========== TỔNG KẾT ==========");
  for (const r of all) {
    const tag = r.ok ? "OK  " : r.skipped ? "SKIP" : "FAIL";
    console.log(`${tag}  ${r.label}${r.error ? " — " + r.error : ""}`);
  }
  console.log(`\nOK=${ok} SKIP=${skip} FAIL=${fail}`);
  console.log(
    `Pass MK mặc định (DOB): ${passwordFromDob(PASS_DOB)} — bắt buộc đổi lần đầu (requirePasswordChange).`,
  );

  await disconnectDatabase();
  if (fail > 0) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("[smoke-email] Fatal:", err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
