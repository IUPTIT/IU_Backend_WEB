import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as departmentService from "../services/department.service.js";

export const getMyDepartment = catchAsync(async (req, res) => {
  const data = await departmentService.listMyDepartmentMembers(req.user.id);
  sendSuccess(res, {
    message: "Ban Leader đang phụ trách",
    data,
  });
});

export const assignMember = catchAsync(async (req, res) => {
  const member = await departmentService.assignMyDepartmentMember(
    req.user.id,
    req.params.memberId,
    req.body,
  );
  sendSuccess(res, { message: "Đã thêm thành viên vào Ban", data: { member } });
});

export const removeMember = catchAsync(async (req, res) => {
  const member = await departmentService.removeMyDepartmentMember(
    req.user.id,
    req.params.memberId,
    req.body?.reason,
  );
  sendSuccess(res, { message: "Đã gỡ thành viên khỏi Ban", data: { member } });
});

export const updateMember = catchAsync(async (req, res) => {
  const member = await departmentService.updateMyDepartmentMember(
    req.user.id,
    req.params.memberId,
    req.body,
  );
  sendSuccess(res, { message: "Đã cập nhật thành viên", data: { member } });
});
