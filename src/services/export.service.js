import ExcelJS from "exceljs";
import ApplicationForm from "../models/applicationForm.model.js";
import RecruitmentCampaign from "../models/recruitmentCampaign.model.js";
import { getApplicationsForExport } from "./application.service.js";

export async function matrixToXlsxBuffer(headers, rows, sheetName = "Hồ sơ") {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function formatVnDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function preferredDepartment(app) {
  if (app.assignedDepartment) return app.assignedDepartment;
  const prefs = [...(app.departmentPreferences ?? [])].sort(
    (a, b) => a.priority - b.priority,
  );
  return prefs[0]?.department ?? "";
}

function allDepartmentPreferences(app) {
  const prefs = [...(app.departmentPreferences ?? [])].sort(
    (a, b) => a.priority - b.priority,
  );
  if (prefs.length === 0) return preferredDepartment(app);
  return prefs.map((p, i) => `NV${i + 1}: ${p.department}`).join(" · ");
}

// key khớp id cột frontend (buildApplicationExportColumns)
export const PROFILE_COLUMNS = {
  fullName: { header: "Họ và tên", get: (a) => a.fullName ?? "" },
  studentId: { header: "MSSV", get: (a) => a.studentId ?? "" },
  className: { header: "Lớp", get: (a) => a.className ?? "" },
  faculty: { header: "Khoa/Ngành", get: (a) => a.faculty ?? "" },
  email: { header: "Email", get: (a) => a.email ?? "" },
  phone: { header: "Số điện thoại", get: (a) => a.phone ?? "" },
  dateOfBirth: {
    header: "Ngày sinh",
    get: (a) => formatVnDate(a.dateOfBirth),
  },
  department: { header: "Ban nguyện vọng", get: (a) => preferredDepartment(a) },
  departmentPreferences: {
    header: "Nguyện vọng (đủ)",
    get: (a) => allDepartmentPreferences(a),
  },
  campaign: { header: "Đợt tuyển", get: (_a, ctx) => ctx.campaignName ?? "" },
  submittedAt: {
    header: "Ngày nộp",
    get: (a) => formatVnDate(a.submittedAt ?? a.createdAt),
  },
  totalScore: {
    header: "Điểm vòng đơn",
    get: (a) =>
      a.cvScore != null ? String(Number((a.cvScore / 10).toFixed(1))) : "",
  },
  /** Chỉ kết quả vòng đơn — không lộ trạng thái PV / trúng tuyển */
  screeningStatus: {
    header: "Kết quả vòng đơn",
    get: (a) => {
      if (a.status === "draft" || a.status === "pending_review") {
        return "Chờ xét duyệt";
      }
      if (a.status === "failed_cv") return "Không đạt vòng đơn";
      // passed_cv trở đi = đã pass vòng đơn
      return "Đạt vòng đơn";
    },
  },
  /** Giữ key cũ nếu client cũ còn gửi — map sang nhãn vòng đơn */
  status: {
    header: "Kết quả vòng đơn",
    get: (a) => {
      if (a.status === "draft" || a.status === "pending_review") {
        return "Chờ xét duyệt";
      }
      if (a.status === "failed_cv") return "Không đạt vòng đơn";
      return "Đạt vòng đơn";
    },
  },
  applicationCode: { header: "Mã hồ sơ", get: (a) => a.applicationCode ?? "" },
  assignedDepartment: {
    header: "Ban chính thức",
    get: (a) => a.assignedDepartment ?? "",
  },
};

export function buildExportMatrix({
  campaignName,
  form,
  applications,
  columns,
  questionFieldIds,
}) {
  const fields = form?.fields ?? [];
  const fieldById = new Map(fields.map((f) => [f.fieldId, f]));
  const allCustomIds = fields
    .filter((f) => !f.isFixed)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((f) => f.fieldId);

  const profileCols = (columns ?? []).filter((k) =>
    Object.hasOwn(PROFILE_COLUMNS, k),
  );

  // Client chọn trước (giữ thứ tự); luôn bổ sung mọi câu hỏi custom còn thiếu
  // để file xuất đủ toàn bộ câu trả lời form đăng ký
  const requested = questionFieldIds ?? [];
  const questionCols =
    requested.length > 0
      ? [
          ...requested.filter((id) => allCustomIds.includes(id)),
          ...allCustomIds.filter((id) => !requested.includes(id)),
        ]
      : allCustomIds;

  const headers = [
    ...profileCols.map((k) => PROFILE_COLUMNS[k].header),
    ...questionCols.map((id) => fieldById.get(id)?.label ?? id),
  ];

  const rows = (applications ?? []).map((app) => {
    const answerById = new Map(
      (app.answers ?? []).map((ans) => [ans.fieldId, ans.value]),
    );
    const profileVals = profileCols.map((k) =>
      PROFILE_COLUMNS[k].get(app, { campaignName }),
    );
    const questionVals = questionCols.map((id) => {
      const v = answerById.get(id);
      if (v == null) return "";
      return Array.isArray(v) ? v.join(", ") : String(v);
    });
    return [...profileVals, ...questionVals];
  });

  return { headers, rows };
}

// Chuẩn hoá tên đợt tuyển thành slug an toàn cho tên file (bỏ dấu tiếng Việt)
function slugify(name) {
  return (
    (name ?? "dot")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "dot"
  );
}

// Orchestrator: gộp campaign + form + hồ sơ (đã enrich, lọc draft, đúng thứ tự
// applicationIds) thành ma trận rồi xuất workbook .xlsx
export async function buildApplicationsExport({
  campaignId,
  applicationIds,
  columns,
  questionFieldIds,
}) {
  const [campaign, form, applications] = await Promise.all([
    RecruitmentCampaign.findById(campaignId).select("name").lean(),
    ApplicationForm.findOne({ campaignId }).lean(),
    getApplicationsForExport(campaignId, applicationIds),
  ]);
  const { headers, rows } = buildExportMatrix({
    campaignName: campaign?.name ?? "",
    form,
    applications,
    columns,
    questionFieldIds: questionFieldIds ?? [],
  });
  const buffer = await matrixToXlsxBuffer(headers, rows);
  return { buffer, filename: `ho_so_${slugify(campaign?.name)}.xlsx` };
}
