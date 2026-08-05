import mongoose from "mongoose";

/**
 * Counter dùng để cấp số thứ tự tăng dần một cách atomic (findOneAndUpdate + $inc),
 * tránh race condition khi hai request cùng sinh mã (VD: applicationCode).
 * _id là khoá của dãy số, VD "applicationCode:<campaignId>:APP-2026F".
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { collection: "counters", versionKey: false },
);

counterSchema.statics.nextSeq = async function (key) {
  const counter = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return counter.seq;
};

const Counter = mongoose.model("Counter", counterSchema);

export default Counter;
