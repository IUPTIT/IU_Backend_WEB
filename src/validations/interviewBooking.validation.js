import { celebrate, Joi, Segments } from "celebrate";

export const confirmBooking = celebrate({
  [Segments.BODY]: Joi.object({
    slotId: Joi.string().hex().length(24).required().messages({
      "string.length": "slotId không đúng định dạng ObjectId",
      "any.required": "slotId là bắt buộc",
    }),

    applicationId: Joi.string().hex().length(24).required().messages({
      "string.length": "applicationId không đúng định dạng ObjectId",
      "any.required": "applicationId là bắt buộc",
    }),
  }),
});

export const changeSlot = celebrate({
  [Segments.BODY]: Joi.object({
    newSlotId: Joi.string().hex().length(24).required().messages({
      "string.length": "newSlotId không đúng định dạng ObjectId",
      "any.required": "newSlotId là bắt buộc",
    }),
  }),
});
