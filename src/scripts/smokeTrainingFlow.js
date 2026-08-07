/**
 * Smoke test API luồng Đào tạo thành viên mới (cần server đang chạy + đã seed:demo).
 * Chạy: npm run test:training-flow
 */
const BASE = process.env.API_URL || "http://localhost:3456/api/v1";
const DEMO_PASSWORD = "Demo@12345";

const accounts = {
  bcn: {
    email: process.env.ADMIN_EMAIL || "iuptit.com@gmail.com",
    password: process.env.ADMIN_PASSWORD || "admin123456",
  },
  leader: { email: "leader@example.com", password: DEMO_PASSWORD },
  mentor: { email: "mentor@example.com", password: DEMO_PASSWORD },
  trainee: { email: "trainee1@example.com", password: DEMO_PASSWORD },
};

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, err) {
  failed += 1;
  console.error(`  ✗ ${label}: ${err}`);
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg =
      json.message || json.error || res.statusText || String(res.status);
    const err = new Error(msg);
    err.status = res.status;
    err.json = json;
    throw err;
  }
  return json.data;
}

async function login(email, password) {
  const data = await api("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return data.accessToken;
}

async function main() {
  console.log(`\n[test:training-flow] API = ${BASE}\n`);

  // Health
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error(String(res.status));
    ok("GET /health");
  } catch (e) {
    fail("GET /health — server chưa chạy?", e.message);
    process.exit(1);
  }

  // Login all roles
  const tokens = {};
  for (const [role, cred] of Object.entries(accounts)) {
    try {
      tokens[role] = await login(cred.email, cred.password);
      ok(`Login ${role} (${cred.email})`);
    } catch (e) {
      fail(`Login ${role} (${cred.email})`, e.message);
    }
  }

  if (!tokens.mentor || !tokens.trainee || !tokens.bcn) {
    console.error("\nThiếu token — chạy `npm run seed:demo` rồi thử lại.\n");
    process.exit(1);
  }

  // Mentor: list groups / tasks / my-team
  let groupId;
  try {
    const { groups } = await api("/training/groups", { token: tokens.mentor });
    groupId = groups?.find((g) => g.name === "Team Demo Mentor")?._id;
    if (!groupId) groupId = groups?.[0]?._id;
    if (!groupId) throw new Error("Không có nhóm");
    ok(`Mentor list groups (${groups.length})`);
  } catch (e) {
    fail("Mentor list groups", e.message);
  }

  try {
    const { tasks } = await api("/training/tasks", { token: tokens.mentor });
    ok(`Mentor list tasks (${tasks?.length ?? 0})`);
  } catch (e) {
    fail("Mentor list tasks", e.message);
  }

  try {
    const { trainees } = await api("/training/my-team", {
      token: tokens.mentor,
    });
    ok(`Mentor my-team (${trainees?.length ?? 0})`);
  } catch (e) {
    fail("Mentor my-team", e.message);
  }

  // Trainee: me + progress + tasks + submit
  let traineeId;
  let taskId;
  try {
    const me = await api("/training/me", { token: tokens.trainee });
    traineeId = me.trainee?._id;
    if (!traineeId) throw new Error("Không có trainee");
    ok(`Trainee GET /training/me (${me.group?.name || "no group"})`);
  } catch (e) {
    fail("Trainee GET /training/me", e.message);
  }

  try {
    const { progress } = await api("/training/me/progress", {
      token: tokens.trainee,
    });
    ok(
      `Trainee progress ${progress?.percentComplete ?? 0}% (${progress?.completedTasks}/${progress?.totalTasks})`,
    );
  } catch (e) {
    fail("Trainee progress", e.message);
  }

  try {
    const { tasks } = await api("/training/tasks/mine", {
      token: tokens.trainee,
    });
    taskId = tasks?.[0]?._id;
    ok(`Trainee tasks/mine (${tasks?.length ?? 0})`);
  } catch (e) {
    fail("Trainee tasks/mine", e.message);
  }

  if (taskId) {
    try {
      await api(`/training/tasks/${taskId}/submit`, {
        method: "POST",
        token: tokens.trainee,
        body: {
          submissionUrl: "https://example.com/demo-submission",
          submissionNote: "Nộp tự động từ smoke test",
        },
      });
      ok("Trainee submit task");
    } catch (e) {
      // Có thể đã nộp trước đó
      if (String(e.message).toLowerCase().includes("đã") || e.status === 400) {
        ok(`Trainee submit task (skip: ${e.message})`);
      } else {
        fail("Trainee submit task", e.message);
      }
    }
  }

  // Mentor review first submitted assignment
  try {
    const { tasks } = await api("/training/tasks", { token: tokens.mentor });
    const task = tasks?.find((t) => t._id === taskId) || tasks?.[0];
    const assignment = task?.assignments?.find(
      (a) => a.status === "submitted" || a.status === "assigned",
    );
    const tid =
      typeof assignment?.traineeId === "object"
        ? assignment.traineeId._id
        : assignment?.traineeId;
    if (task && tid) {
      await api(`/training/tasks/${task._id}/review/${tid}`, {
        method: "PATCH",
        token: tokens.mentor,
        body: {
          status: "approved",
          feedback: "Tốt — smoke test",
          score: 9,
        },
      });
      ok("Mentor review submission");
    } else {
      ok("Mentor review (không có bài chờ — skip)");
    }
  } catch (e) {
    fail("Mentor review", e.message);
  }

  // Chat
  if (groupId) {
    try {
      await api(`/training/groups/${groupId}/messages`, {
        method: "POST",
        token: tokens.trainee,
        body: { content: "Xin chào mentor — tin nhắn smoke test" },
      });
      ok("Trainee gửi chat nhóm");
      const { messages } = await api(`/training/groups/${groupId}/messages`, {
        token: tokens.mentor,
      });
      ok(`Mentor đọc chat (${messages?.length ?? 0} tin)`);
    } catch (e) {
      fail("Chat nhóm", e.message);
    }
  }

  // BCN: trainees, review-summary, eval
  try {
    const { trainees } = await api("/training/trainees", {
      token: tokens.bcn,
    });
    ok(`BCN list trainees (${trainees?.length ?? 0})`);
    if (traineeId || trainees?.[0]?._id) {
      const id = traineeId || trainees[0]._id;
      await api(`/training/trainees/${id}/eval`, {
        method: "PATCH",
        token: tokens.bcn,
        body: { evalStatus: "qualified" },
      });
      ok("BCN đánh dấu qualified");
      await api("/training/certificates", {
        method: "POST",
        token: tokens.bcn,
        body: { traineeIds: [id] },
      });
      ok("BCN cấp chứng nhận");
    }
  } catch (e) {
    fail("BCN eval/certificate", e.message);
  }

  try {
    const { summary } = await api("/training/review-summary", {
      token: tokens.bcn,
    });
    ok(
      `BCN review-summary completion=${summary?.completionRate}% total=${summary?.totalTrainees}`,
    );
  } catch (e) {
    fail("BCN review-summary", e.message);
  }

  // Leader login path
  if (tokens.leader) {
    try {
      await api("/training/my-team", { token: tokens.leader });
      ok("Leader my-team");
    } catch (e) {
      fail("Leader my-team", e.message);
    }
  }

  console.log(
    `\n========== KẾT QUẢ: ${passed} passed, ${failed} failed ==========\n`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
