import { celebrate, Joi, Segments } from "celebrate";

// Tra cứu: cần ít nhất email hoặc code (nghiệp vụ 1.5)
export const lookup = celebrate({
  [Segments.QUERY]: Joi.object({
    email: Joi.string().email().lowercase().trim(),
    code: Joi.string().trim().uppercase(),
  }).or("email", "code").messages({
    "object.missing": "Cần cung cấp email hoặc mã hồ sơ (code) để tra cứu",
  }),
});

const departmentPreferenceSchema = Joi.object({
  department: Joi.string().trim().required(),
  priority: Joi.number().integer().min(1).max(3).required(),
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
    fullName: Joi.string().trim(),
    studentId: Joi.string().trim(),
    className: Joi.string().trim(),
    faculty: Joi.string().trim(),
    phone: Joi.string().pattern(/^[0-9]{10}$/).messages({
      "string.pattern.base": "Số điện thoại phải có đúng 10 chữ số",
    }),
    dateOfBirth: Joi.date().iso().max("now"),
    avatarUrl: Joi.string().uri(),
    cvUrl: Joi.string().uri(),
    departmentPreferences: Joi.array()
      .items(departmentPreferenceSchema)
      .min(1)
      .max(3)
      .unique("priority"),
    answers: Joi.array().items(answerSchema),
  }).min(2).messages({
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
    phone: Joi.string().pattern(/^[0-9]{10}$/).allow(""),
    dateOfBirth: Joi.date().iso().max("now"),
    avatarUrl: Joi.string().allow(""),
    cvUrl: Joi.string().allow(""),
    departmentPreferences: Joi.array()
      .items(departmentPreferenceSchema)
      .max(3)
      .unique("priority"),
    answers: Joi.array().items(answerSchema),
  }).min(1),
});
