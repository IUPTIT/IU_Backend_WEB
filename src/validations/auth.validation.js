import { celebrate, Joi, Segments } from "celebrate";
import { personName, phoneVNOptional } from "./common.validation.js";

const email = Joi.string().email().lowercase().required();
const password = Joi.string().min(8).max(128).required();

export const registerValidator = celebrate({
  [Segments.BODY]: Joi.object({
    name: personName.required(),
    email,
    password,
  }),
});

export const verifyEmailValidator = celebrate({
  [Segments.BODY]: Joi.object({
    email,
    otp: Joi.string()
      .pattern(/^\d{6}$/)
      .required(),
  }),
});

export const resendOtpValidator = celebrate({
  [Segments.BODY]: Joi.object({ email }),
});

export const loginValidator = celebrate({
  [Segments.BODY]: Joi.object({
    email,
    password: Joi.string().required(),
  }),
});

export const changePasswordValidator = celebrate({
  [Segments.BODY]: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: password,
  }),
});

export const updateProfileValidator = celebrate({
  [Segments.BODY]: Joi.object({
    name: personName,
    phone: phoneVNOptional,
    bio: Joi.string().trim().allow("").max(200),
    // Ảnh đại diện gửi lên dạng data URL hoặc URL
    avatar: Joi.string().allow("").max(4 * 1024 * 1024),
  }).min(1),
});

export const forgotPasswordValidator = celebrate({
  [Segments.BODY]: Joi.object({ email }),
});

export const resetPasswordValidator = celebrate({
  [Segments.BODY]: Joi.object({
    token: Joi.string().required(),
    password,
  }),
});
