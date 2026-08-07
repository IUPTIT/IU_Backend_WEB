import Application from "../models/application.model.js";
import Trainee from "../models/trainee.model.js";
import User from "../models/user.model.js";
import InterviewBooking from "../models/interviewBooking.model.js";
import { mongoRoleIn } from "../utils/roles.js";

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Tổng quan Admin — số liệu thật từ DB (không mock). */
export async function getOverview() {
  const [
    applicationsTotal,
    screened,
    interviewedApps,
    traineesActive,
    membersOfficial,
    pendingInterviewBookings,
  ] = await Promise.all([
    Application.countDocuments({ status: { $ne: "draft" } }),
    Application.countDocuments({
      status: {
        $in: [
          "passed_cv",
          "passed_interview",
          "failed_interview",
          "admitted",
          "rejected",
        ],
      },
    }),
    Application.countDocuments({
      status: {
        $in: ["passed_interview", "failed_interview", "admitted", "rejected"],
      },
    }),
    Trainee.countDocuments({ status: { $ne: "removed" } }),
    User.countDocuments({
      ...mongoRoleIn(["member", "leader"]),
      isActive: { $ne: false },
      clubStatus: "active",
      $or: [
        { memberStatus: "official" },
        { role: "leader" },
        { roles: "leader" },
      ],
    }),
    InterviewBooking.countDocuments({ status: { $in: ["booked", "changed"] } }),
  ]);

  const funnelBase = applicationsTotal || 1;
  const recruitmentFunnel = [
    {
      id: "applied",
      label: "Nộp đơn",
      value: applicationsTotal,
      percent: 100,
      tone: "accent",
    },
    {
      id: "screened",
      label: "Qua vòng đơn",
      value: screened,
      percent: pct(screened, funnelBase),
      tone: "accent",
    },
    {
      id: "interviewed",
      label: "Đã phỏng vấn",
      value: interviewedApps,
      percent: pct(interviewedApps, funnelBase),
      tone: "purple",
    },
    {
      id: "trainee",
      label: "Đang training",
      value: traineesActive,
      percent: pct(traineesActive, funnelBase),
      tone: "green",
    },
  ];

  // 6 tuần gần nhất — hồ sơ nộp / qua vòng đơn
  const since = new Date();
  since.setDate(since.getDate() - 7 * 6);
  const recentApps = await Application.find({
    status: { $ne: "draft" },
    createdAt: { $gte: since },
  })
    .select("createdAt status")
    .lean();

  const weekBuckets = Array.from({ length: 6 }, (_, i) => ({
    week: `Tuần ${i + 1}`,
    received: 0,
    passed: 0,
    start: (() => {
      const d = new Date(since);
      d.setDate(d.getDate() + i * 7);
      return d;
    })(),
  }));

  for (const app of recentApps) {
    const t = new Date(app.createdAt).getTime();
    const idx = Math.min(
      5,
      Math.max(
        0,
        Math.floor((t - since.getTime()) / (7 * 24 * 60 * 60 * 1000)),
      ),
    );
    weekBuckets[idx].received += 1;
    if (
      [
        "passed_cv",
        "passed_interview",
        "failed_interview",
        "admitted",
        "rejected",
      ].includes(app.status)
    ) {
      weekBuckets[idx].passed += 1;
    }
  }

  const weeklySubmissions = weekBuckets.map(({ week, received, passed }) => ({
    week,
    received,
    passed,
  }));

  // Phân bố trainee theo ban
  const deptAgg = await Trainee.aggregate([
    { $match: { status: { $ne: "removed" } } },
    { $group: { _id: "$department", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const tones = ["accent", "purple", "green", "muted"];
  const traineeDepartments = deptAgg.map((d, i) => ({
    id: String(d._id || `dept-${i}`),
    label: d._id || "Chưa phân ban",
    percent: pct(d.count, traineesActive || 1),
    tone: tones[i % tones.length],
  }));

  const interviewRate =
    applicationsTotal > 0
      ? `${Math.round((interviewedApps / applicationsTotal) * 100)}% tỷ lệ đã PV`
      : "Chưa có hồ sơ";

  return {
    id: "live",
    label: "Hiện tại",
    statCards: [
      {
        id: "applications",
        label: "Tổng hồ sơ nhận",
        value: applicationsTotal,
        badge: "Toàn hệ thống",
        badgeTone: "accent",
        icon: "file",
      },
      {
        id: "interviewed",
        label: "Đã phỏng vấn",
        value: interviewedApps,
        badge: interviewRate,
        badgeTone: "purple",
        icon: "chat",
      },
      {
        id: "trainees",
        label: "Đang đào tạo (Trainee)",
        value: traineesActive,
        badge: traineesActive > 0 ? "Đang diễn ra" : "Chưa có",
        badgeTone: "green",
        icon: "graduation",
      },
      {
        id: "members",
        label: "Tổng thành viên CLB",
        value: membersOfficial,
        badge: "Chính thức",
        badgeTone: "green",
        icon: "members",
      },
    ],
    recruitmentFunnel,
    weeklySubmissions,
    dailySubmissions: [],
    trainingScores: [],
    traineeTotal: traineesActive,
    traineeDepartments,
    pendingReview: {
      count: pendingInterviewBookings || 0,
      message:
        pendingInterviewBookings > 0
          ? `Có ${pendingInterviewBookings} booking phỏng vấn chưa có kết quả.`
          : "Không có booking PV đang chờ đánh giá.",
      deadline: new Date().toISOString().slice(0, 10),
    },
  };
}
