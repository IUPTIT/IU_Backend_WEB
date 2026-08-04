import { celebrate, Joi, Segments } from "celebrate";

export const objectId = Joi.string().hex().length(24).messages({
  "string.hex": "ID không đúng định dạng ObjectId",
  "string.length": "ID không đúng định dạng ObjectId",
});

export const idParam = celebrate({
  [Segments.PARAMS]: Joi.object({ id: objectId.required() }),
});

export const tokenParam = celebrate({
  [Segments.PARAMS]: Joi.object({
    token: Joi.string().hex().length(64).required().messages({
      "string.hex": "Token không hợp lệ",
      "string.length": "Token không hợp lệ",
    }),
  }),
});

export const codeParam = celebrate({
  [Segments.PARAMS]: Joi.object({
    code: Joi.string()
      .trim()
      .uppercase()
      .pattern(/^APP-\d{4}[FS]-\d{4}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Mã hồ sơ không đúng định dạng (VD: APP-2026F-0142)",
      }),
  }),
});
