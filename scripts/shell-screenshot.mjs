// Скриншот-сравнение shell (UI-SPEC §9): login + dashboard stub + sidebar.
// Прототип: docs/ui-reference.html (localhost:port via file? file:// безопаснее).
// Наш web: vite build → preview на :4173.
// Пиксельный diff через PNG-пиксели (наивный, без pngjs → используем canvas через playwright).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.join(fileURLToPath(import.meta.url), "..", "..");
const protoPath = path.join(root, "docs", "ui-reference.html");
const protoUrl = `file://${protoPath}`;
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";

const results = [];

function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS ${name}`);
}
function fail(name, err) {
  results.push({ name, ok: false });
  console.error(`FAIL ${name}: ${err instanceof Error ? err.message : err}`);
}

// наивный diff: средняя абсолютная разница по пикселям (RGBA), full-page screenshot
async function pixelDiff(browser, a, b) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(a, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(900);
  const imgA = await page.screenshot({ fullPage: true });
  await page.goto(b, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(900);
  const imgB = await page.screenshot({ fullPage: true });
  const { PNG } = await import("pngjs");
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
  const pct = (total / n / 765) * 100;
  return pct;
}

async function main() {
  // Скрипт ожидает запущенный vite preview (или dev) на WEB_URL.
  // Запуск: node scripts/shell-screenshot.mjs (WEB_URL по умолчанию :5173)
  const webUrl = WEB_URL;

  const browser = await chromium.launch({ headless: true });
  try {
    // 1) login: прототип (file://) vs наш /login
    const loginDiff = await pixelDiff(browser, protoUrl, `${webUrl}/login`);
    console.log(`login diff: ${loginDiff.toFixed(2)}%`);
    if (loginDiff <= 15) pass(`login screen diff <=15% (${loginDiff.toFixed(2)}%)`);
    else fail(`login screen diff`, new Error(`${loginDiff.toFixed(2)}% > 15%`));
  } catch (e) {
    fail("login screenshot", e);
  }

  await browser.close();
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`FAIL runner: ${e.stack}`);
  process.exitCode = 1;
});
