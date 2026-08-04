import { celebrate, Joi, Segments } from "celebrate";
import { FIELD_TYPES } from "../models/applicationForm.model.js";

const fieldSchema = Joi.object({
  fieldId: Joi.string().trim().required().messages({
    "any.required": "fieldId là bắt buộc",
  }),

  label: Joi.string().trim().required().messages({
    "any.required": "label là bắt buộc",
  }),

  type: Joi.string()
    .valid(...FIELD_TYPES)
    .required()
    .messages({
      "any.only": `Loại trường (type) phải là một trong: ${FIELD_TYPES.join(", ")}`,
      "any.required": "type là bắt buộc",
    }),

  required: Joi.boolean().default(true),

  order: Joi.number().integer().min(1).required().messages({
    "number.min": "Thứ tự (order) phải là số nguyên dương >= 1",
    "any.required": "order là bắt buộc",
  }),

  options: Joi.array()
    .items(Joi.string().trim().required())
    .when("type", {
      is: Joi.valid("single_choice", "multi_choice"),
      then: Joi.array().min(1).required().messages({
        "array.min": "Các trường dạng lựa chọn (single_choice/multi_choice) phải có ít nhất 1 option",
        "any.required": "options là bắt buộc đối với trường dạng lựa chọn",
      }),
      otherwise: Joi.forbidden().messages({
        "any.unknown": "Chỉ các trường single_choice và multi_choice mới được cung cấp options",
      }),
    }),

  isFixed: Joi.boolean().default(false),
});

export const updateForm = celebrate({
  [Segments.BODY]: Joi.object({
    fields: Joi.array()
      .items(fieldSchema)
      .min(1)
      .unique("fieldId")
      .required()
      .messages({
        "array.min": "Form phải có ít nhất 1 field",
        "array.unique": "Các fieldId trong danh sách không được trùng lặp",
        "any.required": "Danh sách fields là bắt buộc",
      }),
  }),
});
