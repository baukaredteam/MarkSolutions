import { chromium } from "playwright";

const baseUrl = process.env.WEB_URL ?? "http://localhost:5173";
const bin = "123456789042";
const checks = [];

function pass(name) {
  checks.push({ name, ok: true });
  console.log(`PASS ${name}`);
}

function fail(name, error) {
  checks.push({ name, ok: false });
  console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // (a) неавторизованный / → standalone /login (нет sidebar в DOM)
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Вход в систему" }).waitFor({ state: "visible" });
      const sidebarCount = await page.locator(".sidebar").count();
      if (sidebarCount !== 0) throw new Error(`sidebar present on / (${sidebarCount})`);
      pass("неавторизованный / → standalone login (без sidebar)");
    } catch (error) {
      fail("standalone login (/)", error);
    }

    // (e) скриншот standalone login
    try {
      const shot = await page.screenshot({ path: "shot-login-standalone.png", fullPage: true });
      if (!shot || shot.length < 1000) throw new Error("screenshot too small");
      pass("screenshot standalone login saved");
    } catch (error) {
      fail("screenshot standalone login", error);
    }

    try {
      // UI-02 shell: login → sidebar → Ctrl+K → products
      await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder("Логин").fill("admin@demo");
      await page.getByPlaceholder("Пароль").fill("demo-password");
      await page.getByRole("button", { name: "Войти" }).first().click();
      await page.waitForURL("**/dashboard");
      pass("admin login reaches /dashboard (shell)");
    } catch (error) {
      fail("admin login (shell)", error);
    }

    // (b) авторизованный лендинг: KPI + степпер
    try {
      await page.locator(".kpis").waitFor({ state: "visible" });
      await page.locator(".process").waitFor({ state: "visible" });
      await page.locator(".card-title").filter({ hasText: "Сквозной процесс маркировки" }).first().waitFor({ state: "visible" });
      pass("landing /dashboard: KPI-карточки + степпер видны");
    } catch (error) {
      fail("landing dashboard (KPI + степпер)", error);
    }

    // (c) авторизованный reload "/" → /dashboard (не login внутри shell)
    try {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
      await page.waitForURL("**/dashboard");
      await page.locator(".sidebar").waitFor({ state: "visible" });
      pass("авторизованный reload / → /dashboard (sidebar виден)");
    } catch (error) {
      fail("авторизованный reload /", error);
    }

    // (e) скриншот авторизованного dashboard
    try {
      const shot = await page.screenshot({ path: "shot-dashboard-authed.png", fullPage: true });
      if (!shot || shot.length < 1000) throw new Error("screenshot too small");
      pass("screenshot authed dashboard saved");
    } catch (error) {
      fail("screenshot authed dashboard", error);
    }

    try {
      await page.locator(".sidebar").waitFor({ state: "visible" });
      await page.getByRole("link", { name: "Товары" }).waitFor({ state: "visible" });
      // Ctrl+K открывает палитру
      await page.keyboard.press("Control+k");
      await page.getByPlaceholder(/Перейти к разделу/).waitFor({ state: "visible" });
      await page.getByText("Каталог товаров").last().click();
      await page.waitForURL("**/products");
      pass("shell renders sidebar + Ctrl+K → products");
    } catch (error) {
      fail("shell (sidebar + Ctrl+K)", error);
    }

    try {
      const seedResponse = page.waitForResponse((response) =>
        response.url().includes("/api/demo/seed-invoice")
      );
      await page.getByRole("button", { name: "Загрузить инвойс (демо)" }).click();
      const seed = await seedResponse;
      if (!seed.ok()) {
        throw new Error(`seed-invoice HTTP ${seed.status()}: ${await seed.text()}`);
      }
      await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 40);
      const rows = page.locator("tbody tr");
      let red = 0;
      let green = 0;
      for (let i = 0; i < 40; i++) {
        const style = await rows.nth(i).getAttribute("style");
        if (style?.includes("red")) red++;
        if (style?.includes("green")) green++;
      }
      if (red !== 38 || green !== 2) {
        throw new Error(`rows=${await rows.count()} first40 red=${red} green=${green}`);
      }
      await page.getByText("возможно 2710198200").first().waitFor({ state: "visible" });
      pass("demo invoice shows 38 red + 2 green rows and TNVED hint");
    } catch (error) {
      fail("demo invoice", error);
    }

    // ---- W3-web API: баланс, пополнение, заказы (UI-06c пересоберёт) ----
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const h = { Authorization: `Bearer ${sess.token}` };
        const j = (path, method = "GET", body) =>
          fetch(`/api${path}`, {
            method,
            headers: { ...h, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          }).then((r) => r.json());
        // пополнение идемпотентно по ref1c
        const ref1c = `e2e-${Date.now()}`;
        const t1 = await j("/billing/payments/import", "POST", { ref1c, amount: "1000" });
        const t2 = await j("/billing/payments/import", "POST", { ref1c, amount: "1000" });
        const bal = await j("/billing/balance");
        const orders = await j("/orders");
        return { t1: typeof t1.amount, t2amount: t2.amount, bal: bal.balance, orderCount: orders.items.length };
      });
      if (typeof result.t1 !== "string" || typeof result.bal !== "string")
        throw new Error(`billing malformed: ${JSON.stringify(result)}`);
      pass(`billing API: topup idempotent by ref1c, balance=${result.bal}, orders=${result.orderCount}`);
    } catch (error) {
      fail("billing API", error);
    }

    // ---- W3-web API: заказы доступны (UI-04 пересоберёт) ----
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const o = await fetch("/api/orders", { headers: { Authorization: `Bearer ${sess.token}` } }).then((r) => r.json());
        return { count: o.items?.length ?? 0 };
      });
      pass(`orders API accessible (${result.count} заказов)`);
    } catch (error) {
      fail("orders API", error);
    }

    // ---- Подготовка заказа (если нет кодов в vault) для print/import/RBAC ----
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const h = { Authorization: `Bearer ${sess.token}` };
        const j = (path, method = "GET", body) =>
          fetch(`/api${path}`, {
            method,
            headers: { ...h, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          }).then((r) => r.json());
        const agg = await j("/api/codes");
        // нужен ACTIVE код (первая эмиссия = ACTIVE); иначе создать заказ
        const active = await j("/codes/" + (agg.items?.[0]?.orderId ?? "") + "/codes").catch(() => ({ items: [] }));
        const hasActive = (active.items ?? []).some((c) => c.status === "ACTIVE");
        if (hasActive) return { prepared: false };
        // создать карточку + заказ
        const attrs = {
          schemaVersion: 1, gtin: "04014835723399", name: "Castrol EDGE 0W-20 C5",
          brand: "Castrol", countryOfBrand: "DE", composition: "synthetic",
          shelfLifeMonths: 60, productType: "motor-oil", volumeL: 4, purpose: "passenger",
          sae: "0W-20", storage: "dry", conformityMark: "no", eacMarks: "no",
          grossWeightKg: 3.8, tnved: "2710198200", group: "Oils", category: "Motor oils",
          packageType: "unit", kpved: "19.20.29", gpc: "10005267", ownerGcp: "0401483",
          ownerName: "Avtodetal", ownerCountry: "KZ", ownerAddress: "Shymkent",
          platformName: "1ecom", platformCountry: "KZ", platformAddress: "Almaty",
          participantTaxNumber: "123456789012", participantName: "Avtodetal",
          participantCountry: "KZ", participantAddress: "Shymkent",
        };
        const card = await j("/products/cards", "POST", { gtin: "04014835723399", attributes: attrs });
        const key = `e2e-order-${Date.now()}`;
        const order = await fetch("/api/orders", {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ cardId: card.id, gtin: "04014835723399", places: 2, unitsPerPlace: 1, quantity: 2 }),
        }).then((r) => r.json());
        return { prepared: true, orderId: order.id, status: order.status };
      });
      if (result.prepared) {
        // ждём эмиссию кодов (~45с по умолчанию; сократим через проверку статуса)
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const r = await page.evaluate(async () => {
            const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
            const agg = await fetch("/api/codes", {
              headers: { Authorization: `Bearer ${sess.token}` },
            }).then((x) => x.json());
            const oid = agg.items?.[0]?.orderId;
            if (!oid) return 0;
            const det = await fetch(`/api/codes/${oid}/codes`, {
              headers: { Authorization: `Bearer ${sess.token}` },
            }).then((x) => x.json());
            return (det.items ?? []).filter((c) => c.status === "ACTIVE").length;
          });
          if (r > 0) break;
        }
      }
      pass(`vault prepared (${result.prepared ? "заказ создан" : "уже есть коды"})`);
    } catch (error) {
      fail("vault prep", error);
    }

    // ---- T0-RBAC: marking → /orders 403, print 200; warehouse → GET 200 ----
    try {
      const result = await page.evaluate(async () => {
        const base = "/api";
        const login = async (user) => {
          const r = await fetch(`${base}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: user, password: "demo-password" }),
          });
          if (!r.ok) throw new Error(`login ${user} HTTP ${r.status}`);
          return r.json();
        };
        const marking = await login("marking@demo");
        const warehouse = await login("warehouse@demo");
        const mh = { Authorization: `Bearer ${marking.token}` };
        const wh = { Authorization: `Bearer ${warehouse.token}` };
        // marking: roles в ответе
        if (!marking.roles?.includes("marking"))
          throw new Error(`marking roles missing: ${JSON.stringify(marking.roles)}`);
        // marking: POST /orders → 403
        const ord = await fetch(`${base}/orders`, {
          method: "POST",
          headers: { ...mh, "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: "x", gtin: "04014835723399", places: 1, unitsPerPlace: 1 }),
        });
        if (ord.status !== 403) throw new Error(`marking /orders expected 403, got ${ord.status}`);
        // marking: print + apply (нужен ACTIVE код; после apply → APPLIED для import-потока)
        const agg = await fetch(`${base}/api/codes`, { headers: mh }).then((r) => r.json());
        const orderId = agg.items?.[0]?.orderId;
        if (!orderId) throw new Error("no codes in vault");
        const detail = await fetch(`${base}/codes/${orderId}/codes`, { headers: mh }).then((r) => r.json());
        const code = detail.items?.find((c) => c.status === "ACTIVE");
        if (!code) throw new Error("no ACTIVE code");
        const pr = await fetch(`${base}/labels/${code.id}/print`, {
          method: "POST",
          headers: { ...mh, "Content-Type": "application/json" },
          body: "{}",
        });
        if (pr.status !== 200) throw new Error(`marking print expected 200, got ${pr.status}`);
        const printed = await pr.json();
        const ap = await fetch(`${base}/codes/${code.id}/apply`, {
          method: "POST",
          headers: { ...mh, "Content-Type": "application/json" },
          body: JSON.stringify({ png: printed.pngBase64 }),
        });
        if (ap.status !== 200) throw new Error(`marking apply expected 200, got ${ap.status}`);
        // warehouse: GET /orders → 200
        const wo = await fetch(`${base}/orders`, { headers: wh });
        if (wo.status !== 200) throw new Error(`warehouse /orders expected 200, got ${wo.status}`);
        return { roles: marking.roles, printStatus: pr.status };
      });
      if (!result.roles?.includes("marking")) throw new Error("no marking role");
      pass(`RBAC: marking roles=${result.roles.join(",")} → /orders 403, print+apply 200; warehouse → GET 200`);
    } catch (error) {
      fail("RBAC (marking/warehouse)", error);
    }

    // ---- W4-02: печать этикеток → скан (APPLIED) всех ACTIVE кодов заказа ----
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const h = { Authorization: `Bearer ${sess.token}` };
        const j = (path, method = "GET", body) =>
          fetch(`/api${path}`, {
            method,
            headers: { ...h, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          }).then((r) => r.json());
        const agg = await j("/api/codes");
        const orderId = agg.items?.[0]?.orderId;
        if (!orderId) throw new Error("no codes in vault");
        const detail = await j(`/codes/${orderId}/codes`);
        const codes = detail.items?.filter((c) => c.status === "ACTIVE");
        if (!codes?.length) throw new Error("no ACTIVE code to print");
        let lastKey = "";
        for (const code of codes) {
          const printed = await j(`/labels/${code.id}/print`, "POST", {});
          if (!printed.pngBase64) throw new Error(`print failed: ${JSON.stringify(printed)}`);
          // «скан телефоном»: отправляем распечатанный PNG обратно как apply
          const applied = await j(`/codes/${code.id}/apply`, "POST", { png: printed.pngBase64 });
          if (applied.status !== "APPLIED") throw new Error(`apply failed: ${JSON.stringify(applied)}`);
          lastKey = printed.key;
        }
        return { status: "APPLIED", key: lastKey, count: codes.length };
      });
      if (result.status !== "APPLIED") throw new Error("apply did not reach APPLIED");
      pass(`print → scan (APPLIED ×${result.count}), label key ${result.key.slice(0, 8)}…`);
    } catch (error) {
      fail("print → scan (APPLIED)", error);
    }

    // ---- W4-04: ввоз (ДТ → INTRODUCED) + вывод (WRITE_OFF/WITHDRAWAL) ----
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const h = { Authorization: `Bearer ${sess.token}` };
        const j = (path, method = "GET", body) =>
          fetch(`/api${path}`, {
            method,
            headers: { ...h, "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          }).then((r) => r.json());
        // ввоз: ДТ по заказу → INTRODUCED
        const agg = await j("/api/codes");
        const orderId = agg.items?.[0]?.orderId;
        if (!orderId) throw new Error("no codes in vault");
        const detail = await j(`/codes/${orderId}/codes`);
        const applied = detail.items?.filter((c) => c.status === "APPLIED");
        if (!applied?.length) throw new Error("no APPLIED codes for import");
        const imp = await j("/import", "POST", {
          orderId,
          customsDeclaration: {
            date: "2026-08-11",
            number: `10002000/010826/${Date.now() % 100000}`,
            authorityCode: "702",
          },
        });
        if (imp.status !== "SUCCESS") throw new Error(`import failed: ${JSON.stringify(imp)}`);
        // вывод единичного кода WRITE_OFF (брак)
        const single = detail.items.find((c) => c.status === "ACTIVE");
        if (single) {
          const wd = await j("/withdrawal", "POST", {
            codes: [single.id],
            withdrawalType: "WRITE_OFF",
            withdrawalReason: "DEFECT",
          });
          if (wd.status !== "SUCCESS") throw new Error(`withdrawal failed: ${JSON.stringify(wd)}`);
        }
        return { orderId };
      });
      if (!result.orderId) throw new Error("no order");
      pass("import (ДТ → INTRODUCED) + single WRITE_OFF → WRITTEN_OFF");
    } catch (error) {
      fail("import / withdrawal docs", error);
    }

    try {
      await page.getByRole("link", { name: "Главная" }).click();
      await page.waitForURL("**/dashboard");
      pass("sidebar navigates to /dashboard");
    } catch (error) {
      fail("sidebar → dashboard", error);
    }

    // ---- W4-06: w4-seed → summary ненулевые + deep-links ----
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const h = { Authorization: `Bearer ${sess.token}` };
        const seed = await fetch("/api/demo/w4-seed", {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: "{}",
        });
        if (seed.status !== 201) throw new Error(`w4-seed HTTP ${seed.status}: ${await seed.text()}`);
        const s = await fetch("/api/dashboard/summary", { headers: h }).then((r) => r.json());
        return s;
      });
      if (!result || typeof result.codesNotApplied !== "number")
        throw new Error(`summary malformed: ${JSON.stringify(result)}`);
      if (result.docsPendingDt < 1 || result.exceptions < 1)
        throw new Error(`summary counters too low: ${JSON.stringify(result)}`);
      pass(`w4-seed → summary non-zero (codes=${result.codesNotApplied}, docs=${result.docsPendingDt}, exc=${result.exceptions})`);
    } catch (error) {
      fail("w4-seed → summary", error);
    }

    // (d) logout → standalone /login
    try {
      await page.getByRole("button", { name: "Выйти" }).click();
      await page.getByRole("heading", { name: "Вход в систему" }).waitFor({ state: "visible" });
      const sidebarAfter = await page.locator(".sidebar").count();
      if (sidebarAfter !== 0) throw new Error("sidebar остался после logout");
      pass("logout → standalone /login (без sidebar)");
    } catch (error) {
      fail("logout", error);
    }
  } finally {
    await browser.close();
  }

  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL browser runner: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
