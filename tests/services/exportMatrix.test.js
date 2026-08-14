import { buildExportMatrix } from "../../src/services/export.service.js";

const form = {
  fields: [
    { fieldId: "full_name", label: "Họ tên", isFixed: true },
    {
      fieldId: "q_motivation",
      label: "Lý do ứng tuyển",
      type: "text_long",
      isFixed: false,
    },
    {
      fieldId: "q_shift",
      label: "Ca rảnh",
      type: "multi_choice",
      isFixed: false,
    },
  ],
};
const applications = [
  {
    _id: "a1",
    fullName: "Nguyễn A",
    email: "a@x.com",
    phone: "0900",
    status: "admitted",
    assignedDepartment: "Ban Truyền thông",
    departmentPreferences: [{ department: "Ban Sự kiện", priority: 1 }],
    cvScore: 85,
    submittedAt: "2026-08-01T10:00:00Z",
    answers: [
      { fieldId: "q_motivation", value: "Mình thích CLB" },
      { fieldId: "q_shift", value: ["Sáng", "Tối"] },
    ],
  },
];

test("headers + rows đúng thứ tự cột hồ sơ rồi tới câu hỏi", () => {
  const { headers, rows } = buildExportMatrix({
    campaignName: "Đợt 2026",
    form,
    applications,
    columns: ["fullName", "status", "department", "totalScore"],
    questionFieldIds: ["q_motivation", "q_shift"],
  });
  expect(headers).toEqual([
    "Họ và tên",
    "Kết quả vòng đơn",
    "Ban nguyện vọng",
    "Điểm vòng đơn",
    "Lý do ứng tuyển",
    "Ca rảnh",
  ]);
  expect(rows[0]).toEqual([
    "Nguyễn A",
    "Đạt vòng đơn",
    "Ban Truyền thông",
    "8.5",
    "Mình thích CLB",
    "Sáng, Tối",
  ]);
});

test("loại key cột lạ và fieldId không có trong form", () => {
  const { headers } = buildExportMatrix({
    campaignName: "X",
    form,
    applications,
    columns: ["fullName", "hacker_col"],
    questionFieldIds: ["q_motivation", "full_name", "khong_ton_tai"],
  });
  // hacker_col bị bỏ; full_name/khong_ton_tai bị bỏ; q_shift được bổ sung tự động
  expect(headers).toEqual(["Họ và tên", "Lý do ứng tuyển", "Ca rảnh"]);
});

test("xuất đủ thông tin cá nhân cố định từ hồ sơ", () => {
  const apps = [
    {
      ...applications[0],
      studentId: "ITITIU21001",
      className: "ITITIU21",
      faculty: "CNTT",
      dateOfBirth: "2003-05-15T00:00:00.000Z",
      departmentPreferences: [
        { department: "Truyền thông", priority: 1 },
        { department: "Chuyen mon", priority: 2 },
      ],
      assignedDepartment: null,
    },
  ];
  const { headers, rows } = buildExportMatrix({
    campaignName: "Đợt 2026",
    form,
    applications: apps,
    columns: [
      "studentId",
      "className",
      "faculty",
      "dateOfBirth",
      "departmentPreferences",
    ],
    questionFieldIds: [],
  });
  // questionFieldIds rỗng → BE vẫn gắn mọi câu hỏi custom của form
  expect(headers).toEqual([
    "MSSV",
    "Lớp",
    "Khoa/Ngành",
    "Ngày sinh",
    "Nguyện vọng (đủ)",
    "Lý do ứng tuyển",
    "Ca rảnh",
  ]);
  expect(rows[0][0]).toBe("ITITIU21001");
  expect(rows[0][1]).toBe("ITITIU21");
  expect(rows[0][2]).toBe("CNTT");
  expect(rows[0][3]).toMatch(/15\/05\/2003|5\/15\/2003/);
  expect(rows[0][4]).toBe("NV1: Truyền thông · NV2: Chuyen mon");
  expect(rows[0][5]).toBe("Mình thích CLB");
  expect(rows[0][6]).toBe("Sáng, Tối");
});

test("luôn bổ sung câu hỏi form còn thiếu dù client quên gửi", () => {
  const { headers, rows } = buildExportMatrix({
    campaignName: "Đợt 2026",
    form,
    applications,
    columns: ["fullName"],
    questionFieldIds: ["q_motivation"], // thiếu q_shift
  });
  expect(headers).toEqual(["Họ và tên", "Lý do ứng tuyển", "Ca rảnh"]);
  expect(rows[0]).toEqual(["Nguyễn A", "Mình thích CLB", "Sáng, Tối"]);
});
