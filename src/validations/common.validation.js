import { celebrate, Joi, Segments } from "celebrate";

export const objectId = Joi.string().hex().length(24).messages({
  "string.hex": "ID không đúng định dạng ObjectId",
  "string.length": "ID không đúng định dạng ObjectId",
});

/** Họ tên: 2–100 ký tự (dùng chung auth / hồ sơ / admin). */
export const personName = Joi.string().trim().min(2).max(100).messages({
  "string.min": "Họ tên phải có ít nhất 2 ký tự",
  "string.max": "Họ tên tối đa 100 ký tự",
});

/** SĐT VN: 0 + 9 chữ số (vd 0982145994). */
export const phoneVN = Joi.string()
  .trim()
  .pattern(/^0\d{9}$/)
  .messages({
    "string.pattern.base": "Số điện thoại phải gồm 10 số và bắt đầu bằng 0",
  });

export const phoneVNOptional = phoneVN.allow("", null);

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
