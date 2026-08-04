import mongoose from "mongoose";

export const SCORE_ROUNDS = ["cv", "interview"];
export const ATTENDANCE_STATUS = ["present", "absent"];

const criterionScoreSchema = new mongoose.Schema(
  {
    // Tên tiêu chí chấm (VD: "Độ phù hợp ban", "Kỹ năng giao tiếp"...)
    criterion: { type: String, required: true, trim: true },

    // Trọng số tiêu chí (0 - 100%)
    weight: {
      type: Number,
      required: true,
      min: [0, "Trọng số tối thiểu là 0"],
      max: [100, "Trọng số tối đa là 100"],
    },

    // Điểm số tiêu chí (0 - 100 điểm)
    score: {
      type: Number,
      required: true,
      min: [0, "Điểm tối thiểu là 0"],
      max: [100, "Điểm tối đa là 100"],
    },
  },
  { _id: false },
);

const applicationScoreSchema = new mongoose.Schema(
  {
    // ID hồ sơ ứng tuyển
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },

    // Vòng chấm điểm ('cv' hoặc 'interview')
    round: {
      type: String,
      enum: SCORE_ROUNDS,
      required: true,
    },

    // Người chấm điểm (User - BCN/Leader)
    scoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Danh sách điểm số theo từng tiêu chí
    criteriaScores: {
      type: [criterionScoreSchema],
      required: true,
      validate: [
        {
          validator: function (arr) {
            if (!Array.isArray(arr) || arr.length === 0) return false;
            const sumWeight = arr.reduce((sum, item) => sum + item.weight, 0);
            return Math.abs(sumWeight - 100) < 0.01;
          },
          message: "Tổng trọng số (weight) của các tiêu chí trong mảng phải bằng 100",
        },
      ],
    },

    // Điểm tổng kết (tính tự động = sum(weight/100 * score))
    totalScore: { type: Number, default: 0 },

    // Nhận xét chi tiết của người chấm
    comment: { type: String, default: "" },

    // Trạng thái điểm danh (chỉ dành cho vòng 'interview')
    attendance: {
      type: String,
      enum: [...ATTENDANCE_STATUS, null],
      default: null,
      validate: {
        validator: function (val) {
          if (this.round === "cv" && val !== null && val !== undefined) {
            return false;
          }
          return true;
        },
        message: "Chỉ được phép nhập điểm danh (attendance) cho vòng phỏng vấn (round='interview')",
      },
    },
  },
  { timestamps: true, collection: "application_scores" },
);

// Indexes
applicationScoreSchema.index(
  { applicationId: 1, round: 1, scoredBy: 1 },
  { unique: true },
);
applicationScoreSchema.index({ applicationId: 1, round: 1 });

/**
 * Pre-validate hook: Tự động tính điểm tổng kết totalScore trước khi lưu.
 */
applicationScoreSchema.pre("validate", function (next) {
  if (Array.isArray(this.criteriaScores) && this.criteriaScores.length > 0) {
    const calculatedTotal = this.criteriaScores.reduce((sum, item) => {
      const weightFactor = item.weight / 100;
      return sum + weightFactor * item.score;
    }, 0);
    this.totalScore = Number(calculatedTotal.toFixed(2));
  }
  next();
});

/**
 * Static method tính điểm trung bình và độ chênh lệch điểm số giữa các reviewers.
 *
 * @param {string|ObjectId} applicationId ID hồ sơ ứng tuyển
 * @param {string} round Vòng chấm ('cv' hoặc 'interview')
 * @returns {Promise<{ average: number, maxDiffPercent: number, count: number, scores: Array }>}
 */
applicationScoreSchema.statics.getAverageAndVariance = async function (
  applicationId,
  round,
) {
  const scores = await this.find({
    applicationId,
    round,
  }).populate("scoredBy", "name email role");

  if (!scores || scores.length === 0) {
    return {
      average: 0,
      maxDiffPercent: 0,
      count: 0,
      scores: [],
    };
  }

  const totalSum = scores.reduce((sum, doc) => sum + doc.totalScore, 0);
  const average = Number((totalSum / scores.length).toFixed(2));

  let maxDiffPercent = 0;
  if (scores.length >= 2) {
    const totalScores = scores.map((doc) => doc.totalScore);
    const maxScore = Math.max(...totalScores);
    const minScore = Math.min(...totalScores);
    const diff = maxScore - minScore;

    // Chênh lệch điểm % so với điểm trung bình (hoặc chênh lệch tuyệt đối trên thang 100)
    maxDiffPercent = average > 0 ? Number(((diff / average) * 100).toFixed(2)) : 0;
  }

  return {
    average,
    maxDiffPercent,
    count: scores.length,
    scores,
  };
};

const ApplicationScore = mongoose.model(
  "ApplicationScore",
  applicationScoreSchema,
);

export default ApplicationScore;
