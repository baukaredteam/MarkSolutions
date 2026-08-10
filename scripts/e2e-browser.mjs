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
      await page.goto(`${baseUrl}/apply`, { waitUntil: "networkidle" });
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

      await page.goto(`${baseUrl}/apply`, { waitUntil: "networkidle" });
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
  } finally {
    await browser.close();
  }

  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL browser runner: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
});
