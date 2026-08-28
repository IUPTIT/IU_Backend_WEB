import { connectDatabase, disconnectDatabase } from "../config/database.js";
import User from "../models/user.model.js";
import ClubDepartment from "../models/clubDepartment.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";
import ApplicationForm from "../models/applicationForm.model.js";
import { ensureDefaultTemplates } from "../services/emailTemplate.service.js";

async function main() {
  await connectDatabase();
  console.log("🚀 Bắt đầu khởi tạo dữ liệu mở đợt tuyển & form đăng ký...\n");

  // 1. Templates
  await ensureDefaultTemplates();
  console.log("✅ 1. Email templates đã được đồng bộ");

  // 2. Admin account
  let admin = await User.findOne({ email: "iuptit.com@gmail.com" });
  if (!admin) {
    admin = await User.create({
      name: "Admin BCN",
      email: "iuptit.com@gmail.com",
      password: "admin123456",
      roles: ["bcn"],
      clubStatus: "active",
      requirePasswordChange: false,
    });
    console.log("✅ 2. Tạo tài khoản Admin:", admin.email);
  } else {
    admin.password = "admin123456";
    admin.roles = ["bcn"];
    admin.requirePasswordChange = false;
    await admin.save();
    console.log("✅ 2. Cập nhật tài khoản Admin:", admin.email);
  }

  // 3. Departments
  const departmentsData = [
    { name: "Ban Chuyên môn", code: "BCM", description: "Lập trình, AI, Web, App", field: "Kỹ thuật", headcountTarget: 15 },
    { name: "Ban Truyền thông", code: "BTT", description: "Nội dung, Thiết kế, Media", field: "Truyền thông", headcountTarget: 10 },
    { name: "Ban Sự kiện", code: "BSK", description: "Tổ chức hoạt động, Workshop, Gala", field: "Sự kiện", headcountTarget: 8 },
    { name: "Ban Đối ngoại", code: "BDN", description: "Hợp tác đối tác, Tài trợ", field: "Đối ngoại", headcountTarget: 7 },
  ];

  const createdDepts = [];
  for (const d of departmentsData) {
    let dept = await ClubDepartment.findOne({ name: d.name });
    if (!dept) {
      dept = await ClubDepartment.create({ ...d, status: "active" });
    }
    createdDepts.push(dept);
  }
  console.log(`✅ 3. Khởi tạo ${createdDepts.length} Ban chuyên môn`);

  // 4. Clean old active campaign if needed
  await RecruitmentCampaign.deleteMany({});
  await ApplicationForm.deleteMany({});

  const now = new Date();
  const closeDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const campaign = await RecruitmentCampaign.create({
    name: "Đợt Tuyển Thành Viên Gen 2026 - IU CLUB",
    description: "Chào mừng các bạn sinh viên gia nhập đại gia đình IU CLUB mùa 2026! Cùng phát triển kỹ năng chuyên môn, kỹ năng mềm và bứt phá đam mê công nghệ.",
    openAt: now,
    closeAt: closeDate,
    status: "open",
    createdBy: admin._id,
    quotas: [
      { department: "Ban Chuyên môn", quota: 15 },
      { department: "Ban Truyền thông", quota: 10 },
      { department: "Ban Sự kiện", quota: 8 },
      { department: "Ban Đối ngoại", quota: 7 },
    ],
  });
  console.log(`✅ 4. Mở đợt tuyển thành công: "${campaign.name}" (ID: ${campaign._id})`);

  // 5. Create Application Form with fixed fields + custom questions
  const fixedFields = ApplicationForm.seedFixedFields(campaign.quotas);
  
  const customQuestions = [
    {
      fieldId: "gioi_thieu_ban_than",
      label: "Hãy giới thiệu đôi nét về bản thân và sở thích của bạn",
      type: "text_long",
      required: true,
      order: 9,
      isFixed: false,
    },
    {
      fieldId: "kinh_nghiem_du_an",
      label: "Bạn đã từng tham gia dự án, sự kiện hoặc hoạt động ngoại khóa nào chưa?",
      type: "text_long",
      required: false,
      order: 10,
      isFixed: false,
    },
    {
      fieldId: "ky_nang_noi_bat",
      label: "Kỹ năng bạn tự tin nhất là gì?",
      type: "single_choice",
      options: ["Lập trình (Frontend / Backend / Mobile)", "Thiết kế đồ họa (Figma, Photoshop, Canva)", "Viết nội dung (Content writing)", "Quản lý & Tổ chức sự kiện", "Giao tiếp & Thuyết trình"],
      required: true,
      order: 11,
      isFixed: false,
    },
    {
      fieldId: "muc_tieu_khi_vao_clb",
      label: "Mục tiêu lớn nhất của bạn khi gia nhập IU CLUB là gì?",
      type: "text_long",
      required: true,
      order: 12,
      isFixed: false,
    },
  ];

  const form = await ApplicationForm.create({
    campaignId: campaign._id,
    fields: [...fixedFields, ...customQuestions],
    isLocked: false,
  });

  console.log(`✅ 5. Khởi tạo Form đăng ký thành công (${form.fields.length} trường: 8 trường cố định + 4 câu hỏi chuyên môn)`);
  console.log("\n------------------------------------------------------------");
  console.log("🌐 LINK TRANG NỘP ĐƠN: http://localhost:5173/tuyen-thanh-vien");
  console.log("🌐 LINK ADMIN QUẢN LÝ:  http://localhost:5173/admin/recruitment/open");
  console.log("🔑 TÀI KHOẢN ADMIN:    iuptit.com@gmail.com / admin123456");
  console.log("------------------------------------------------------------\n");

  await disconnectDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Lỗi:", err);
  try {
    await disconnectDatabase();
  } catch (e) {
    console.error("Disconnect error:", e);
  }
  process.exit(1);
});
