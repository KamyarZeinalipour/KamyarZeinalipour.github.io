/* Share images (1200 x 630) for each paper page: title, authors, venue, and a still of the
   paper's animation when it has one. Needs a local server on the repository root:
     python3 -m http.server 8741   (in the repository root)
     node tools/build-cards.mjs
   Writes images/papers/<slug>.jpg; build-papers.mjs points og:image at them. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PAPERS } from "../assets/data.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE = process.env.BASE || "http://localhost:8741";
const META = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/papers-meta.json"), "utf8"));
const slug = (p) => (p.t.split(":")[0] + " " + p.y).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-+$/, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const prof = fs.mkdtempSync(path.join(os.tmpdir(), "cards-"));
const CH = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(CH, ["--headless=new", "--remote-debugging-port=9343", `--user-data-dir=${prof}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let tabs;
for (let i = 0; i < 300; i++) { try { tabs = await (await fetch("http://127.0.0.1:9343/json/list")).json(); if (tabs.some((t) => t.type === "page")) break; } catch {} await sleep(200); }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;

fs.mkdirSync(path.join(ROOT, "images/papers"), { recursive: true });
for (const p of PAPERS) {
  const m = META[p.t], s = slug(p);
  // 1. a still of the animation, drawn in its finished state (reduced motion), dark theme
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${BASE}/papers/${s}.html` });
  await sleep(4500);
  const box = await ev(`(()=>{const v=document.querySelector('#paper-scene .st-view'); if(!v||!v.children.length) return null; const r=v.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
  let still = null;
  if (box && box.w > 50 && box.h > 50) {
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 760), scale: 1 } });
    still = shot.data;
  }
  // 2. the card
  const authors = m.authors.length > 8 ? [...m.authors.slice(0, 4), `and ${m.authors.length - 4} others, including Kamyar Zeinalipour`] : m.authors;
  const authorsHtml = authors.map((a) => (a === "Kamyar Zeinalipour" ? `<b>${esc(a)}</b>` : esc(a).replace("including Kamyar Zeinalipour", "including <b>Kamyar Zeinalipour</b>"))).join(", ");
  const venue = p.v.includes(String(m.date.slice(0, 4))) ? p.v : `${p.v}, ${m.date.slice(0, 4)}`;
  const long = p.t.length > 95, mid = p.t.length > 70;
  const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:wght@600&family=Vazirmatn:wght@400;600&display=swap">
<style>
html,body{margin:0;width:1200px;height:630px;background:#141110;color:#f2ede6;font-family:Vazirmatn,sans-serif;overflow:hidden}
.card{display:grid;grid-template-columns:${still ? "1fr 420px" : "1fr"};gap:44px;height:630px;box-sizing:border-box;padding:56px 60px 52px}
.text{display:flex;flex-direction:column;min-width:0}
.site{font-size:20px;color:#aaa29b;letter-spacing:.01em;margin:0 0 26px}
.site span{color:#e8845a}
h1{font:600 ${long ? 40 : mid ? 46 : 54}px/1.12 Spectral,Georgia,serif;margin:0 0 22px;text-wrap:balance}
.auth{font-size:21px;line-height:1.45;color:#d6cfc6;margin:0 0 10px}
.auth b{color:#e8845a;font-weight:600}
.venue{font-size:20px;color:#aaa29b;margin:0}
.bar{margin-top:auto;height:6px;width:120px;background:#e8845a;border-radius:3px}
.still{align-self:center;background:#1c1816;border:1px solid #2e2825;border-radius:14px;padding:14px;display:flex;align-items:center;justify-content:center;max-height:520px;overflow:hidden}
.still img{max-width:100%;max-height:490px;display:block}
</style>
<div class="card"><div class="text"><p class="site">kamyarzeinalipour.github.io <span>/ papers</span></p><h1>${esc(p.t)}</h1>
<p class="auth">${authorsHtml}</p><p class="venue">${esc(venue)}</p><div class="bar"></div></div>
${still ? `<div class="still"><img src="data:image/png;base64,${still}"></div>` : ""}</div>`;
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  const tmp = path.join(prof, "card.html");
  fs.writeFileSync(tmp, html);
  await send("Page.navigate", { url: "file://" + tmp });
  await sleep(1200);
  await ev("document.fonts.ready.then(()=>true)");
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
  fs.writeFileSync(path.join(ROOT, "images/papers", s + ".jpg"), Buffer.from(shot.data, "base64"));
  console.log(s, still ? "with animation" : "text only");
}
ws.close(); chrome.kill(); process.exit(0);
