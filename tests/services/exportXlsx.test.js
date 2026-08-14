import ExcelJS from "exceljs";
import { matrixToXlsxBuffer } from "../../src/services/export.service.js";

test("matrixToXlsxBuffer ghi header + rows đọc lại đúng", async () => {
  const buf = await matrixToXlsxBuffer(
    ["Họ và tên", "Trạng thái"],
    [
      ["Nguyễn A", "Trúng tuyển"],
      ["Trần B", "Chờ xét duyệt"],
    ],
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  expect(ws.getRow(1).values).toEqual([undefined, "Họ và tên", "Trạng thái"]);
  expect(ws.getRow(2).values).toEqual([undefined, "Nguyễn A", "Trúng tuyển"]);
  expect(ws.getRow(3).values).toEqual([undefined, "Trần B", "Chờ xét duyệt"]);
});
