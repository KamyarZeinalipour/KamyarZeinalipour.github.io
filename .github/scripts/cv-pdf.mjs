// Print resume.html and cv-full.html to PDF with headless Chrome, using the
// page's own print styles. The deploy workflow runs this after tools/build-cv.mjs;
// locally:  python3 -m http.server 8731 &   node .github/scripts/cv-pdf.mjs .
// Warns (a GitHub annotation, not a failed deploy) if the resume no longer fits on one page.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SITE = path.resolve(process.argv[2] || ".");
const BASE = process.env.BASE || "http://localhost:8731/";
const JOBS = [
  { page: "resume.html", out: "Kamyar-Zeinalipour-Resume.pdf", maxPages: 1 },
  { page: "cv-full.html", out: "Kamyar-Zeinalipour-CV.pdf" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CH = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "cvpdf-prof-"));
const chrome = spawn(CH, ["--headless=new", "--no-first-run", "--no-sandbox", "--remote-debugging-port=9335",
  `--user-data-dir=${prof}`, "about:blank"], { stdio: "ignore" });
let tabs;
for (let i = 0; i < 300; i++) {
  try { tabs = await (await fetch("http://127.0.0.1:9335/json/list")).json(); if (tabs.some((t) => t.type === "page")) break; } catch {}
  await sleep(200);
}
if (!tabs || !tabs.some((t) => t.type === "page")) throw new Error("Chrome did not start within 60 seconds");
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.result.value;

for (const job of JOBS) {
  await send("Page.navigate", { url: `${BASE}${job.page}?pdf=${Date.now()}` });
  await sleep(2500);
  await evaluate("document.fonts.ready.then(() => true)");
  if (!(await evaluate("!!document.querySelector('.cv-doc')"))) throw new Error(`${BASE}${job.page} did not load the CV`);
  const r = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: false, generateTaggedPDF: true });
  if (!r.result) throw new Error(`${job.page}: ${JSON.stringify(r.error)}`);
  const buf = Buffer.from(r.result.data, "base64");
  fs.writeFileSync(path.join(SITE, job.out), buf);
  const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`${job.out}: ${pages} page${pages === 1 ? "" : "s"}, ${Math.round(buf.length / 1024)} KB`);
  if (job.maxPages && pages > job.maxPages) console.log(`::warning::${job.page} now runs to ${pages} pages; shorten CV.jobs in data.js so it fits ${job.maxPages}.`);
}
ws.close(); chrome.kill(); process.exit(0);
