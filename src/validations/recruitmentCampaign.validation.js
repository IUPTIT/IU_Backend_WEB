import { celebrate, Joi, Segments } from "celebrate";

export const createCampaign = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().max(200).required().messages({
      "string.max": "Tên đợt tuyển không được vượt quá 200 ký tự",
      "any.required": "Tên đợt tuyển là bắt buộc",
    }),

    description: Joi.string().allow("").optional(),

    openAt: Joi.date().iso().required().messages({
      "any.required": "Thời gian mở đợt tuyển (openAt) là bắt buộc",
    }),

    closeAt: Joi.date().iso().greater(Joi.ref("openAt")).required().messages({
      "date.greater":
        "Thời gian đóng (closeAt) phải lớn hơn thời gian mở (openAt)",
      "any.required": "Thời gian đóng đợt tuyển (closeAt) là bắt buộc",
    }),

    quotas: Joi.array()
      .items(
        Joi.object({
          department: Joi.string().trim().required().messages({
            "any.required": "Tên ban (department) là bắt buộc",
          }),
          quota: Joi.number().integer().min(1).required().messages({
            "number.min": "Chỉ tiêu tuyển của ban phải lớn hơn hoặc bằng 1",
            "any.required": "Chỉ tiêu tuyển (quota) là bắt buộc",
          }),
        }),
      )
      .min(1)
      .unique("department")
      .required()
      .messages({
        "array.min": "Đợt tuyển phải có ít nhất 1 ban",
        "array.unique":
          "Không được chứa 2 chỉ tiêu trùng ban trong cùng một đợt tuyển",
        "any.required": "Danh sách quotas là bắt buộc",
      }),
  }),
});

export const updateCampaignAfterPublish = celebrate({
  [Segments.BODY]: Joi.object({
    closeAt: Joi.date().iso().optional(),

    quotas: Joi.array()
      .items(
        Joi.object({
          department: Joi.string().trim().required(),
          quota: Joi.number().integer().min(1).required(),
        }),
      )
      .min(1)
      .unique("department")
      .optional()
      .messages({
        "array.min": "Đợt tuyển phải có ít nhất 1 ban",
        "array.unique":
          "Không được chứa 2 chỉ tiêu trùng ban trong cùng một đợt tuyển",
      }),
  })
    .min(1)
    .messages({
      "object.min":
        "Cần cung cấp ít nhất 1 trường (closeAt hoặc quotas) để cập nhật",
    }),
});
