import { Router } from "express";
import { celebrate, Joi, Segments } from "celebrate";
import authenticate from "../middlewares/authenticate.js";
import authorize from "../middlewares/authorize.js";
import requirePasswordChanged from "../middlewares/requirePasswordChanged.js";
import {
  idParam,
  objectId,
  personName,
  phoneVNOptional,
} from "../validations/common.validation.js";
import * as controller from "../controllers/admin.controller.js";

const router = Router();
const bcnOnly = authorize("bcn");

router.use(authenticate);
router.use(requirePasswordChanged);
router.use(bcnOnly);

const rosterRole = Joi.string().valid("member", "leader");
const accountRole = Joi.string().valid("member", "leader", "bcn", "admin");
const clubStatus = Joi.string().valid("active", "inactive", "alumni");

// ---- Quản lý thành viên (roster) ----
router.get("/members", controller.listMembers);
router.get("/members/unassigned", controller.listUnassignedMembers);
router.post(
  "/members",
  celebrate({
    [Segments.BODY]: Joi.object({
      name: personName,
      fullName: personName,
      email: Joi.string().email().required(),
      phone: phoneVNOptional,
      role: rosterRole.required(),
      department: Joi.string().allow("", null),
      departmentName: Joi.string().allow("", null),
      departmentId: objectId.allow(null),
      studentId: Joi.string().allow("", null),
      generation: Joi.string().allow("", null),
    }).or("name", "fullName"),
  }),
  controller.createMember,
);

const importRowSchema = Joi.object({
  rowIndex: Joi.number().integer().min(1),
  fullName: Joi.string().allow("", null),
  name: Joi.string().allow("", null),
  email: Joi.string().allow("", null),
  phone: Joi.string().allow("", null),
  studentId: Joi.string().allow("", null),
  generation: Joi.string().allow("", null),
  departmentName: Joi.string().allow("", null),
  department: Joi.string().allow("", null),
}).unknown(true);

router.post(
  "/members/import/validate",
  celebrate({
    [Segments.BODY]: Joi.object({
      rows: Joi.array().items(importRowSchema).required().max(500),
    }),
  }),
  controller.validateMemberImport,
);
router.post(
  "/members/import",
  celebrate({
    [Segments.BODY]: Joi.object({
      rows: Joi.array().items(importRowSchema).required().max(500),
      skipInvalid: Joi.boolean(),
    }),
  }),
  controller.importMembers,
);

router.patch(
  "/members/:id/role",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({ role: rosterRole.required() }),
  }),
  controller.updateMemberRole,
);
router.patch(
  "/members/:id/status",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      clubStatus,
      status: clubStatus,
    }).or("clubStatus", "status"),
  }),
  controller.updateMemberStatus,
);
router.patch(
  "/members/:id",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      name: personName,
      fullName: personName,
      email: Joi.string().email(),
      phone: phoneVNOptional,
      studentId: Joi.string().allow("", null),
      generation: Joi.string().allow("", null),
    }).min(1),
  }),
  controller.updateMemberInfo,
);
router.delete("/members/:id", idParam, controller.deleteMember);
router.post(
  "/members/:id/department",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      departmentId: objectId.required(),
      joinedAt: Joi.date().iso().allow(null),
      reason: Joi.string().allow("", null),
    }),
  }),
  controller.assignMemberDepartment,
);
router.delete(
  "/members/:id/department",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      reason: Joi.string().allow("", null),
    }).unknown(true),
  }),
  controller.removeMemberDepartment,
);
router.get(
  "/members/:id/department-history",
  idParam,
  controller.getMemberDepartmentHistory,
);

// ---- Phân quyền (portal accounts) ----
router.get("/accounts", controller.listAccounts);
router.post(
  "/accounts",
  celebrate({
    [Segments.BODY]: Joi.object({
      name: personName,
      fullName: personName,
      email: Joi.string().email().required(),
      role: accountRole.required(),
      department: Joi.string().allow("", null),
      departmentName: Joi.string().allow("", null),
      departmentId: objectId.allow(null),
      temporaryPassword: Joi.string().min(6).required(),
      isTrainingMember: Joi.boolean(),
      phone: phoneVNOptional,
    }).or("name", "fullName"),
  }),
  controller.createAccount,
);
router.patch(
  "/accounts/:id/role",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({ role: accountRole.required() }),
  }),
  controller.updateAccountRole,
);
router.post(
  "/accounts/:id/deactivate",
  celebrate({
    [Segments.PARAMS]: Joi.object({ id: objectId.required() }),
  }),
  controller.deactivateAccount,
);

// ---- Quản lý Ban (ClubDepartment) ----
router.get("/departments", controller.listDepartments);
router.get("/departments/leader-vacancies", controller.leaderVacancies);
router.post(
  "/departments",
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim().required(),
      code: Joi.string().trim().allow("", null),
      description: Joi.string().allow("", null),
      field: Joi.string().allow("", null),
      headcountTarget: Joi.number().integer().min(0).allow(null),
      status: Joi.string().valid("active", "paused"),
      sortOrder: Joi.number().integer(),
      memberIds: Joi.array().items(objectId).unique(),
      headUserId: objectId.allow(null),
    }),
  }),
  controller.createDepartment,
);
router.get("/departments/:id", idParam, controller.getDepartment);
router.patch(
  "/departments/:id",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim(),
      description: Joi.string().allow("", null),
      field: Joi.string().allow("", null),
      headcountTarget: Joi.number().integer().min(0).allow(null),
      status: Joi.string().valid("active", "paused"),
      sortOrder: Joi.number().integer(),
      memberIds: Joi.array().items(objectId).unique(),
      headUserId: objectId.allow(null),
    }).min(1),
  }),
  controller.updateDepartment,
);
router.delete("/departments/:id", idParam, controller.deleteDepartment);
router.get(
  "/departments/:id/members",
  idParam,
  controller.listDepartmentMembers,
);
router.post(
  "/departments/:id/leaders",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      userId: objectId.required(),
      title: Joi.string().valid("head"),
      startAt: Joi.date().iso().required(),
      endAt: Joi.date().iso().allow(null),
      termLabel: Joi.string().allow("", null),
      reason: Joi.string().allow("", null),
    }),
  }),
  controller.appointLeader,
);
router.post(
  "/departments/:id/leaders/:userId/revoke",
  celebrate({
    [Segments.PARAMS]: Joi.object({
      id: objectId.required(),
      userId: objectId.required(),
    }),
    [Segments.BODY]: Joi.object({
      reason: Joi.string().allow("", null),
    }).unknown(true),
  }),
  controller.revokeLeader,
);
router.get(
  "/departments/:id/leadership-history",
  idParam,
  controller.leadershipHistory,
);

router.post(
  "/emails/send",
  celebrate({
    [Segments.BODY]: Joi.object({
      messages: Joi.array()
        .items(
          Joi.object({
            to: Joi.string().email().required(),
            subject: Joi.string().trim().max(500).required(),
            html: Joi.string().allow("").required(),
            text: Joi.string().allow("", null),
          }),
        )
        .min(1)
        .max(200)
        .required(),
    }),
  }),
  controller.sendBulkEmails,
);

router.get("/dashboard/overview", controller.getDashboardOverview);

router.get(
  "/email-templates",
  celebrate({
    [Segments.QUERY]: Joi.object({
      category: Joi.string()
        .valid("recruitment", "training", "general", "event", "")
        .allow(null),
    }),
  }),
  controller.listEmailTemplates,
);
router.get("/email-templates/:id", idParam, controller.getEmailTemplate);
router.post(
  "/email-templates",
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim().max(200).required(),
      category: Joi.string()
        .valid("recruitment", "training", "general", "event")
        .default("general"),
      subject: Joi.string().trim().max(500).required(),
      body: Joi.string().allow("").default(""),
      status: Joi.string().valid("active", "inactive").default("active"),
      slug: Joi.string().trim().max(80).allow("", null),
    }),
  }),
  controller.createEmailTemplate,
);
router.patch(
  "/email-templates/:id",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim().max(200),
      category: Joi.string().valid(
        "recruitment",
        "training",
        "general",
        "event",
      ),
      subject: Joi.string().trim().max(500),
      body: Joi.string().allow(""),
      status: Joi.string().valid("active", "inactive"),
    }).min(1),
  }),
  controller.updateEmailTemplate,
);
router.delete("/email-templates/:id", idParam, controller.deleteEmailTemplate);

const automationTiming = Joi.string().valid(
  "immediate",
  "delay_after_event",
  "before_deadline",
  "before_slot",
);
const automationUnit = Joi.string().valid("days", "hours");

router.get("/email-automation-rules", controller.listEmailAutomationRules);
router.post(
  "/email-automation-rules/restore-defaults",
  controller.restoreEmailAutomationRules,
);
router.get(
  "/email-automation-rules/:id",
  idParam,
  controller.getEmailAutomationRule,
);
router.patch(
  "/email-automation-rules/:id",
  idParam,
  celebrate({
    [Segments.BODY]: Joi.object({
      name: Joi.string().trim().max(200),
      enabled: Joi.boolean(),
      templateSlug: Joi.string().trim().max(80),
      timing: automationTiming,
      timingValue: Joi.number().min(0),
      timingUnit: automationUnit,
      params: Joi.object().unknown(true),
    }).min(1),
  }),
  controller.updateEmailAutomationRule,
);

export default router;
