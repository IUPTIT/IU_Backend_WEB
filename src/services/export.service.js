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

const STATUS_LABEL = {
  draft: "Chờ xét duyệt",
  pending_review: "Chờ xét duyệt",
  passed_cv: "Đạt vòng đơn",
  failed_cv: "Không đạt vòng đơn",
  passed_interview: "Đạt phỏng vấn",
  failed_interview: "Không đạt phỏng vấn",
  admitted: "Trúng tuyển",
  rejected: "Không trúng tuyển",
};

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

// key khớp id cột frontend (buildApplicationExportColumns)
export const PROFILE_COLUMNS = {
  fullName: { header: "Họ và tên", get: (a) => a.fullName ?? "" },
  email: { header: "Email", get: (a) => a.email ?? "" },
  phone: { header: "Số điện thoại", get: (a) => a.phone ?? "" },
  department: { header: "Ban nguyện vọng", get: (a) => preferredDepartment(a) },
  campaign: { header: "Đợt tuyển", get: (_a, ctx) => ctx.campaignName ?? "" },
  submittedAt: {
    header: "Ngày nộp",
    get: (a) => formatVnDate(a.submittedAt ?? a.createdAt),
  },
  totalScore: {
    header: "Điểm ĐG",
    get: (a) =>
      a.cvScore != null ? String(Number((a.cvScore / 10).toFixed(1))) : "",
  },
  status: {
    header: "Trạng thái",
    get: (a) => STATUS_LABEL[a.status] ?? a.status,
  },
};

export function buildExportMatrix({
  campaignName,
  form,
  applications,
  columns,
  questionFieldIds,
}) {
  const fieldById = new Map((form?.fields ?? []).map((f) => [f.fieldId, f]));
  const profileCols = (columns ?? []).filter((k) =>
    Object.hasOwn(PROFILE_COLUMNS, k),
  );
  const questionCols = (questionFieldIds ?? []).filter(
    (id) => fieldById.has(id) && !fieldById.get(id).isFixed,
  );

  const headers = [
    ...profileCols.map((k) => PROFILE_COLUMNS[k].header),
    ...questionCols.map((id) => fieldById.get(id).label),
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
