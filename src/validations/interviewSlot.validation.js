import { celebrate, Joi, Segments } from "celebrate";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Hàm helper so sánh 2 chuỗi giờ HH:mm
 */
function isEndTimeAfterStartTime(startTime, endTime) {
  if (!startTime || !endTime) return true;
  const [h1, m1] = startTime.split(":").map(Number);
  const [h2, m2] = endTime.split(":").map(Number);
  return h2 * 60 + m2 > h1 * 60 + m1;
}

export const createSlot = celebrate({
  [Segments.BODY]: Joi.object({
    campaignId: Joi.string().hex().length(24).required().messages({
      "string.length": "campaignId không đúng định dạng ObjectId",
      "any.required": "campaignId là bắt buộc",
    }),

    date: Joi.date().iso().required().messages({
      "any.required": "Ngày phỏng vấn (date) là bắt buộc",
    }),

    startTime: Joi.string().pattern(TIME_REGEX).required().messages({
      "string.pattern.base": "startTime phải có định dạng HH:mm (VD: 09:00)",
      "any.required": "startTime là bắt buộc",
    }),

    endTime: Joi.string().pattern(TIME_REGEX).required().messages({
      "string.pattern.base": "endTime phải có định dạng HH:mm (VD: 09:30)",
      "any.required": "endTime là bắt buộc",
    }),

    location: Joi.string().trim().required().messages({
      "any.required": "Địa điểm / Link phỏng vấn (location) là bắt buộc",
    }),

    // Cho phép tạo ca trống — phân công người PV sau (AssignInterviewersModal).
    // Book/gán ứng viên vẫn bắt buộc ≥1 interviewer ở service.
    interviewerIds: Joi.array()
      .items(Joi.string().hex().length(24))
      .default([]),

    capacity: Joi.number().integer().min(1).required().messages({
      "number.min": "Sức chứa tối thiểu phải là 1",
      "any.required": "Sức chứa (capacity) là bắt buộc",
    }),
  }).custom((value, helpers) => {
    if (!isEndTimeAfterStartTime(value.startTime, value.endTime)) {
      return helpers.message("endTime phải lớn hơn startTime");
    }
    return value;
  }),
});

export const bulkGenerateSlots = celebrate({
  [Segments.BODY]: Joi.object({
    campaignId: Joi.string().hex().length(24).required().messages({
      "string.length": "campaignId không đúng định dạng ObjectId",
      "any.required": "campaignId là bắt buộc",
    }),

    dates: Joi.array().items(Joi.date().iso()).min(1).required().messages({
      "array.min": "Phải chọn ít nhất 1 ngày",
      "any.required": "Danh sách ngày (dates) là bắt buộc",
    }),

    startHour: Joi.number().integer().min(0).max(23).required().messages({
      "number.min": "startHour phải từ 0 đến 23",
      "number.max": "startHour phải từ 0 đến 23",
      "any.required": "startHour là bắt buộc",
    }),

    endHour: Joi.number()
      .integer()
      .min(1)
      .max(24)
      .greater(Joi.ref("startHour"))
      .required()
      .messages({
        "number.greater": "endHour phải lớn hơn startHour",
        "any.required": "endHour là bắt buộc",
      }),

    durationMinutes: Joi.number()
      .integer()
      .min(5)
      .max(480)
      .required()
      .messages({
        "number.min": "Thời lượng mỗi ca (durationMinutes) tối thiểu 5 phút",
        "number.max":
          "Thời lượng mỗi ca (durationMinutes) tối đa 480 phút (8 giờ)",
        "any.required": "durationMinutes là bắt buộc",
      }),

    capacity: Joi.number().integer().min(1).required().messages({
      "number.min": "Sức chứa tối thiểu phải là 1",
      "any.required": "capacity là bắt buộc",
    }),

    location: Joi.string().trim().required().messages({
      "any.required": "location là bắt buộc",
    }),

    interviewerIds: Joi.array()
      .items(Joi.string().hex().length(24))
      .default([]),
  }),
});
