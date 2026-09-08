import { celebrate, Joi, Segments } from "celebrate";
import { personName, phoneVN, phoneVNOptional } from "./common.validation.js";

// Tra cứu: cần ít nhất email hoặc code (nghiệp vụ 1.5)
export const lookup = celebrate({
  [Segments.QUERY]: Joi.object({
    email: Joi.string().email().lowercase().trim(),
    code: Joi.string().trim().uppercase(),
  })
    .or("email", "code")
    .messages({
      "object.missing": "Cần cung cấp email hoặc mã hồ sơ (code) để tra cứu",
    }),
});

const departmentPreferenceSchema = Joi.object({
  department: Joi.string().trim().required(),
  priority: Joi.number().integer().min(1).max(2).required(),
});

const answerSchema = Joi.object({
  fieldId: Joi.string().trim().required(),
  value: Joi.any(),
});

// Sửa hồ sơ đã nộp: body = email xác nhận chủ hồ sơ + các trường được sửa
export const editWithEmail = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required().messages({
      "any.required": "Email xác nhận chủ hồ sơ là bắt buộc",
    }),
    fullName: personName,
    studentId: Joi.string().trim(),
    className: Joi.string().trim(),
    faculty: Joi.string().trim(),
    phone: phoneVN,
    dateOfBirth: Joi.date().iso().max("now"),
    departmentPreferences: Joi.array()
      .items(departmentPreferenceSchema)
      .min(1)
      .max(2)
      .unique("priority"),
    answers: Joi.array().items(answerSchema),
  })
    .min(2)
    .messages({
      "object.min": "Cần ít nhất 1 trường để cập nhật ngoài email",
    }),
});

export const withdraw = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
  }),
});

// Cập nhật đơn nháp qua token — mọi trường optional
export const updateDraftBody = celebrate({
  [Segments.BODY]: Joi.object({
    fullName: Joi.string().trim().allow(""),
    studentId: Joi.string().trim().allow(""),
    className: Joi.string().trim().allow(""),
    faculty: Joi.string().trim().allow(""),
    phone: phoneVNOptional,
    dateOfBirth: Joi.date().iso().max("now"),
    departmentPreferences: Joi.array()
      .items(departmentPreferenceSchema)
      .max(2)
      .unique("priority"),
    answers: Joi.array().items(answerSchema),
  }).min(1),
});
