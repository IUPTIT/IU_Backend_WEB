import EmailTemplate from "../models/emailTemplate.model.js";
import ApiError from "../utils/ApiError.js";

const DEFAULT_TEMPLATES = [
  {
    slug: "tpl-cv-pass",
    name: "Pass vòng đơn",
    category: "recruitment",
    subject: "THÔNG BÁO KẾT QUẢ VÒNG ĐƠN – CLB IU ({{candidate_name}})",
    body: `<p><strong>THÔNG BÁO KẾT QUẢ VÒNG ĐƠN – CLB IU</strong></p>
<p>Xin chúc mừng <strong>{{candidate_name}}</strong>!</p>
<p>Sau quá trình xem xét hồ sơ đăng ký, Ban Tuyển thành viên CLB IU vui mừng thông báo rằng bạn đã <strong>vượt qua Vòng Đơn</strong> và chính thức bước tiếp vào <strong>Vòng Phỏng vấn</strong>.</p>
<p><strong>Thông tin phỏng vấn:</strong></p>
<ul>
<li>Thời gian: <strong>{{interview_time}}</strong></li>
<li>Địa điểm/Hình thức: <strong>{{location}}</strong></li>
<li>Ban đăng ký: <strong>{{department}}</strong></li>
</ul>
<p>Vui lòng có mặt trước giờ hẹn khoảng <strong>10–15 phút</strong> và mang theo tinh thần tự tin, thoải mái để có một buổi trao đổi hiệu quả.</p>
<p>Nếu có bất kỳ thắc mắc hoặc không thể tham gia đúng lịch, vui lòng liên hệ Fanpage hoặc Ban Tuyển thành viên CLB IU để được hỗ trợ.</p>
<p>Hẹn gặp bạn tại Vòng Phỏng vấn!</p>
<p><strong>Đăng nhập portal ứng viên</strong> (bắt buộc đổi mật khẩu ở lần đăng nhập đầu):<br/>
Tài khoản: <strong>{{email}}</strong> (email đăng ký của bạn)<br/>
Mật khẩu mặc định: <strong>{{temp_password}}</strong> (ngày sinh dạng DDMMYYYY)<br/>
Link: {{login_url}}</p>
<p><strong>CLB IU – Learn • Connect • Create</strong></p>`,
    status: "active",
  },
  {
    slug: "tpl-cv-fail",
    name: "Trượt vòng đơn",
    category: "recruitment",
    subject: "THÔNG BÁO KẾT QUẢ VÒNG ĐƠN – CLB IU ({{candidate_name}})",
    body: `<p><strong>THÔNG BÁO KẾT QUẢ VÒNG ĐƠN – CLB IU</strong></p>
<p>Chào <strong>{{candidate_name}}</strong>,</p>
<p>CLB IU chân thành cảm ơn bạn đã dành thời gian đăng ký tham gia đợt tuyển thành viên lần này.</p>
<p>Sau quá trình đánh giá hồ sơ, rất tiếc <strong>bạn chưa phù hợp với yêu cầu của Vòng Đơn</strong> trong đợt tuyển hiện tại.</p>
<p>Điều này không phản ánh toàn bộ năng lực của bạn. Mỗi vị trí đều có những tiêu chí và nhu cầu khác nhau ở từng thời điểm. CLB hy vọng bạn sẽ tiếp tục phát triển bản thân và mạnh dạn quay trở lại trong những đợt tuyển thành viên tiếp theo.</p>
<p>Một lần nữa, cảm ơn bạn đã quan tâm đến CLB IU. Chúc bạn luôn học tập tốt và gặt hái nhiều thành công trong thời gian tới.</p>
<p>Trân trọng,</p>
<p><strong>Ban Tuyển thành viên CLB IU</strong></p>`,
    status: "active",
  },
  {
    slug: "tpl-book-slot",
    name: "Nhắc đăng ký lịch phỏng vấn",
    category: "recruitment",
    subject: "[IU CLUB] Nhắc đăng ký lịch phỏng vấn — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nBạn đã ĐẠT vòng đơn nhưng chưa đăng ký lịch phỏng vấn.\n\nVui lòng đăng nhập {{login_url}} và chọn ca trước hạn: {{booking_deadline}}.\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-interview",
    name: "Mời / xác nhận phỏng vấn",
    category: "recruitment",
    subject: "[IU CLUB] Xác nhận lịch phỏng vấn — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nBạn đã đăng ký lịch phỏng vấn IU CLUB thành công:\n- Ngày: {{interview_date}}\n- Giờ: {{interview_time}}\n- Địa điểm: {{location}}\n\nVui lòng có mặt trước 10 phút.\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-reminder",
    name: "Nhắc lịch phỏng vấn sắp diễn ra",
    category: "recruitment",
    subject: "[IU CLUB] Nhắc lịch PV còn {{time_left}} — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nNhắc bạn lịch phỏng vấn sắp diễn ra (còn {{time_left}}):\n- Ngày: {{interview_date}}\n- Giờ: {{interview_time}}\n- Địa điểm: {{location}}\n\nVui lòng có mặt trước 10 phút.\n\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-passed",
    name: "Pass / Trúng tuyển",
    category: "recruitment",
    subject: "[IU CLUB] Chúc mừng — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nBạn đã vượt qua vòng tuyển của IU CLUB. Ban: {{department}}.\nKết quả: {{result}}\n\nĐăng nhập: {{login_url}}\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-rejected",
    name: "Không đạt / Từ chối",
    category: "recruitment",
    subject: "[IU CLUB] Kết quả tuyển dụng — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nCảm ơn bạn đã ứng tuyển IU CLUB. Rất tiếc lần này chúng tôi chưa thể đồng hành cùng bạn.\nKết quả: {{result}}\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-welcome",
    name: "Chào mừng thành viên",
    category: "general",
    subject: "Chào mừng đến IU CLUB, {{candidate_name}}!",
    body: "Xin chào {{candidate_name}},\n\nChào mừng bạn gia nhập IU CLUB — Ban {{department}}.\n\nĐăng nhập portal: {{login_url}}\n\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-training-complete",
    name: "Hoàn thành training",
    category: "training",
    subject: "[IU CLUB] Hoàn thành lộ trình training",
    body: "Chào {{candidate_name}},\n\nBạn đã hoàn thành training. Chúc mừng!\n\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-official-member-account",
    name: "Tài khoản thành viên chính thức",
    category: "general",
    subject: "IU CLUB — Tài khoản Member Portal của bạn, {{candidate_name}}",
    body: `
      <p><strong>Chúc mừng {{candidate_name}}! 🎉</strong></p>
      <p>
      Bạn đã hoàn thành chương trình Training và chính thức trở thành
      <strong>thành viên chính thức của IU CLUB</strong>.
      </p>
      <p>
      Ban Chủ nhiệm rất vui khi được chào đón bạn trở thành một phần chính thức
      của CLB.
      </p>
      <p>
      <strong>Thông tin tài khoản Member Portal:</strong>
      </p>
      <ul>
        <li>
          Tài khoản:
          <strong>{{email}}</strong>
        </li>
        <li>
          Mật khẩu:
          <strong>{{temporary_password}}</strong>
        </li>
        <li>
          Ban:
          <strong>{{department}}</strong>
        </li>
      </ul>
      <p>
      Bạn có thể đăng nhập Member Portal tại:
      </p>
      <p>
      <a href="{{login_url}}" target="_blank">
        {{login_url}}
      </a>
      </p>
      <p>
      <strong>Lưu ý:</strong>
      Vui lòng đăng nhập và đổi mật khẩu ngay sau lần đăng nhập đầu tiên
      để đảm bảo an toàn cho tài khoản.
      </p>
      <p>
      Chúc mừng bạn đã chính thức gia nhập IU CLUB!
      </p>
      <p>
      <strong>IU CLUB – Learn • Connect • Create</strong>
      </p>
      `,
    status: "active",
  },
];

/** Cập nhật subject/body seed cho slug đã biết (để P1 placeholders đủ). */
async function upsertDefaultTemplate(tpl) {
  const existing = await EmailTemplate.findOne({ slug: tpl.slug });
  if (!existing) {
    await EmailTemplate.create(tpl);
    return;
  }
  // Đồng bộ wording mật khẩu = ngày sinh (một lần)
  if (
    tpl.slug === "tpl-cv-pass" &&
    !String(existing.body).includes("ngày sinh dạng DDMMYYYY")
  ) {
    existing.subject = tpl.subject;
    existing.body = tpl.body;
    existing.name = tpl.name;
    await existing.save();
    return;
  }
  // Một lần: đồng bộ nội dung kết quả vòng đơn (mẫu Ban Tuyển) nếu seed cũ
  if (
    (tpl.slug === "tpl-cv-pass" || tpl.slug === "tpl-cv-fail") &&
    !String(existing.body).includes("THÔNG BÁO KẾT QUẢ VÒNG ĐƠN")
  ) {
    existing.subject = tpl.subject;
    existing.body = tpl.body;
    existing.name = tpl.name;
    await existing.save();
    return;
  }
  if (
    tpl.slug === "tpl-cv-pass" &&
    !String(existing.body).includes("{{temp_password}}")
  ) {
    existing.subject = tpl.subject;
    existing.body = tpl.body;
    await existing.save();
    return;
  }
  if (
    tpl.slug === "tpl-reminder" &&
    !String(existing.body).includes("{{time_left}}")
  ) {
    existing.subject = tpl.subject;
    existing.body = tpl.body;
    await existing.save();
  }
}

function toDto(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    category: doc.category,
    subject: doc.subject,
    body: doc.body,
    status: doc.status,
    slug: doc.slug || null,
    createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
    updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
  };
}

/** Seed template mặc định nếu DB trống (idempotent theo slug). */
export async function ensureDefaultTemplates() {
  for (const tpl of DEFAULT_TEMPLATES) {
    await upsertDefaultTemplate(tpl);
  }
}

export async function listTemplates(category) {
  await ensureDefaultTemplates();
  const filter = {};
  if (category) filter.category = category;
  const rows = await EmailTemplate.find(filter).sort({ updatedAt: -1 });
  return rows.map(toDto);
}

export async function getTemplate(id) {
  const doc = await EmailTemplate.findById(id);
  if (!doc) throw ApiError.notFound("Không tìm thấy template");
  return toDto(doc);
}

export async function createTemplate(data, userId) {
  const doc = await EmailTemplate.create({
    name: data.name,
    category: data.category || "general",
    subject: data.subject,
    body: data.body ?? "",
    status: data.status || "active",
    slug: data.slug || undefined,
    updatedBy: userId || null,
  });
  return toDto(doc);
}

export async function updateTemplate(id, data, userId) {
  const doc = await EmailTemplate.findById(id);
  if (!doc) throw ApiError.notFound("Không tìm thấy template");
  for (const key of ["name", "category", "subject", "body", "status"]) {
    if (data[key] !== undefined) doc[key] = data[key];
  }
  if (userId) doc.updatedBy = userId;
  await doc.save();
  return toDto(doc);
}

export async function deleteTemplate(id) {
  const doc = await EmailTemplate.findById(id);
  if (!doc) throw ApiError.notFound("Không tìm thấy template");
  await doc.deleteOne();
  return { id: String(id) };
}
