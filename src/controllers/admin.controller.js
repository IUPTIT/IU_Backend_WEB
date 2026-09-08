import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as adminUserService from "../services/adminUser.service.js";
import * as departmentService from "../services/department.service.js";

/** FE gửi "admin" → BE "bcn" */
function normalizeIncomingRole(role) {
  if (role === "admin") return "bcn";
  return role;
}

// ---- Members ----

export const listMembers = catchAsync(async (req, res) => {
  const role = normalizeIncomingRole(req.query.role);
  const result = await adminUserService.listMembers({
    role,
    clubStatus: req.query.clubStatus,
    department: req.query.department,
    q: req.query.q,
    page: req.query.page,
    limit: req.query.limit,
  });
  sendSuccess(res, {
    message: "Danh sách thành viên CLB",
    data: result,
  });
});

export const createMember = catchAsync(async (req, res) => {
  const result = await adminUserService.createMember({
    name: req.body.name ?? req.body.fullName,
    email: req.body.email,
    phone: req.body.phone,
    role: normalizeIncomingRole(req.body.role),
    department: req.body.department ?? req.body.departmentName,
    departmentId: req.body.departmentId,
    studentId: req.body.studentId,
    generation: req.body.generation,
  });
  const { tempPassword, ...member } = result;
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã thêm thành viên",
    data: { member, tempPassword },
  });
});

export const validateMemberImport = catchAsync(async (req, res) => {
  const result = await adminUserService.validateMemberImportRows(req.body.rows);
  sendSuccess(res, {
    message: "Đã kiểm tra dữ liệu import",
    data: result,
  });
});

export const importMembers = catchAsync(async (req, res) => {
  const result = await adminUserService.importMembers(req.body.rows, {
    skipInvalid: req.body.skipInvalid !== false,
  });
  sendSuccess(res, {
    statusCode: 201,
    message: `Đã import ${result.createdCount} thành viên`,
    data: result,
  });
});

export const updateMemberRole = catchAsync(async (req, res) => {
  const member = await adminUserService.updateMemberRole(
    req.params.id,
    normalizeIncomingRole(req.body.role),
    req.user.id,
  );
  sendSuccess(res, { message: "Đã cập nhật vai trò", data: { member } });
});

export const updateMemberStatus = catchAsync(async (req, res) => {
  const clubStatus = req.body.clubStatus ?? req.body.status;
  const member = await adminUserService.updateMemberClubStatus(
    req.params.id,
    clubStatus,
  );
  sendSuccess(res, { message: "Đã cập nhật trạng thái CLB", data: { member } });
});

export const updateMemberInfo = catchAsync(async (req, res) => {
  const member = await adminUserService.updateMemberInfo(req.params.id, {
    ...req.body,
    name: req.body.name ?? req.body.fullName,
  });
  sendSuccess(res, { message: "Đã cập nhật thành viên", data: { member } });
});

export const deleteMember = catchAsync(async (req, res) => {
  try {
    await departmentService.removeMemberFromDepartment(
      req.params.id,
      { reason: "Xóa thành viên khỏi CLB" },
      req.user.id,
    );
  } catch (err) {
    if (!String(err.message).includes("chưa thuộc Ban")) throw err;
  }
  await adminUserService.deactivateAccount(req.params.id, req.user.id);
  sendSuccess(res, { message: "Đã xóa thành viên khỏi danh sách CLB" });
});

export const listUnassignedMembers = catchAsync(async (req, res) => {
  const members = await departmentService.listUnassignedOfficialMembers({
    q: req.query.q,
  });
  sendSuccess(res, {
    message: "Member chính thức chưa thuộc Ban",
    data: { members },
  });
});

export const assignMemberDepartment = catchAsync(async (req, res) => {
  const member = await departmentService.assignMemberToDepartment(
    req.params.id,
    {
      departmentId: req.body.departmentId,
      joinedAt: req.body.joinedAt,
      reason: req.body.reason,
    },
    req.user.id,
  );
  sendSuccess(res, { message: "Đã gán thành viên vào Ban", data: { member } });
});

export const removeMemberDepartment = catchAsync(async (req, res) => {
  const member = await departmentService.removeMemberFromDepartment(
    req.params.id,
    { reason: req.body?.reason },
    req.user.id,
  );
  sendSuccess(res, { message: "Đã gỡ thành viên khỏi Ban", data: { member } });
});

export const getMemberDepartmentHistory = catchAsync(async (req, res) => {
  const events = await departmentService.getMemberDepartmentHistory(
    req.params.id,
  );
  sendSuccess(res, { message: "Lịch sử tham gia Ban", data: { events } });
});

// ---- Accounts ----

export const listAccounts = catchAsync(async (req, res) => {
  const role = normalizeIncomingRole(req.query.role);
  const accounts = await adminUserService.listAccounts({
    role,
    q: req.query.q,
    includeDisabled:
      req.query.includeDisabled === "1" || req.query.includeDisabled === "true",
  });
  sendSuccess(res, {
    message: "Danh sách tài khoản portal",
    data: { accounts },
  });
});

export const createAccount = catchAsync(async (req, res) => {
  const account = await adminUserService.createAccount({
    name: req.body.name ?? req.body.fullName,
    email: req.body.email,
    role: normalizeIncomingRole(req.body.role),
    department: req.body.department ?? req.body.departmentName,
    departmentId: req.body.departmentId,
    temporaryPassword: req.body.temporaryPassword,
    isTrainingMember: req.body.isTrainingMember,
    phone: req.body.phone,
  });
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã cấp tài khoản",
    data: { account },
  });
});

export const updateAccountRole = catchAsync(async (req, res) => {
  const account = await adminUserService.updateAccountRole(
    req.params.id,
    normalizeIncomingRole(req.body.role),
    req.user.id,
  );
  sendSuccess(res, { message: "Đã cập nhật vai trò", data: { account } });
});

export const deactivateAccount = catchAsync(async (req, res) => {
  await adminUserService.deactivateAccount(req.params.id, req.user.id);
  sendSuccess(res, { message: "Đã khoá tài khoản" });
});

// ---- Departments (Ban) ----

export const listDepartments = catchAsync(async (req, res) => {
  const departments = await departmentService.listDepartments({
    status: req.query.status,
  });
  sendSuccess(res, { message: "Danh sách Ban", data: { departments } });
});

export const createDepartment = catchAsync(async (req, res) => {
  const department = await departmentService.createDepartment(
    req.body,
    req.user.id,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã tạo Ban",
    data: { department },
  });
});

export const getDepartment = catchAsync(async (req, res) => {
  const department = await departmentService.getDepartment(req.params.id);
  sendSuccess(res, { message: "Chi tiết Ban", data: { department } });
});

export const updateDepartment = catchAsync(async (req, res) => {
  const department = await departmentService.updateDepartment(
    req.params.id,
    req.body,
    req.user.id,
  );
  sendSuccess(res, { message: "Đã cập nhật Ban", data: { department } });
});

export const deleteDepartment = catchAsync(async (req, res) => {
  await departmentService.deleteDepartment(req.params.id);
  sendSuccess(res, { message: "Đã xóa Ban" });
});

export const listDepartmentMembers = catchAsync(async (req, res) => {
  const members = await departmentService.listDepartmentMembers(req.params.id);
  sendSuccess(res, { message: "Thành viên Ban", data: { members } });
});

export const appointLeader = catchAsync(async (req, res) => {
  const result = await departmentService.appointLeader(
    req.params.id,
    req.body,
    req.user.id,
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã chỉ định Leader",
    data: result,
  });
});

export const revokeLeader = catchAsync(async (req, res) => {
  const result = await departmentService.revokeLeader(
    req.params.id,
    req.params.userId,
    req.user.id,
    { reason: req.body?.reason },
  );
  sendSuccess(res, { message: "Đã thu hồi vai trò Leader", data: result });
});

export const leadershipHistory = catchAsync(async (req, res) => {
  const events = await departmentService.getLeadershipHistory(req.params.id);
  sendSuccess(res, { message: "Lịch sử Leader Ban", data: { events } });
});

export const leaderVacancies = catchAsync(async (req, res) => {
  const vacancies = await departmentService.listLeaderVacancies({
    days: req.query.days,
  });
  sendSuccess(res, {
    message: "Ban thiếu Trưởng ban",
    data: { vacancies },
  });
});

export const sendBulkEmails = catchAsync(async (req, res) => {
  const emailService = await import("../services/email.service.js");
  const result = await emailService.sendBulkEmails(req.body.messages);
  let message = `Đã gửi ${result.sent} email`;
  if (result.logged > 0 && result.sent === 0) {
    message = `Mail đang tắt — đã ghi log ${result.logged} email (chưa gửi thật)`;
  } else if (result.logged > 0) {
    message = `Đã gửi ${result.sent}, ghi log ${result.logged} (thiếu SendGrid/SMTP một phần)`;
  }
  if (result.failed > 0) {
    message += `, thất bại ${result.failed}`;
  }
  sendSuccess(res, {
    message,
    data: result,
  });
});

export const getDashboardOverview = catchAsync(async (_req, res) => {
  const dashboardService = await import("../services/dashboard.service.js");
  const overview = await dashboardService.getOverview();
  sendSuccess(res, {
    message: "Dashboard overview",
    data: { overview },
  });
});

export const listEmailTemplates = catchAsync(async (req, res) => {
  const svc = await import("../services/emailTemplate.service.js");
  const templates = await svc.listTemplates(req.query.category);
  sendSuccess(res, {
    message: "Danh sách email template",
    data: { templates },
  });
});

export const getEmailTemplate = catchAsync(async (req, res) => {
  const svc = await import("../services/emailTemplate.service.js");
  const template = await svc.getTemplate(req.params.id);
  sendSuccess(res, { message: "Email template", data: { template } });
});

export const createEmailTemplate = catchAsync(async (req, res) => {
  const svc = await import("../services/emailTemplate.service.js");
  const template = await svc.createTemplate(req.body, req.user.id);
  sendSuccess(res, {
    statusCode: 201,
    message: "Đã tạo template",
    data: { template },
  });
});

export const updateEmailTemplate = catchAsync(async (req, res) => {
  const svc = await import("../services/emailTemplate.service.js");
  const template = await svc.updateTemplate(
    req.params.id,
    req.body,
    req.user.id,
  );
  sendSuccess(res, { message: "Đã cập nhật template", data: { template } });
});

export const deleteEmailTemplate = catchAsync(async (req, res) => {
  const svc = await import("../services/emailTemplate.service.js");
  await svc.deleteTemplate(req.params.id);
  sendSuccess(res, { message: "Đã xóa template" });
});

// ---- Email automation rules (PA3 P0) ----

export const listEmailAutomationRules = catchAsync(async (_req, res) => {
  const svc = await import("../services/emailAutomation.service.js");
  const rules = await svc.listAutomationRules();
  sendSuccess(res, {
    message: "Danh sách quy tắc gửi email tự động",
    data: { rules },
  });
});

export const getEmailAutomationRule = catchAsync(async (req, res) => {
  const svc = await import("../services/emailAutomation.service.js");
  const rule = await svc.getAutomationRule(req.params.id);
  sendSuccess(res, { message: "Quy tắc gửi tự động", data: { rule } });
});

export const updateEmailAutomationRule = catchAsync(async (req, res) => {
  const svc = await import("../services/emailAutomation.service.js");
  const rule = await svc.updateAutomationRule(
    req.params.id,
    req.body,
    req.user.id,
  );
  sendSuccess(res, { message: "Đã cập nhật quy tắc", data: { rule } });
});

export const restoreEmailAutomationRules = catchAsync(async (req, res) => {
  const svc = await import("../services/emailAutomation.service.js");
  const rules = await svc.restoreDefaultAutomationRules(req.user.id);
  sendSuccess(res, {
    message: "Đã khôi phục quy tắc mặc định IU CLUB",
    data: { rules },
  });
});
