import { celebrate, Joi, Segments } from "celebrate";

const departmentPreferenceSchema = Joi.object({
  department: Joi.string().trim().required().messages({
    "any.required": "Tên ban (department) là bắt buộc",
  }),
  priority: Joi.number().integer().min(1).max(3).required().messages({
    "number.min": "Thứ tự ưu tiên nhỏ nhất là 1",
    "number.max": "Thứ tự ưu tiên lớn nhất là 3",
    "any.required": "Thứ tự ưu tiên (priority) là bắt buộc",
  }),
});

const answerSchema = Joi.object({
  fieldId: Joi.string().trim().required(),
  value: Joi.any(),
});

export const saveDraft = celebrate({
  [Segments.BODY]: Joi.object({
    campaignId: Joi.string().hex().length(24).required().messages({
      "string.length":
        "ID đợt tuyển (campaignId) không đúng định dạng ObjectId",
      "any.required": "campaignId là bắt buộc",
    }),

    email: Joi.string().email().lowercase().trim().required().messages({
      "string.email": "Email không hợp lệ",
      "any.required": "Email là bắt buộc",
    }),

    fullName: Joi.string().trim().allow("").optional(),
    studentId: Joi.string().trim().allow("").optional(),
    className: Joi.string().trim().allow("").optional(),
    faculty: Joi.string().trim().allow("").optional(),

    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .allow("")
      .optional()
      .messages({
        "string.pattern.base": "Số điện thoại phải có đúng 10 chữ số",
      }),

    dateOfBirth: Joi.date().iso().max("now").optional().messages({
      "date.max": "Ngày sinh không được là ngày trong tương lai",
    }),

    avatarUrl: Joi.string().allow("").optional(),
    cvUrl: Joi.string().allow("").optional(),

    departmentPreferences: Joi.array()
      .items(departmentPreferenceSchema)
      .max(3)
      .unique("priority")
      .optional()
      .messages({
        "array.max": "Tối đa chỉ được chọn 3 ban nguyện vọng",
        "array.unique": "Thứ tự ưu tiên các ban không được trùng nhau",
      }),

    answers: Joi.array().items(answerSchema).optional(),
  }),
});

export const submitApplication = celebrate({
  [Segments.BODY]: Joi.object({
    campaignId: Joi.string().hex().length(24).required().messages({
      "string.length":
        "ID đợt tuyển (campaignId) không đúng định dạng ObjectId",
      "any.required": "campaignId là bắt buộc",
    }),

    email: Joi.string().email().lowercase().trim().required().messages({
      "string.email": "Email không đúng định dạng",
      "any.required": "Email là bắt buộc",
    }),

    fullName: Joi.string().trim().required().messages({
      "any.required": "Họ và tên là bắt buộc khi submit hồ sơ",
    }),

    studentId: Joi.string().trim().required().messages({
      "any.required": "Mã số sinh viên là bắt buộc khi submit hồ sơ",
    }),

    className: Joi.string().trim().required().messages({
      "any.required": "Lớp là bắt buộc khi submit hồ sơ",
    }),

    faculty: Joi.string().trim().required().messages({
      "any.required": "Khoa/Ngành là bắt buộc khi submit hồ sơ",
    }),

    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required()
      .messages({
        "string.pattern.base": "Số điện thoại phải có đúng 10 chữ số",
        "any.required": "Số điện thoại là bắt buộc khi submit hồ sơ",
      }),

    dateOfBirth: Joi.date().iso().max("now").required().messages({
      "date.max": "Ngày sinh không được là ngày trong tương lai",
      "any.required": "Ngày sinh là bắt buộc khi submit hồ sơ",
    }),

    avatarUrl: Joi.string().uri().required().messages({
      "string.uri": "Avatar URL phải là một đường dẫn URI hợp lệ",
      "any.required": "Ảnh đại diện (avatarUrl) là bắt buộc khi submit hồ sơ",
    }),

    cvUrl: Joi.string().uri().required().messages({
      "string.uri": "CV URL phải là một đường dẫn URI hợp lệ",
      "any.required": "File CV (cvUrl) là bắt buộc khi submit hồ sơ",
    }),

    departmentPreferences: Joi.array()
      .items(departmentPreferenceSchema)
      .min(1)
      .max(3)
      .unique("priority")
      .required()
      .messages({
        "array.min": "Phải chọn ít nhất 1 ban nguyện vọng",
        "array.max": "Tối đa chỉ được chọn 3 ban nguyện vọng",
        "array.unique": "Thứ tự ưu tiên các ban không được trùng nhau",
        "any.required": "Danh sách ban nguyện vọng là bắt buộc",
      }),

    answers: Joi.array().items(answerSchema).optional(),
  }),
});

export const editApplication = celebrate({
  [Segments.BODY]: Joi.object({
    fullName: Joi.string().trim().required(),
    studentId: Joi.string().trim().required(),
    className: Joi.string().trim().required(),
    faculty: Joi.string().trim().required(),

    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required()
      .messages({
        "string.pattern.base": "Số điện thoại phải có đúng 10 chữ số",
      }),

    dateOfBirth: Joi.date().iso().max("now").required(),

    // Cho phép optional khi chỉnh sửa (nếu ứng viên giữ nguyên file đã upload trước đó)
    avatarUrl: Joi.string().uri().optional(),
    cvUrl: Joi.string().uri().optional(),

    departmentPreferences: Joi.array()
      .items(departmentPreferenceSchema)
      .min(1)
      .max(3)
      .unique("priority")
      .required(),

    answers: Joi.array().items(answerSchema).optional(),
  }),
});
