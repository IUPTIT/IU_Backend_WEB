import { celebrate, Joi, Segments } from "celebrate";
import { SCORE_ROUNDS, ATTENDANCE_STATUS } from "../models/applicationScore.model.js";

const criterionScoreSchema = Joi.object({
  criterion: Joi.string().trim().required().messages({
    "any.required": "Tên tiêu chí (criterion) là bắt buộc",
  }),

  weight: Joi.number().min(0).max(100).required().messages({
    "number.min": "Trọng số không được nhỏ hơn 0",
    "number.max": "Trọng số không được lớn hơn 100",
    "any.required": "Trọng số (weight) là bắt buộc",
  }),

  score: Joi.number().min(0).max(100).required().messages({
    "number.min": "Điểm không được nhỏ hơn 0",
    "number.max": "Điểm không được lớn hơn 100",
    "any.required": "Điểm số (score) là bắt buộc",
  }),
});

export const createScore = celebrate({
  [Segments.BODY]: Joi.object({
    applicationId: Joi.string().hex().length(24).required().messages({
      "string.length": "applicationId không đúng định dạng ObjectId",
      "any.required": "applicationId là bắt buộc",
    }),

    round: Joi.string()
      .valid(...SCORE_ROUNDS)
      .required()
      .messages({
        "any.only": `Vòng chấm điểm (round) phải là một trong: ${SCORE_ROUNDS.join(", ")}`,
        "any.required": "Vòng chấm điểm (round) là bắt buộc",
      }),

    criteriaScores: Joi.array()
      .items(criterionScoreSchema)
      .min(1)
      .custom((value, helpers) => {
        const sumWeight = value.reduce((sum, item) => sum + item.weight, 0);
        if (Math.abs(sumWeight - 100) > 0.01) {
          return helpers.message(
            "Tổng trọng số (weight) của các tiêu chí phải bằng 100",
          );
        }
        return value;
      })
      .required()
      .messages({
        "array.min": "Phải có ít nhất 1 tiêu chí chấm điểm",
        "any.required": "Danh sách criteriaScores là bắt buộc",
      }),

    comment: Joi.string().allow("").optional(),

    attendance: Joi.when("round", {
      is: "interview",
      then: Joi.string()
        .valid(...ATTENDANCE_STATUS)
        .required()
        .messages({
          "any.only": `Điểm danh phải là một trong: ${ATTENDANCE_STATUS.join(", ")}`,
          "any.required": "Điểm danh (attendance) là bắt buộc khi chấm điểm vòng phỏng vấn",
        }),
      otherwise: Joi.valid(null).optional().messages({
        "any.only": "Không được nhập điểm danh (attendance) cho vòng đơn (cv)",
      }),
    }),
  }),
});
