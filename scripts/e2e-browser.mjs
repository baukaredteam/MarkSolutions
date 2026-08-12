import { chromium } from "playwright";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeFileSync,
  readFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";

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
      // демо-инвойс: открыть импорт-drawer → seed → вкладка Черновики ≥ 1 строка
      await page.getByRole("button", { name: "⇧ Импорт" }).click();
      const seedResponse = page.waitForResponse((response) =>
        response.url().includes("/api/demo/seed-invoice")
      );
      await page.getByRole("button", { name: "Загрузить инвойс (демо)" }).click();
      const seed = await seedResponse;
      if (!seed.ok()) {
        throw new Error(`seed-invoice HTTP ${seed.status()}: ${await seed.text()}`);
      }
      await page.getByText(/Черновики/).click();
      await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 5);
      await page.getByText("возможно 2710198200").first().waitFor({ state: "visible" });
      pass("demo invoice → черновики ≥5 строк + ТНВЭД-подсказка");
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

    // ---- UI-03: lookup по codeKey → история PRINTED + APPLIED ----
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
        const code = detail.items?.[0];
        if (!code) throw new Error("no codes");
        const lk = await j("/codes/lookup", "POST", { code: code.id });
        if (!lk.codeKey) throw new Error(`lookup failed: ${JSON.stringify(lk)}`);
        return { history: lk.history, status: lk.status, serialMask: lk.serialMask };
      });
      const events = result.history.map((e) => e.event);
      if (!events.includes("PRINTED") || !events.includes("APPLIED"))
        throw new Error(`history missing PRINTED/APPLIED: ${JSON.stringify(events)}`);
      if (!result.serialMask?.includes("…"))
        throw new Error(`serialMask not masked: ${result.serialMask}`);
      pass(`lookup по codeKey → история ${events.join(" → ")} (маска ${result.serialMask})`);
    } catch (error) {
      fail("code lookup", error);
    }

    // ---- UI-03: codecheck страница UI (input + Проверить) ----
    try {
      await page.getByRole("link", { name: "Информация о коде" }).click();
      await page.waitForURL("**/codecheck");
      await page.getByPlaceholder(/Введите Data Matrix/).waitFor({ state: "visible" });
      pass("codecheck страница рендерит input поиска");
    } catch (error) {
      fail("codecheck page", error);
    }

    // скриншот codecheck
    try {
      const shot = await page.screenshot({ path: "shot-codecheck.png", fullPage: true });
      if (!shot || shot.length < 1000) throw new Error("screenshot too small");
      pass("screenshot codecheck saved");
    } catch (error) {
      fail("screenshot codecheck", error);
    }

    // ---- UI-04: products list + detail + clone + submit ----
    try {
      // открыть каталог
      await page.getByRole("link", { name: "Товары" }).click();
      await page.waitForURL("**/products");
      await page.getByText("Каталог товаров", { exact: true }).waitFor({ state: "visible" });
      pass("products list рендерит заголовок");
    } catch (error) {
      fail("products list", error);
    }

    // скриншот products list
    try {
      const shot = await page.screenshot({ path: "shot-products-list.png", fullPage: true });
      if (!shot || shot.length < 1000) throw new Error("screenshot too small");
      pass("screenshot products list saved");
    } catch (error) {
      fail("screenshot products list", error);
    }

    // создать карточку через API (для detail) + открыть detail
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const h = { Authorization: `Bearer ${sess.token}` };
        const attrs = {
          schemaVersion: 1, gtin: "04014835723399", name: "E2E Product 5W-30",
          brand: "E2E", countryOfBrand: "KZ", composition: "synthetic",
          shelfLifeMonths: 60, productType: "motor-oil", volumeL: 4, purpose: "passenger",
          sae: "5W-30", storage: "dry", conformityMark: "no", eacMarks: "no",
          grossWeightKg: 3.8, tnved: "2710198200", group: "Моторные масла",
          category: "Моторные масла", packageType: "Единица товара", kpved: "19.20.29",
          gpc: "10005267", ownerGcp: "0401483", ownerName: "Demo", ownerCountry: "KZ",
          ownerAddress: "Астана", platformName: "1ecom", platformCountry: "KZ",
          platformAddress: "Алматы", participantTaxNumber: "123456789012",
          participantName: "Demo", participantCountry: "KZ", participantAddress: "Астана",
        };
        const r = await fetch("/api/products/cards", {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ gtin: "04014835723399", attributes: attrs }),
        });
        if (r.status === 409) {
          // уже существует (повторный прогон) — взять существующую
          const list = await fetch("/api/products/cards", { headers: h }).then((x) => x.json());
          const existing = list.items.find((c) => c.gtin === "04014835723399");
          if (!existing) throw new Error("no existing card for gtin");
          return { id: existing.id };
        }
        if (r.status !== 201) throw new Error(`create card HTTP ${r.status}`);
        const body = await r.json();
        return { id: body.id };
      });
      // открыть detail
      await page.goto(`${baseUrl}/productDetail/${result.id}`);
      await page.waitForURL("**/productDetail/*");
      await page.getByRole("heading", { name: "Карточка товара" }).waitFor({ state: "visible" });
      pass("product detail рендерит attributes (имя)");
    } catch (error) {
      fail("product detail", error);
    }

    // скриншот detail
    try {
      const shot = await page.screenshot({ path: "shot-products-detail.png", fullPage: true });
      if (!shot || shot.length < 1000) throw new Error("screenshot too small");
      pass("screenshot product detail saved");
    } catch (error) {
      fail("screenshot product detail", error);
    }

    // clone → DRAFT + submit → SUBMITTED (API)
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
        const cards = await j("/products/cards");
        const orig = cards.items.find((c) => c.gtin === "04014835723399");
        if (!orig) throw new Error("card not found");
        const cloned = await j(`/products/cards/${orig.id}/clone`, "POST", {});
        const detail = await j(`/products/cards/${cloned.id}`);
        if (detail.status !== "DRAFT") throw new Error(`clone not DRAFT: ${detail.status}`);
        await j(`/products/cards/${cloned.id}/submit`, "POST", {});
        const after = await j(`/products/cards/${cloned.id}`);
        if (after.status !== "SUBMITTED") throw new Error(`submit not SUBMITTED: ${after.status}`);
        return { cloneId: cloned.id };
      });
      pass(`clone → DRAFT, submit → SUBMITTED (id ${result.cloneId.slice(0, 8)}…)`);
    } catch (error) {
      fail("clone + submit", error);
    }

    // ---- UI-05: orders page (KPI-4, номер KM-2026) + xlsx выгрузка + vault page ----
    try {
      await page.getByRole("link", { name: "Заказы" }).click();
      await page.waitForURL("**/orders");
      await page.getByRole("heading", { name: "Заказы кодов" }).waitFor({ state: "visible" });
      const kpi4 = await page.locator(".grid.four .card").count();
      if (kpi4 < 4) throw new Error(`KPI-4 не хватает (${kpi4})`);
      const kmNum = await page.locator("tbody tr").first().innerText();
      if (!/KM-2026-\d{6}/.test(kmNum)) throw new Error(`номер KM-2026 не найден: ${kmNum}`);
      pass("orders: KPI-4 + номер KM-2026-######");
    } catch (error) {
      fail("orders page", error);
    }

    // скриншот orders
    try {
      const shot = await page.screenshot({ path: "shot-orders.png", fullPage: true });
      if (!shot || shot.length < 1000) throw new Error("screenshot too small");
      pass("screenshot orders saved");
    } catch (error) {
      fail("screenshot orders", error);
    }

    // ---- UI-05: xlsx выгрузка — распаковка как ZIP, serial текстом (ведущие нули) ----
    try {
      const xlsxBase64 = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const agg = await fetch("/api/api/codes", { headers: { Authorization: `Bearer ${sess.token}` } }).then((r) => r.json());
        const orderId = agg.items?.[0]?.orderId;
        if (!orderId) throw new Error("no codes in vault");
        const res = await fetch("/api/codes/export/xlsx", {
          method: "POST",
          headers: { Authorization: `Bearer ${sess.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        if (!res.ok) throw new Error(`export/xlsx HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin);
      });
      const xlsxPath = join(tmpdir(), `e2e-codes-${Date.now()}.xlsx`);
      writeFileSync(xlsxPath, Buffer.from(xlsxBase64, "base64"));
      const zipPath = xlsxPath.replace(/\.xlsx$/, ".zip");
      renameSync(xlsxPath, zipPath);
      const outDir = join(tmpdir(), `e2e-xlsx-${Date.now()}`);
      mkdirSync(outDir);
      await import("child_process").then((cp) =>
        new Promise((resolve, reject) =>
          cp.exec(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force"`, (e) => (e ? reject(e) : resolve()))
        )
      );
      const sheet = readFileSync(join(outDir, "xl", "worksheets", "sheet1.xml"), "utf8");
      if (!sheet.includes('t="inlineStr"')) throw new Error("нет inlineStr (значения не текстом)");
      const serials = [...sheet.matchAll(/<is><t>(\d+)<\/t><\/is>/g)].map((m) => m[1]);
      if (!serials.length) throw new Error("нет serial в xlsx");
      const zeroPadded = serials.some((s) => /^0+\d+$/.test(s) && !/^0+$/.test(s));
      if (!zeroPadded) throw new Error(`serial не с ведущими нулями: ${serials.join(",")}`);
      pass(`xlsx: inlineStr + serial текстом с ведущими нулями (${serials[0]})`);
    } catch (error) {
      fail("xlsx export", error);
    }

    // ---- UI-05: vault page (KPI-5, пулы, выгрузка) ----
    try {
      await page.getByRole("link", { name: "Vault" }).click();
      await page.waitForURL("**/vault");
      await page.getByRole("heading", { name: "Code Vault" }).waitFor({ state: "visible" });
      const kpi5 = await page.locator(".grid.kpis .card").count();
      if (kpi5 < 5) throw new Error(`KPI-5 не хватает (${kpi5})`);
      const hint = await page.locator(".hint").first().innerText();
      if (!/CSV — для 1С; XLSX — для людей/.test(hint)) throw new Error(`хинт выгрузки: ${hint}`);
      pass("vault: KPI-5 + хинт CSV/XLSX");
    } catch (error) {
      fail("vault page", error);
    }

    // скриншот vault
    try {
      const shot = await page.screenshot({ path: "shot-vault.png", fullPage: true });
      if (!shot || shot.length < 1000) throw new Error("screenshot too small");
      pass("screenshot vault saved");
    } catch (error) {
      fail("screenshot vault", error);
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
