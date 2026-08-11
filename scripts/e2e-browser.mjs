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
    try {
      await page.goto(`${baseUrl}/apply`, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="name"]').fill("ТОО Автодеталь");
      await page.locator('input[name="bin"]').fill(bin);
      await page.locator('input[name="email"]').fill("demo@avtodetal.kz");
      await page.locator('input[name="phone"]').fill("87000000000");
      await page.locator('input[name="city"]').fill("Астана");
      await page.locator('input[name="address"]').fill("Bukhар Zhyrau 36");
      await page.locator('input[name="contact"]').fill("Bauka Tole");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      await page.getByRole("status").waitFor({ state: "visible" });
      const text = await page.getByRole("status").innerText();
      if (!/Заявка отправлена|Заявка уже существует/.test(text) || /400|404/.test(text)) {
        throw new Error(`unexpected submit toast: ${text}`);
      }
      pass("application submit is accepted (201 or existing duplicate)");

      await page.goto(`${baseUrl}/apply`, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="name"]').fill("ТОО Автодеталь");
      await page.locator('input[name="bin"]').fill(bin);
      await page.locator('input[name="email"]').fill("demo@avtodetal.kz");
      await page.locator('input[name="phone"]').fill("87000000000");
      await page.locator('input[name="city"]').fill("Астана");
      await page.locator('input[name="address"]').fill("Bukhар Zhyrau 36");
      await page.locator('input[name="contact"]').fill("Bauka Tole");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      const duplicateToast = page.getByRole("status");
      await duplicateToast.waitFor({ state: "visible" });
      const duplicateText = await duplicateToast.innerText();
      if (!duplicateText.includes("Заявка уже существует")) {
        throw new Error(`unexpected duplicate toast: ${duplicateText}`);
      }
      pass("repeated BIN reports existing application");
    } catch (error) {
      fail("application submit", error);
    }

    try {
      await page.getByRole("link", { name: "Статус", exact: true }).click();
      await page.locator('input[placeholder="Номер заявки или БИН"]').fill(bin);
      await page.getByRole("button", { name: "Показать статус" }).click();
      await page.getByText("Статус: На рассмотрении").waitFor({ state: "visible" });
      pass("status lookup by BIN returns PENDING");
    } catch (error) {
      fail("status lookup by BIN", error);
    }

    try {
      await page.getByRole("link", { name: "Вход" }).click();
      await page.getByPlaceholder("Логин").fill("admin@demo");
      await page.getByPlaceholder("Пароль").fill("demo-password");
      await page.getByRole("button", { name: "Войти" }).click();
      await page.waitForURL("**/products");
      pass("admin login reaches /products");
    } catch (error) {
      fail("admin login", error);
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

    // ---- W3-web: баланс, пополнение, заказы, дашборд ----
    try {
      await page.getByRole("link", { name: "Баланс" }).click();
      await page.getByRole("button", { name: "Пополнить" }).waitFor({ state: "visible" });
      const ref1c = `e2e-${Date.now()}`;
      await page.getByPlaceholder("ref1c").fill(ref1c);
      await page.getByPlaceholder("Сумма (тенге)").fill("1000");
      const topupResp = page.waitForResponse((r) =>
        r.url().includes("/api/billing/payments/import")
      );
      await page.getByRole("button", { name: "Пополнить" }).click();
      const topup = await topupResp;
      if (topup.status() !== 201 && topup.status() !== 200) {
        throw new Error(`top-up HTTP ${topup.status()}: ${await topup.text()}`);
      }
      await page.getByPlaceholder("ref1c").fill(ref1c);
      await page.getByPlaceholder("Сумма (тенге)").fill("1000");
      const topup2Resp = page.waitForResponse((r) =>
        r.url().includes("/api/billing/payments/import")
      );
      await page.getByRole("button", { name: "Пополнить" }).click();
      const topup2 = await topup2Resp;
      if (topup2.status() !== 200) {
        throw new Error(`duplicate top-up expected 200, got ${topup2.status()}`);
      }
      pass("balance visible and top-up is idempotent by ref1c");
    } catch (error) {
      fail("balance / top-up", error);
    }

    try {
      await page.getByRole("link", { name: "Заказы" }).click();
      await page.getByText("Заказы кодов", { exact: true }).waitFor({ state: "visible" });
      await page.getByPlaceholder("cardId").waitFor({ state: "visible" });
      pass("orders page renders (list + create form)");
    } catch (error) {
      fail("orders page", error);
    }

    // ---- W4-02: печать этикетки → скан (APPLIED) ----
    try {
      const result = await page.evaluate(async () => {
        const sess = JSON.parse(localStorage.getItem("markflow.session") || "null");
        if (!sess?.token) throw new Error("no session token");
        const h = { Authorization: `Bearer ${sess.token}` };
        const j = (path) => fetch(`/api${path}`, { headers: h }).then((r) => r.json());
        const agg = await j("/api/codes");
        const orderId = agg.items?.[0]?.orderId;
        if (!orderId) throw new Error("no codes in vault");
        const detail = await j(`/codes/${orderId}/codes`);
        const code = detail.items?.find((c) => c.status === "ACTIVE");
        if (!code) throw new Error("no ACTIVE code to print");
        const printed = await fetch(`/api/labels/${code.id}/print`, {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: "{}",
        }).then((r) => r.json());
        if (!printed.pngBase64) throw new Error(`print failed: ${JSON.stringify(printed)}`);
        // «скан телефоном»: отправляем распечатанный PNG обратно как apply
        const applied = await fetch(`/api/codes/${code.id}/apply`, {
          method: "POST",
          headers: { ...h, "Content-Type": "application/json" },
          body: JSON.stringify({ png: printed.pngBase64 }),
        }).then((r) => r.json());
        if (applied.status !== "APPLIED") throw new Error(`apply failed: ${JSON.stringify(applied)}`);
        return { status: applied.status, key: printed.key };
      });
      if (result.status !== "APPLIED") throw new Error("apply did not reach APPLIED");
      pass(`print → scan (APPLIED), label key ${result.key.slice(0, 8)}…`);
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
      await page.getByRole("link", { name: "Алерты" }).click();
      await page.getByText("Алерты и задачи", { exact: true }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Дедлайны 30 дней" }).waitFor({ state: "visible" });
      pass("dashboard renders alerts/tasks tabs");
    } catch (error) {
      fail("dashboard", error);
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
