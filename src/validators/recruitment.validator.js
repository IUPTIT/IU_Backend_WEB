import { celebrate, Joi, Segments } from "celebrate";
import { QUESTION_TYPES } from "../models/campaign.model.js";

const objectId = Joi.string().hex().length(24);

const question = Joi.object({
  label: Joi.string().min(3).max(500).required(),
  type: Joi.string()
    .valid(...QUESTION_TYPES)
    .required(),
  options: Joi.array().items(Joi.string().max(200)).when("type", {
    is: Joi.valid("single_choice", "multi_choice"),
    then: Joi.array().min(2).required(),
    otherwise: Joi.optional(),
  }),
  required: Joi.boolean().default(false),
  order: Joi.number().integer().min(0).default(0),
});

const quota = Joi.object({
  team: Joi.string().min(2).max(100).required(),
  count: Joi.number().integer().min(1).required(),
});

export const createCampaignValidator = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().min(3).max(200).required(),
    description: Joi.string().allow("").max(5000),
    openAt: Joi.date().iso().required(),
    closeAt: Joi.date().iso().required(),
    quotas: Joi.array().items(quota).min(1).required(),
    customQuestions: Joi.array().items(question).default([]),
  }),
});

export const updateCampaignValidator = celebrate({
  [Segments.PARAMS]: Joi.object({ id: objectId.required() }),
  [Segments.BODY]: Joi.object({
    name: Joi.string().min(3).max(200),
    description: Joi.string().allow("").max(5000),
    openAt: Joi.date().iso(),
    closeAt: Joi.date().iso(),
    quotas: Joi.array().items(quota).min(1),
    customQuestions: Joi.array().items(question),
  }).min(1),
});

export const campaignIdValidator = celebrate({
  [Segments.PARAMS]: Joi.object({ id: objectId.required() }),
});

// 18 tuổi trở xuống 100: chặn ngày tương lai + tuổi tối thiểu 16
const dateOfBirth = Joi.date()
  .iso()
  .max("now")
  .custom((value, helpers) => {
    const age = (Date.now() - value.getTime()) / (365.25 * 86_400_000);
    if (age < 16) return helpers.error("any.invalid");
    return value;
  })
  .messages({ "any.invalid": "Applicant must be at least 16 years old" })
  .required();

const applicationFields = {
  fullName: Joi.string().min(2).max(100),
  studentId: Joi.string().min(3).max(30),
  className: Joi.string().min(1).max(50),
  faculty: Joi.string().min(2).max(150),
  phone: Joi.string().pattern(/^0\d{9}$/),
  nationalId: Joi.string().pattern(/^\d{12}$/),
  avatarUrl: Joi.string().allow("").max(1000),
  cvUrl: Joi.string().allow("").max(1000),
  wishes: Joi.array().items(Joi.string().max(100)).min(1).max(3),
  answers: Joi.object().pattern(Joi.string(), [
    Joi.string().allow("").max(5000),
    Joi.array().items(Joi.string().max(500)),
  ]),
};

export const submitApplicationValidator = celebrate({
  [Segments.BODY]: Joi.object({
    fullName: applicationFields.fullName.required(),
    studentId: applicationFields.studentId.required(),
    className: applicationFields.className.required(),
    faculty: applicationFields.faculty.required(),
    email: Joi.string().email().lowercase().required(),
    phone: applicationFields.phone.required(),
    nationalId: applicationFields.nationalId.required(),
    dateOfBirth,
    avatarUrl: applicationFields.avatarUrl,
    cvUrl: applicationFields.cvUrl,
    wishes: applicationFields.wishes.required(),
    answers: applicationFields.answers.default({}),
  }),
});

export const lookupValidator = celebrate({
  [Segments.QUERY]: Joi.object({
    query: Joi.string().min(3).max(200).required(),
  }),
});

export const updateApplicationValidator = celebrate({
  [Segments.PARAMS]: Joi.object({ code: Joi.string().required() }),
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().required(), // xác nhận chủ hồ sơ
    fullName: applicationFields.fullName,
    studentId: applicationFields.studentId,
    className: applicationFields.className,
    faculty: applicationFields.faculty,
    phone: applicationFields.phone,
    nationalId: applicationFields.nationalId,
    dateOfBirth: Joi.date().iso().max("now"),
    avatarUrl: applicationFields.avatarUrl,
    cvUrl: applicationFields.cvUrl,
    wishes: applicationFields.wishes,
    answers: applicationFields.answers,
  }).min(2),
});

export const withdrawValidator = celebrate({
  [Segments.PARAMS]: Joi.object({ code: Joi.string().required() }),
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().required(),
  }),
});
