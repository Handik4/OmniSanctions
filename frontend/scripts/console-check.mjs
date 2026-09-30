// Headless smoke test: loads the built app against the LIVE contract and fails
// on any console error, uncaught exception or failed request.
//
//   npm run build && npm run console-check
//
// Env: CHROME_PATH (default: macOS Google Chrome), CHECK_URL (skip the built-in
// preview server and test an already running URL), SHOT_DIR (screenshots).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const PORT = 4173;
const URL_ = process.env.CHECK_URL ?? `http://localhost:${PORT}/`;
const SHOT_DIR = process.env.SHOT_DIR ?? resolve(root, ".console-check");
const CHROME =
  process.env.CHROME_PATH ??
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);

if (!CHROME) {
  console.error("No Chrome/Chromium found; set CHROME_PATH.");
  process.exit(2);
}
mkdirSync(SHOT_DIR, { recursive: true });

let server = null;
if (!process.env.CHECK_URL) {
  if (!existsSync(resolve(root, "dist/index.html"))) {
    console.error("dist/ missing - run `npm run build` first.");
    process.exit(2);
  }
  server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL_)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const problems = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
let exit = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900 });
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto(URL_, { waitUntil: "networkidle2", timeout: 60_000 });

  // Live contract load: the audit table must contain real cases from chain.
  await page.waitForFunction(() => document.querySelectorAll("tbody tr td.font-mono").length > 0, { timeout: 60_000 });
  const cases = await page.$$eval("tbody tr td.font-mono", (n) => n.map((x) => x.textContent));
  console.log(`live cases rendered: ${cases.join(", ")}`);
  const metricText = await page.$eval("section[aria-label='Compliance metrics']", (n) => n.textContent);
  console.log(`metrics: ${metricText.replace(/\s+/g, " ").slice(0, 200)}`);
  if (cases.length === 0) problems.push("no cases rendered from the live contract");

  // Single-line 64px navbar.
  const nav = await page.$eval("header", (h) => ({ h: h.getBoundingClientRect().height, wrap: getComputedStyle(h.firstElementChild).flexWrap }));
  console.log(`navbar height=${nav.h}px flex-wrap=${nav.wrap}`);
  if (Math.round(nav.h) !== 64) problems.push(`navbar height ${nav.h} != 64`);
  if (nav.wrap !== "nowrap") problems.push("navbar wraps");

  await page.screenshot({ path: resolve(SHOT_DIR, "dashboard.png"), fullPage: true });

  // Exercise interactions: sample chip, accordion, watchlist tab, certificate.
  await page.click("button[aria-label='Expand rationale']");
  await page.waitForSelector("text/Validator rationale");
  const chip = await page.$$eval("button", (b) => b.findIndex((x) => x.textContent?.includes("Lazarus Cluster")));
  if (chip >= 0) await (await page.$$("button"))[chip].click();
  await new Promise((r) => setTimeout(r, 1500)); // debounce + check_compliance read
  await page.click("[role=tab]:nth-child(2)");
  await page.waitForSelector("text/Source authority");
  await page.click("[role=tab]:nth-child(1)");
  const certBtn = await page.$$eval("button", (b) => b.findIndex((x) => x.textContent?.trim() === "Certificate"));
  if (certBtn >= 0) {
    await (await page.$$("button"))[certBtn].click();
    await page.waitForSelector("text/Certificate of Compliance Audit");
    await new Promise((r) => setTimeout(r, 2500)); // consensus record fetch
    await page.screenshot({ path: resolve(SHOT_DIR, "certificate.png") });
  } else {
    console.warn("note: no resolved case yet, certificate modal not exercised");
  }
  await page.setViewport({ width: 390, height: 800 });
  await page.reload({ waitUntil: "networkidle2" });
  const mobile = await page.$eval("header", (h) => h.getBoundingClientRect().height);
  if (Math.round(mobile) !== 64) problems.push(`mobile navbar height ${mobile} != 64`);
  await page.screenshot({ path: resolve(SHOT_DIR, "mobile.png") });
} catch (e) {
  problems.push(`check crashed: ${e instanceof Error ? e.message : e}`);
} finally {
  await browser.close();
  server?.kill();
}

if (problems.length) {
  console.error(`\nFAIL - ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  exit = 1;
} else {
  console.log("\nPASS - zero console errors, zero failed requests, live contract data rendered.");
}
process.exit(exit);
