import mongoose from "mongoose";

export const CAMPAIGN_STATUS = ["draft", "open", "closed", "completed"];

const quotaSchema = new mongoose.Schema(
  {
    // Tên ban/đội tuyển nhận chỉ tiêu (VD: Ban Truyền thông, Ban Chuyên môn...)
    department: { type: String, required: true, trim: true },

    // Số lượng chỉ tiêu tuyển tối thiểu 1
    quota: {
      type: Number,
      required: true,
      min: [1, "Chỉ tiêu tối thiểu là 1"],
    },
  },
  { _id: false },
);

const recruitmentCampaignSchema = new mongoose.Schema(
  {
    // Tên đợt tuyển (VD: "Tuyển thành viên Kỳ Fall 2026")
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, "Tên đợt tuyển không được vượt quá 200 ký tự"],
    },

    // Mô tả chi tiết đợt tuyển
    description: { type: String, default: "" },

    // Thời gian mở nhận đơn đăng ký
    openAt: { type: Date, required: true },

    // Thời gian đóng nhận đơn đăng ký (phải lớn hơn openAt)
    closeAt: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return !this.openAt || value > this.openAt;
        },
        message: "Thời gian đóng (closeAt) phải lớn hơn thời gian mở (openAt)",
      },
    },

    // Danh sách chỉ tiêu tuyển theo từng ban
    quotas: {
      type: [quotaSchema],
      required: true,
      validate: [
        {
          validator: function (quotas) {
            return Array.isArray(quotas) && quotas.length > 0;
          },
          message: "Danh sách quotas phải có ít nhất 1 ban",
        },
        {
          validator: function (quotas) {
            if (!Array.isArray(quotas)) return true;
            const departments = quotas.map((q) => q.department);
            return new Set(departments).size === departments.length;
          },
          message:
            "Không được chứa 2 chỉ tiêu trùng ban (department) trong cùng một đợt tuyển",
        },
      ],
    },

    // Trạng thái của đợt tuyển
    status: {
      type: String,
      enum: CAMPAIGN_STATUS,
      default: "draft",
    },

    // ID của thành viên Ban chủ nhiệm (User) tạo đợt tuyển
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, collection: "recruitment_campaigns" },
);

// Indexes
recruitmentCampaignSchema.index({ status: 1 });
recruitmentCampaignSchema.index({ "quotas.department": 1, status: 1 });

/**
 * Static method kiểm tra sự chồng lấn thời gian của các đợt tuyển đang 'open'
 * có chứa ít nhất 1 department chung.
 *
 * @param {string|string[]} departments Danh sách tên ban muốn kiểm tra
 * @param {Date} openAt Thời gian mở
 * @param {Date} closeAt Thời gian đóng
 * @param {string|ObjectId} [excludeId] ID đợt tuyển cần loại trừ (dùng cho update)
 * @returns {Promise<boolean>} true nếu có chồng lấn (overlap), false nếu hợp lệ
 */
recruitmentCampaignSchema.statics.checkOverlap = async function (
  departments,
  openAt,
  closeAt,
  excludeId = null,
) {
  const deptArray = Array.isArray(departments) ? departments : [departments];

  const query = {
    status: "open",
    "quotas.department": { $in: deptArray },
    // Công thức overlap 2 khoảng thời gian [A1, A2] và [B1, B2]: A1 < B2 AND A2 > B1
    openAt: { $lt: new Date(closeAt) },
    closeAt: { $gt: new Date(openAt) },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existingOverlap = await this.findOne(query);
  return Boolean(existingOverlap);
};

const RecruitmentCampaign = mongoose.model(
  "RecruitmentCampaign",
  recruitmentCampaignSchema,
);

export default RecruitmentCampaign;
