import { buildExportMatrix } from "../../src/services/export.service.js";

const form = {
  fields: [
    { fieldId: "full_name", label: "Họ tên", isFixed: true },
    { fieldId: "q_motivation", label: "Lý do ứng tuyển", type: "text_long", isFixed: false },
    { fieldId: "q_shift", label: "Ca rảnh", type: "multi_choice", isFixed: false },
  ],
};
const applications = [
  {
    _id: "a1", fullName: "Nguyễn A", email: "a@x.com", phone: "0900",
    status: "admitted", assignedDepartment: "Ban Truyền thông",
    departmentPreferences: [{ department: "Ban Sự kiện", priority: 1 }],
    cvScore: 85, submittedAt: "2026-08-01T10:00:00Z",
    answers: [
      { fieldId: "q_motivation", value: "Mình thích CLB" },
      { fieldId: "q_shift", value: ["Sáng", "Tối"] },
    ],
  },
];

test("headers + rows đúng thứ tự cột hồ sơ rồi tới câu hỏi", () => {
  const { headers, rows } = buildExportMatrix({
    campaignName: "Đợt 2026",
    form, applications,
    columns: ["fullName", "status", "department", "totalScore"],
    questionFieldIds: ["q_motivation", "q_shift"],
  });
  expect(headers).toEqual(["Họ và tên", "Trạng thái", "Ban nguyện vọng", "Điểm ĐG", "Lý do ứng tuyển", "Ca rảnh"]);
  expect(rows[0]).toEqual(["Nguyễn A", "Trúng tuyển", "Ban Truyền thông", "8.5", "Mình thích CLB", "Sáng, Tối"]);
});

test("loại key cột lạ và fieldId không có trong form", () => {
  const { headers } = buildExportMatrix({
    campaignName: "X", form, applications,
    columns: ["fullName", "hacker_col"],
    questionFieldIds: ["q_motivation", "full_name", "khong_ton_tai"],
  });
  // hacker_col bị bỏ; full_name là fixed nên bị bỏ; khong_ton_tai bị bỏ
  expect(headers).toEqual(["Họ và tên", "Lý do ứng tuyển"]);
});
