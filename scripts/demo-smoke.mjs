#!/usr/bin/env node
// demo-smoke.mjs — E2E-путёвка по живому dev-серверу MarkFlow (API).
// Ассерты по реальному контракту (ревью T1/T2). Печатает PASS/FAIL-чеклист,
// exit!=0 при фейле.
//
// Usage:
//   node scripts/demo-smoke.mjs [base-url]
//   npm run demo:smoke
//
// Требует: живой API (npm run dev), MFA_ENABLED=false (дефолт .env).

const base = process.argv[2] ?? "http://localhost:3000";
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

function fail(name, detail) {
  check(name, false, detail);
}

async function req(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...opts,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* не-JSON */
  }
  return { status: res.status, body };
}

const BIN = `1234567890${String(Date.now()).slice(-2)}`;
const APPLY = {
  name: "Демо заявитель",
  bin: BIN,
  email: "demo@example.com",
  phone: "+77000000000",
  city: "Алматы",
  address: "ул. Тестовая 1",
  contact: "Демо Оператор",
  consentDocument: "offer-v1",
  consentSubject: "demo-applicant",
};

let appId = null;

// 1. Новый БИН → 201
const created = await req("/onboarding/applications", {
  method: "POST",
  body: JSON.stringify(APPLY),
});
if (created.status === 201 && created.body?.id) {
  appId = created.body.id;
  check("POST /onboarding/applications (новый БИН) → 201", true);
} else {
  fail("POST /onboarding/applications (новый БИН) → 201", `status=${created.status}`);
}

// 2. Повтор того же БИН → 200 + существующий статус (AT-02; НЕ 409)
const dup = await req("/onboarding/applications", {
  method: "POST",
  body: JSON.stringify({ ...APPLY, consentSubject: "dup" }),
});
if (dup.status === 200 && dup.body?.bin === BIN && dup.body?.status) {
  check("Повтор БИН → 200 + существующий статус (AT-02, не 409)", true);
} else {
  fail("Повтор БИН → 200 (AT-02)", `status=${dup.status}, body=${JSON.stringify(dup.body)}`);
}

// 3. POST /operator/approvals/{id} → provisioning (tenant+счёт+роли)
let tenantId = null;
if (appId) {
  const approve = await req(`/operator/approvals/${appId}`, {
    method: "POST",
    body: JSON.stringify({ decision: "approve" }),
  });
  if (approve.status === 200 && approve.body?.status === "APPROVED" && approve.body?.tenantId) {
    tenantId = approve.body.tenantId;
    check("POST /operator/approvals/{id} → APPROVED + tenant", true);
  } else {
    fail("POST /operator/approvals/{id}", `status=${approve.status}, body=${JSON.stringify(approve.body)}`);
  }

  // повторное одобрение идемпотентно (тот же tenant)
  if (tenantId) {
    const re = await req(`/operator/approvals/${appId}`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    });
    const idemOk = re.status === 200 && re.body?.tenantId === tenantId;
    check("Повторное одобрение идемпотентно (тот же tenant)", idemOk, `tenant=${re.body?.tenantId}`);
  }
} else {
  fail("POST /operator/approvals/{id}", "нет appId (заявка не создалась)");
}

// 4. POST /auth/login: логинится ли заявитель после одобрения
let token = null;
let applicantLoginGap = false;
if (appId) {
  // заявитель после одобрения: логин по шаблону admin@<bin> (provisioning создаёт admin)
  const applicantLogin = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: `admin@${BIN}`, password: "demo-password" }),
  });
  if (applicantLogin.status === 200 && applicantLogin.body?.token) {
    token = applicantLogin.body.token;
    check("Заявитель логинится после одобрения", true);
  } else {
    applicantLoginGap = true;
    check("Заявитель логинится после одобрения", false, "нет пользователя у заявителя → GAP (использовать seeded-админа)");
  }
}

// fallback: seeded-админ (демо-путь при gap или фейле заявки)
if (!token) {
  const adminLogin = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: "admin@demo", password: "demo-password" }),
  });
  if (adminLogin.status === 200 && adminLogin.body?.token) {
    token = adminLogin.body.token;
    check("Seeded-админ логинится (fallback)", true);
  } else {
    fail("Seeded-админ логинится", `status=${adminLogin.status}`);
  }
}

// 5. GET бизнес-данных: с JWT → 200; без JWT → 401 «jwt required» (AT-16)
if (token) {
  const withJwt = await req("/api/products", { token });
  check("GET /api/products с JWT → 200", withJwt.status === 200, `status=${withJwt.status}`);
} else {
  fail("GET /api/products с JWT → 200", "нет токена");
}

const noJwt = await req("/api/products");
const at16Ok = noJwt.status === 401 && /jwt/i.test(noJwt.body?.message ?? "");
check("GET /api/products без JWT → 401 «jwt required» (AT-16)", at16Ok, `status=${noJwt.status}`);

// 6. MFA-негатив при MFA_ENABLED=true → 403
// ВНИМАНИЕ: сервер должен быть запущен с MFA_ENABLED=true (см. DEMO-0808.md).
// JWT с mfaCompleted=false (логин при включённом флаге) → ролевой эндпоинт = 403.
if (token) {
  const mfaLogin = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: "admin@demo", password: "demo-password" }),
  });
  if (mfaLogin.status === 200 && mfaLogin.body?.token) {
    const mfaProbe = await req("/api/admin/probe", { token: mfaLogin.body.token });
    check("MFA-негатив: без второго фактора → 403", mfaProbe.status === 403, `status=${mfaProbe.status}`);
  } else {
    fail("MFA-негатив: нет токена для probe", `login status=${mfaLogin.status}`);
  }
} else {
  fail("MFA-негатив: нет токена", "пропущен — нет токена");
}

// итог
const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`=== demo-smoke: ${results.length - failed.length}/${results.length} PASS${applicantLoginGap ? " (applicant-login GAP)" : ""} ===`);
if (failed.length) {
  process.exit(1);
}
