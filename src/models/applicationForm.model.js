import mongoose from "mongoose";

export const FIELD_TYPES = [
  "text_short",
  "text_long",
  "single_choice",
  "multi_choice",
  "file_upload",
  "scale",
];

const formFieldSchema = new mongoose.Schema(
  {
    // Slug nhận diện duy nhất cho trường trong mảng (VD: 'full_name', 'custom_question_1')
    fieldId: { type: String, required: true, trim: true },

    // Nhãn hiển thị cho trường (VD: "Họ và tên", "Kinh nghiệm làm việc")
    label: { type: String, required: true, trim: true },

    // Loại trường nhập liệu
    type: { type: String, enum: FIELD_TYPES, required: true },

    // Bắt buộc nhập hay không
    required: { type: Boolean, default: true },

    // Thứ tự hiển thị trong form (1, 2, 3...)
    order: { type: Number, required: true },

    // Danh sách các lựa chọn (chỉ dành cho single_choice và multi_choice)
    options: { type: [String], default: undefined },

    // true = Trường hệ thống cố định, không được xóa/sửa tên slug
    isFixed: { type: Boolean, default: false },
  },
  { _id: false },
);

const applicationFormSchema = new mongoose.Schema(
  {
    // ID đợt tuyển tương ứng (1-1 với RecruitmentCampaign)
    // unique qua schema.index() bên dưới — không khai báo tại field để tránh trùng index
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RecruitmentCampaign",
      required: true,
    },

    // Danh sách các trường trong form
    fields: {
      type: [formFieldSchema],
      required: true,
      validate: [
        {
          validator: function (fields) {
            if (!Array.isArray(fields)) return false;
            const fieldIds = fields.map((f) => f.fieldId);
            return new Set(fieldIds).size === fieldIds.length;
          },
          message: "Mảng fields không được chứa các fieldId bị trùng lặp",
        },
      ],
    },

    // Cờ khóa form (true khi đã có ít nhất 1 hồ sơ được nộp)
    isLocked: { type: Boolean, default: false },

    // Thời điểm xuất bản form công khai
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "application_forms" },
);

// Index 1-1 với campaignId
applicationFormSchema.index({ campaignId: 1 }, { unique: true });

/**
 * Static method trả về 10 trường cố định hệ thống (isFixed=true, required=true, order 1..10)
 *
 * @param {Array<{department: string}>} campaignQuotas Danh sách quotas của đợt tuyển để load động vào options ban nguyện vọng
 * @returns {Array<Object>} Mảng 10 field cố định
 */
applicationFormSchema.statics.seedFixedFields = function (campaignQuotas = []) {
  const departmentOptions = Array.isArray(campaignQuotas)
    ? campaignQuotas.map((q) => q.department)
    : [];

  return [
    {
      fieldId: "full_name",
      label: "Họ và tên",
      type: "text_short",
      required: true,
      order: 1,
      isFixed: true,
    },
    {
      fieldId: "student_id",
      label: "MSSV",
      type: "text_short",
      required: true,
      order: 2,
      isFixed: true,
    },
    {
      fieldId: "class_name",
      label: "Lớp",
      type: "text_short",
      required: true,
      order: 3,
      isFixed: true,
    },
    {
      fieldId: "faculty",
      label: "Khoa/Ngành",
      type: "text_short",
      required: true,
      order: 4,
      isFixed: true,
    },
    {
      fieldId: "email",
      label: "Email",
      type: "text_short",
      required: true,
      order: 5,
      isFixed: true,
    },
    {
      fieldId: "phone",
      label: "Số điện thoại",
      type: "text_short",
      required: true,
      order: 6,
      isFixed: true,
    },
    {
      fieldId: "date_of_birth",
      label: "Ngày sinh",
      type: "text_short",
      required: true,
      order: 7,
      isFixed: true,
      // ⚠️ GHI CHÚ QUAN TRỌNG: Ngày sinh dùng để sinh password ngầm định (DDMMYYYY)
      // cho tài khoản Ứng viên sau này, TUYỆT ĐỐI không được set required=false ở bất kỳ đợt tuyển nào.
    },
    {
      fieldId: "department_preferences",
      label: "Ban nguyện vọng",
      type: "multi_choice",
      required: true,
      order: 8,
      isFixed: true,
      // Load động từ danh sách department trong campaign quotas
      options: departmentOptions,
    },
  ];
};

/**
 * Pre-save hook kiểm tra ràng buộc nghiệp vụ:
 * 1. Không cho phép trường date_of_birth bị set required=false.
 * 2. Nếu isLocked === true, chặn mọi thay đổi cấu trúc mảng fields.
 */
applicationFormSchema.pre("save", async function (next) {
  // Check 1: Enforce required=true cho trường date_of_birth
  if (Array.isArray(this.fields)) {
    const dobField = this.fields.find((f) => f.fieldId === "date_of_birth");
    if (dobField && dobField.required === false) {
      return next(
        new Error(
          "Trường Ngày sinh (date_of_birth) bắt buộc phải có required=true để phục vụ sinh mật khẩu tài khoản.",
        ),
      );
    }
  }

  // Check 2: Chặn sửa mảng fields nếu form đã bị khoá (isLocked = true)
  if (!this.isNew && this.isLocked && this.isModified("fields")) {
    return next(
      new Error(
        "Form đăng ký đã bị khóa (isLocked=true) do đã có hồ sơ nộp. Không được phép chỉnh sửa mảng fields.",
      ),
    );
  }

  return next();
});

const ApplicationForm = mongoose.model(
  "ApplicationForm",
  applicationFormSchema,
);

export default ApplicationForm;
