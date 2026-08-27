import EmailTemplate from "../models/emailTemplate.model.js";
import ApiError from "../utils/ApiError.js";

const DEFAULT_TEMPLATES = [
  {
    slug: "tpl-cv-pass",
    name: "Pass vòng đơn",
    category: "recruitment",
    subject: "[IU CLUB] Chúc mừng bạn đã vượt qua Vòng Đơn — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nChúc mừng bạn! 🎉\n\nSau quá trình xem xét hồ sơ, Ban Tuyển thành viên IU CLUB vui mừng thông báo rằng bạn đã vượt qua Vòng Đơn và chính thức bước tiếp vào Vòng Phỏng vấn.\n\nMột chặng đầu tiên đã hoàn thành, và hành trình phía trước đang chờ bạn khám phá.\n\nThông tin phỏng vấn:\n- Thời gian: {{interview_time}}\n- Địa điểm / Hình thức: {{location}}\n- Ban đăng ký: {{department}}\n\nVui lòng có mặt trước giờ hẹn 10–15 phút và chuẩn bị một tinh thần thật thoải mái để chia sẻ về bản thân, những điều bạn yêu thích và những điều bạn muốn khám phá tại IU CLUB.\n\nThông tin đăng nhập Portal ứng viên:\n- Tài khoản: {{email}}\n- Mật khẩu mặc định: {{temp_password}} (ngày sinh dạng DDMMYYYY)\n- Portal ứng viên: {{login_url}}\n\nNếu có bất kỳ thắc mắc nào hoặc không thể tham gia đúng lịch, vui lòng liên hệ Fanpage hoặc Ban Tuyển thành viên IU CLUB để được hỗ trợ.\n\nChặng tiếp theo đang chờ bạn. Hẹn gặp bạn tại Vòng Phỏng vấn! 🧭\n\nTrân trọng,\nBan Tuyển thành viên IU CLUB\nShine and Thrive",
    status: "active",
  },
  {
    slug: "tpl-cv-fail",
    name: "Trượt vòng đơn",
    category: "recruitment",
    subject: "[IU CLUB] Kết quả Vòng Đơn — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nCảm ơn bạn đã dành thời gian và sự quan tâm để tham gia đợt tuyển thành viên IU CLUB lần này.\n\nSau quá trình xem xét và đánh giá hồ sơ, rất tiếc phải thông báo rằng bạn chưa vượt qua Vòng Đơn trong đợt tuyển hiện tại.\n\nMỗi hành trình đều có những chặng đường và điểm rẽ khác nhau. Kết quả lần này không thể hiện toàn bộ năng lực hay giá trị của bạn, mà chỉ phản ánh sự phù hợp với những tiêu chí và nhu cầu của đợt tuyển tại thời điểm hiện tại.\n\nHãy tiếp tục học hỏi, trải nghiệm và phát triển bản thân. Biết đâu ở một hành trình khác, chúng ta sẽ lại gặp nhau.\n\nCảm ơn bạn vì đã lựa chọn IU CLUB trên hành trình của mình. 💙\n\nThe journey doesn't end here. There are still many roads ahead.\n\nTrân trọng,\nBan Tuyển thành viên IU CLUB\nShine and Thrive",
    status: "active",
  },
  {
    slug: "tpl-book-slot",
    name: "Nhắc đăng ký lịch phỏng vấn",
    category: "recruitment",
    subject: "[IU CLUB] Một bước nữa để tiếp tục hành trình — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nBạn đã vượt qua Vòng Đơn, nhưng hiện tại vẫn chưa hoàn tất đăng ký lịch phỏng vấn.\n\nĐể tiếp tục hành trình cùng IU CLUB, vui lòng đăng nhập Portal và lựa chọn ca phỏng vấn phù hợp trước thời hạn:\n\nHạn đăng ký: {{booking_deadline}}\n\nĐăng ký lịch phỏng vấn: {{login_url}}\n\nHãy hoàn tất đăng ký trước thời hạn để không bỏ lỡ chặng tiếp theo nhé! 🧭\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-interview",
    name: "Mời / xác nhận phỏng vấn",
    category: "recruitment",
    subject: "[IU CLUB] Lịch phỏng vấn của bạn đã được xác nhận — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nBạn đã đăng ký lịch phỏng vấn IU CLUB thành công. 📍\n\nLịch phỏng vấn của bạn:\n- Ngày: {{interview_date}}\n- Thời gian: {{interview_time}}\n- Địa điểm / Hình thức: {{location}}\n{{meeting_link}}\n\nVui lòng kiểm tra lại thông tin và có mặt trước giờ hẹn khoảng 10 phút để chuẩn bị.\n\nMột chặng mới đã được xác nhận — hẹn gặp bạn tại buổi phỏng vấn! 💙\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-reminder",
    name: "Nhắc lịch phỏng vấn sắp diễn ra",
    category: "recruitment",
    subject: "[IU CLUB] Còn {{time_left}} đến lịch phỏng vấn của bạn",
    body: "Chào {{candidate_name}},\n\nChỉ còn {{time_left}} nữa là đến lịch phỏng vấn của bạn tại IU CLUB. 🧭\n\nThông tin lịch phỏng vấn:\n- Ngày: {{interview_date}}\n- Thời gian: {{interview_time}}\n- Địa điểm / Hình thức: {{location}}\n\nVui lòng có mặt trước giờ hẹn khoảng 10 phút và kiểm tra lại thông tin trước khi tham gia.\n\nChặng tiếp theo đã đến gần — hẹn gặp bạn tại Vòng Phỏng vấn!\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-interview-pass",
    name: "Đạt vòng phỏng vấn",
    category: "recruitment",
    subject: "[IU CLUB] Chúc mừng bạn đã vượt qua Vòng Phỏng vấn — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nChúc mừng bạn! Sau quá trình phỏng vấn và đánh giá, bạn đã vượt qua Vòng Phỏng vấn của IU CLUB.\n\nBan: {{department}}\nKết quả: {{result}}\n\nMột chặng quan trọng đã hoàn thành, và hành trình phía trước đang chờ bạn khám phá. Hãy chuẩn bị một tinh thần thật thoải mái, tự tin và sẵn sàng cho những bước tiếp theo.\n\nĐăng nhập Portal: {{login_url}}\n\nHẹn gặp bạn tại Checkpoint tiếp theo! 🧭\n\nTrân trọng,\nIU CLUB\nShine and Thrive",
    status: "active",
  },
  {
    slug: "tpl-final-pass",
    name: "Trúng tuyển chính thức",
    category: "recruitment",
    subject: "[IU CLUB] CHÚC MỪNG — Bạn đã chính thức trở thành thành viên IU CLUB! 🎉",
    body: "Chào {{candidate_name}},\n\nCHÚC MỪNG BẠN ĐÃ VỀ ĐÍCH! 🎉\n\nSau hành trình qua các vòng tuyển thành viên, IU CLUB vui mừng thông báo:\n\nBạn đã chính thức TRÚNG TUYỂN vào IU CLUB.\n\nBan: {{department}}\nKết quả: {{result}}\n\nMột hành trình mới giờ đây chính thức bắt đầu — nơi bạn sẽ được gặp gỡ những người đồng hành mới, thử sức với những điều mới và cùng nhau tạo nên những trải nghiệm đáng nhớ.\n\nTheo dõi thông tin tiếp theo tại: {{login_url}}\n\nWelcome to the journey. Welcome to IU CLUB. 💙\n\nTrân trọng,\n{{club_name}}\nShine and Thrive",
    status: "active",
  },
  {
    slug: "tpl-interview-fail",
    name: "Trượt vòng phỏng vấn",
    category: "recruitment",
    subject: "[IU CLUB] Kết quả Vòng Phỏng vấn — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nCảm ơn bạn đã dành thời gian tham gia Vòng Phỏng vấn cùng IU CLUB và lựa chọn đồng hành cùng chúng tôi trên hành trình tuyển thành viên lần này.\n\nSau quá trình đánh giá, rất tiếc phải thông báo rằng lần này bạn chưa vượt qua Vòng Phỏng vấn.\n\nKết quả: {{result}}\n\nMỗi hành trình đều có những điểm dừng và những lần rẽ khác nhau. Kết quả lần này không làm mất đi những nỗ lực và giá trị bạn đã thể hiện trong suốt quá trình ứng tuyển.\n\nCảm ơn bạn vì đã để IU CLUB trở thành một phần trong hành trình của mình. Hy vọng chúng ta sẽ có dịp gặp lại nhau trên một chặng đường khác. 💙\n\nThe journey goes on.\n\nTrân trọng,\nIU CLUB\nShine and Thrive",
    status: "active",
  },
  {
    slug: "tpl-final-fail",
    name: "Từ chối vòng xét duyệt cuối",
    category: "recruitment",
    subject: "[IU CLUB] Kết quả xét duyệt cuối — {{candidate_name}}",
    body: "Chào {{candidate_name}},\n\nCảm ơn bạn đã đồng hành cùng IU CLUB trong suốt hành trình tuyển thành viên lần này.\n\nSau vòng xét duyệt cuối, rất tiếc phải thông báo rằng bạn chưa được lựa chọn trở thành thành viên IU CLUB trong đợt tuyển hiện tại.\n\nKết quả: {{result}}\n\nChúng tôi trân trọng thời gian, sự nỗ lực và tinh thần bạn đã dành cho hành trình này.\n\nMột điểm dừng không có nghĩa là hành trình kết thúc. Hy vọng bạn sẽ tiếp tục khám phá, học hỏi và phát triển trên những cung đường của riêng mình.\n\nYour journey goes on. We hope to see you on another road someday. 💙\n\nTrân trọng,\n{{club_name}}",
    status: "active",
  },
  {
    slug: "tpl-welcome",
    name: "Chào mừng thành viên chính thức",
    category: "general",
    subject: "[IU CLUB] Chào mừng {{candidate_name}} đến với hành trình mới! 🎉",
    body: "Xin chào {{candidate_name}},\n\nCHÀO MỪNG BẠN ĐẾN VỚI IU CLUB! 🎉\n\nTừ hôm nay, bạn chính thức trở thành thành viên của {{club_name}} — Ban {{department}}.\n\nMột hành trình mới đã chính thức bắt đầu.\n\nTại đây, bạn sẽ có cơ hội học hỏi, kết nối, sáng tạo, thử sức với những điều mới và cùng những người đồng hành tạo nên những trải nghiệm đáng nhớ.\n\nThông tin tài khoản Portal:\nEmail: {{email}}\nPortal: {{login_url}}\n\nHãy sẵn sàng cho những chặng đường phía trước.\n\nWelcome aboard. The journey begins now. 🧭\n\nTrân trọng,\n{{club_name}}\nShine and Thrive",
    status: "active",
  },
  {
    slug: "tpl-training-complete",
    name: "Hoàn thành training",
    category: "training",
    subject: "[IU CLUB] Bạn đã hoàn thành hành trình Training! 🎉",
    body: "Chào {{candidate_name}},\n\nChúc mừng bạn đã hoàn thành chương trình Training của IU CLUB! 🎉\n\nBạn vừa hoàn thành một chặng quan trọng trong hành trình của mình và sẵn sàng bước vào những trải nghiệm tiếp theo cùng CLB.\n\nHãy tiếp tục học hỏi, kết nối, sáng tạo và phát huy điều bạn có thể mang lại cho tập thể.\n\nOne checkpoint completed. More journeys ahead. 🧭\n\nTrân trọng,\n{{club_name}}",
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

/** Cập nhật subject/body seed cho slug đã biết. */
async function upsertDefaultTemplate(tpl) {
  const existing = await EmailTemplate.findOne({ slug: tpl.slug });
  if (!existing) {
    await EmailTemplate.create(tpl);
    return;
  }
  // Đồng bộ subject, body, name mới nhất từ seed
  existing.name = tpl.name;
  existing.category = tpl.category;
  existing.subject = tpl.subject;
  existing.body = tpl.body;
  existing.status = tpl.status;
  await existing.save();
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
