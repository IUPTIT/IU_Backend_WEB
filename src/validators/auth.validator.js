import { celebrate, Joi, Segments } from "celebrate";

const email = Joi.string().email().lowercase().required();
const password = Joi.string().min(8).max(128).required();

export const registerValidator = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().min(2).max(100).required(),
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

export const forgotPasswordValidator = celebrate({
  [Segments.BODY]: Joi.object({ email }),
});

export const resetPasswordValidator = celebrate({
  [Segments.BODY]: Joi.object({
    email,
    token: Joi.string().required(),
    password,
  }),
});
