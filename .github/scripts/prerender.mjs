// Bake the lists that app.js draws into the HTML, so crawlers and link
// previews that do not run JavaScript still see every paper, project and update.
// app.js replaces each mount's children on load, so nothing is shown twice.
// The deploy workflow runs this on every push; locally:
//   python3 -m http.server 8731 &   node .github/scripts/prerender.mjs .
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SITE = path.resolve(process.argv[2] || "new");
const BASE = process.env.BASE || "http://localhost:8731/";
const MOUNTS = ["papers-out", "releases-out", "built-out", "updates-out", "teaching-out",
  "path-out", "awards-out", "service-out", "talks-out", "certs-out"];
const PAGES = ["index", "research", "projects", "publications", "teaching", "updates", "about"];
const MARK = "<!-- prerendered from data.js; app.js redraws it -->";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CH = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prof = fs.mkdtempSync(path.join(os.tmpdir(), "pre-prof-"));
const chrome = spawn(CH, ["--headless=new", "--no-first-run", "--no-sandbox", "--remote-debugging-port=9334",
  `--user-data-dir=${prof}`, "about:blank"], { stdio: "ignore" });
let tabs;
// Chrome can be slow to start on a busy build machine: wait up to a minute for a page target.
for (let i = 0; i < 300; i++) {
  try { tabs = await (await fetch("http://127.0.0.1:9334/json/list")).json(); if (tabs.some((t) => t.type === "page")) break; } catch {}
  await sleep(200);
}
if (!tabs || !tabs.some((t) => t.type === "page")) throw new Error("Chrome did not start within 60 seconds");
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.result.value;
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

// Replace the children of the element with id="X" in `html`, counting nested
// tags of the same name to find its closing tag.
function fill(html, mountId, inner) {
  const open = new RegExp(`<([a-z]+)\\b[^>]*\\bid="${mountId}"[^>]*>`).exec(html);
  if (!open) return html;
  const tag = open[1];
  const start = open.index + open[0].length;
  const re = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) break;
  }
  if (!m) throw new Error(`unbalanced <${tag}> for #${mountId}`);
  const indent = (html.slice(0, open.index).match(/[ \t]*$/) || [""])[0];
  return html.slice(0, start) + `\n${indent}  ${MARK}\n${indent}  ${inner.trim()}\n${indent}` + html.slice(m.index);
}

for (const pg of PAGES) {
  await send("Page.navigate", { url: `${BASE}${pg}.html?prerender=${Date.now()}` });
  await sleep(3500);
  const got = JSON.parse(await evaluate(`JSON.stringify(Object.fromEntries(${JSON.stringify(MOUNTS)}
    .map(id => [id, document.getElementById(id)]).filter(([, n]) => n).map(([id, n]) => [id, n.innerHTML])))`));
  const file = path.join(SITE, `${pg}.html`);
  let html = fs.readFileSync(file, "utf8");
  for (const [mid, inner] of Object.entries(got)) {
    if (/empty-note/.test(inner) && !/<(li|tr|article)\b/.test(inner)) throw new Error(`${pg}#${mid} did not render`);
    html = fill(html, mid, inner);
  }
  fs.writeFileSync(file, html);
  console.log(pg, Object.keys(got).join(", ") || "(no lists)");
}
ws.close(); chrome.kill(); process.exit(0);
