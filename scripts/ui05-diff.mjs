// UI-05: pixel-diff orders + vault (наш web vs ui-reference.html). node scripts/ui05-diff.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PNG } from "pngjs";

const root = path.join(fileURLToPath(import.meta.url), "..", "..");
const protoUrl = `file://${path.join(root, "docs", "ui-reference.html")}`;
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";

async function pixelDiff(browser, a, b) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(a, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(900);
  const imgA = await page.screenshot({ fullPage: true });
  await page.goto(b, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(900);
  const imgB = await page.screenshot({ fullPage: true });
  const pngA = PNG.sync.read(imgA);
  const pngB = PNG.sync.read(imgB);
  const width = Math.min(pngA.width, pngB.width);
  const height = Math.min(pngA.height, pngB.height);
  let total = 0;
  let n = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * pngA.width + x) * 4;
      const d =
        Math.abs(pngA.data[idx] - pngB.data[idx]) +
        Math.abs(pngA.data[idx + 1] - pngB.data[idx + 1]) +
        Math.abs(pngA.data[idx + 2] - pngB.data[idx + 2]);
      total += d;
      n++;
    }
  }
  await page.close();
  return (total / n / 765) * 100;
}

async function protoShot(browser, pageId) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(protoUrl, { waitUntil: "networkidle" }).catch(() => {});
  await page.evaluate((id) => {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("shell").style.display = "grid";
    const show = window.showPage;
    if (typeof show === "function") show(id);
    else {
      document.querySelectorAll(".page").forEach((s) => s.classList.remove("active"));
      const target = document.getElementById(id);
      if (target) target.classList.add("active");
    }
  }, pageId);
  await page.waitForTimeout(600);
  const buf = await page.screenshot({ fullPage: true });
  await page.close();
  return buf;
}

async function webShot(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(900);
  const buf = await page.screenshot({ fullPage: true });
  await page.close();
  return buf;
}

function diffBuf(a, b) {
  const pngA = PNG.sync.read(a);
  const pngB = PNG.sync.read(b);
  const width = Math.min(pngA.width, pngB.width);
  const height = Math.min(pngA.height, pngB.height);
  let total = 0;
  let n = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idxA = (y * pngA.width + x) * 4;
      const idxB = (y * pngB.width + x) * 4;
      const d =
        Math.abs(pngA.data[idxA] - pngB.data[idxB]) +
        Math.abs(pngA.data[idxA + 1] - pngB.data[idxB + 1]) +
        Math.abs(pngA.data[idxA + 2] - pngB.data[idxB + 2]);
      total += d;
      n++;
    }
  }
  return n ? (total / n / 765) * 100 : NaN;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const protoOrders = await protoShot(browser, "orders");
  const protoVault = await protoShot(browser, "vault");
  // авторизованные страницы
  const auth = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await auth.goto(`${WEB_URL}/login`, { waitUntil: "domcontentloaded" });
  await auth.getByPlaceholder("Логин").fill("admin@demo");
  await auth.getByPlaceholder("Пароль").fill("demo-password");
  await auth.getByRole("button", { name: "Войти" }).first().click();
  await auth.waitForURL("**/dashboard");
  await auth.goto(`${WEB_URL}/orders`, { waitUntil: "networkidle" }).catch(() => {});
  await auth.waitForTimeout(900);
  const webOrders = await auth.screenshot({ fullPage: true });
  await auth.goto(`${WEB_URL}/vault`, { waitUntil: "networkidle" }).catch(() => {});
  await auth.waitForTimeout(900);
  const webVault = await auth.screenshot({ fullPage: true });
  await auth.close();
  await browser.close();

  const dOrders = diffBuf(protoOrders, webOrders);
  const dVault = diffBuf(protoVault, webVault);
  console.log(`orders diff: ${dOrders.toFixed(2)}%`);
  console.log(`vault  diff: ${dVault.toFixed(2)}%`);
  const ok = dOrders <= 10 && dVault <= 10;
  console.log(ok ? "PASS <=10%" : "FAIL >10%");
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(`FAIL runner: ${e.stack}`);
  process.exitCode = 1;
});
