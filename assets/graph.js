/* The work as a knowledge graph, for the home page.
   Nodes: the four lines of work, the languages, and every paper. Edges: a paper's
   subjects and, where certain, its language. The layout is computed once with a
   small force simulation (seeded, so it is the same on every visit), then the
   graph assembles in a single orchestrated sequence and stays still. */
import { PAPERS, TOPICS, LANGS, PAPER_LANGS, VILLANOVA, VILLANOVA_LANGS } from "./data.js";

const NS = "http://www.w3.org/2000/svg";
const $ = (sel, root = document) => root.querySelector(sel);
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const svgEl = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
const slug = (p) => (p.t.split(":")[0] + " " + p.y).toLowerCase()
  .normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 640, H = 600, CX = W / 2, CY = H / 2;
// Open European LLMs sits on top, apart from the four research lines below it.
const ANCHOR = { llm: [322, 70], edu: [180, 215], lang: [465, 215], ling: [190, 450], sci: [455, 450] };

function buildModel() {
  const nodes = [];
  const edges = [];
  const byId = new Map();
  const add = (n) => { nodes.push(n); byId.set(n.id, n); return n; };

  for (const [k, label] of Object.entries(TOPICS)) {
    const [x, y] = ANCHOR[k];
    add({ id: `t:${k}`, kind: "topic", key: k, label, x, y, fixed: true, lead: k === "llm" });
  }
  const used = new Set(Object.values(PAPER_LANGS).flat());
  const rand = rng(7);
  for (const [k, v] of Object.entries(LANGS)) {
    if (!used.has(k)) continue;
    add({ id: `l:${k}`, kind: "lang", key: k, label: v.native, name: v.name,
      x: CX + (rand() - 0.5) * 200, y: CY + (rand() - 0.5) * 200 });
  }
  // Villanova releases: model nodes on the Open European LLMs line, linked to their five languages.
  VILLANOVA.forEach((r, i) => {
    const n = add({ id: `r:${r.id}`, kind: "release", release: r,
      x: ANCHOR.llm[0] + (i - 1) * 60, y: ANCHOR.llm[1] + 50 });
    edges.push({ a: n, b: byId.get("t:llm"), kind: "topic" });
    for (const l of VILLANOVA_LANGS) if (byId.has(`l:${l}`)) edges.push({ a: n, b: byId.get(`l:${l}`), kind: "lang" });
  });
  PAPERS.forEach((p, i) => {
    const n = add({ id: `p:${i}`, kind: "paper", paper: p,
      x: CX + (rand() - 0.5) * 300, y: CY + (rand() - 0.5) * 300 });
    for (const t of p.topics) edges.push({ a: n, b: byId.get(`t:${t}`), kind: "topic" });
    const key = Object.keys(PAPER_LANGS).find((k) => p.t.startsWith(k));
    for (const l of key ? PAPER_LANGS[key] : []) edges.push({ a: n, b: byId.get(`l:${l}`), kind: "lang" });
  });
  return { nodes, edges, byId };
}

function layout({ nodes, edges }) {
  const steps = 420;
  for (let s = 0; s < steps; s++) {
    const cool = 1 - s / steps;
    for (const n of nodes) { n.fx = 0; n.fy = 0; }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 0.01;
        const heavy = (k) => k === "topic" || k === "lang";
        const big = heavy(a.kind) && heavy(b.kind);
        const rep = (!heavy(a.kind) && !heavy(b.kind) ? 380 : big ? 5200 : 1400) / d2;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.fx += dx * rep; a.fy += dy * rep;
        b.fx -= dx * rep; b.fy -= dy * rep;
      }
    }
    for (const e of edges) {
      const rest = e.kind === "topic" ? 92 : 58;
      const k = e.kind === "topic" ? 0.018 : 0.03;
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - rest) * k;
      e.a.fx += (dx / d) * f; e.a.fy += (dy / d) * f;
      e.b.fx -= (dx / d) * f; e.b.fy -= (dy / d) * f;
    }
    for (const n of nodes) {
      if (n.fixed) continue;
      n.fx += (CX - n.x) * 0.004;
      n.fy += (CY - n.y) * 0.004;
      const m = Math.min(1, Math.hypot(n.fx, n.fy)) || 1;
      n.x += (n.fx / Math.max(m, 1)) * 6 * cool + n.fx * 0.6 * cool;
      n.y += (n.fy / Math.max(m, 1)) * 6 * cool + n.fy * 0.6 * cool;
      n.x = Math.max(36, Math.min(W - 36, n.x));
      n.y = Math.max(30, Math.min(H - 30, n.y));
    }
  }
}

/* Labels are measured at the size they are drawn (larger on phones). A language
   label that overlaps another label moves its node clear, and a paper dot hidden
   under a label moves just outside it. Runs once the svg is in the page. */
function untangle(nodes) {
  const labelled = nodes.filter((n) => n.kind === "topic" || n.kind === "lang");
  const box = (n) => {
    const b = n.el.querySelector("text").getBBox();
    return { x: n.x + b.x - 4, y: n.y + b.y - 3, w: b.width + 8, h: b.height + 6, n };
  };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    // Labels, plus the circles of the lines of work, which a label must not cover.
    const circles = nodes.filter((m) => m.kind === "topic").map((m) => ({ x: m.x - 16, y: m.y - 16, w: 32, h: 32, n: m }));
    const boxes = [...labelled.map(box), ...circles];
    for (const a of boxes) {
      if (a.n.kind !== "lang" || a.w === 32) continue;
      for (const b of boxes) {
        if (a === b || !hit(a, b)) continue;
        const up = a.y + a.h / 2 < b.y + b.h / 2;
        a.n.y += up ? -(a.y + a.h - b.y) - 1 : b.y + b.h - a.y + 1;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  const boxes = labelled.map(box);
  for (const n of nodes) {
    if (n.kind !== "paper" && n.kind !== "release") continue;
    for (const b of boxes) {
      if (n.x < b.x - 5 || n.x > b.x + b.w + 5 || n.y < b.y - 5 || n.y > b.y + b.h + 5) continue;
      n.y = n.y < b.y + b.h / 2 ? b.y - 7 : b.y + b.h + 7;
    }
  }
}

export function buildGraph(mount = $("#fig-graph"), opts = {}) {
  if (!mount) return;
  const model = buildModel();
  layout(model);
  const { nodes, edges } = model;

  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const padX = 96, padY = 30;
  const vx = Math.min(...xs) - padX, vy = Math.min(...ys) - padY;
  const vw = Math.max(...xs) - Math.min(...xs) + padX * 2, vh = Math.max(...ys) - Math.min(...ys) + padY * 2 + 24;
  const svg = svgEl("svg", { viewBox: `${vx.toFixed(0)} ${vy.toFixed(0)} ${vw.toFixed(0)} ${vh.toFixed(0)}`, class: "wg", role: "img" });
  const langCount = nodes.filter((n) => n.kind === "lang").length;
  svg.setAttribute("aria-label",
    `A graph of ${PAPERS.length} papers and ${VILLANOVA.length} Villanova model releases, linked to ${Object.keys(TOPICS).length} lines of work and ${langCount} languages. Open European LLMs, the Villanova work, is drawn on top in amber. Use the buttons below to highlight one of them.`);

  const gEdges = svgEl("g", { class: "wg-edges" });
  const gNodes = svgEl("g", { class: "wg-nodes" });
  svg.append(gEdges, gNodes);

  for (const e of edges) {
    e.el = svgEl("line", { x1: e.a.x, y1: e.a.y, x2: e.b.x, y2: e.b.y, class: `wg-edge ${e.kind}` });
    gEdges.append(e.el);
  }

  const status = el("p", { className: "wg-status" });
  status.setAttribute("aria-live", "polite");
  const idle = `${PAPERS.length} papers, ${VILLANOVA.length} Villanova releases, ${langCount} languages, ${Object.keys(TOPICS).length} lines of work. Pick one to see what connects.`;
  status.textContent = idle;

  for (const n of nodes) {
    const g = svgEl("g", { class: `wg-node ${n.kind}${n.lead ? " lead" : ""}` });
    n.el = g;
    if (n.kind === "release") {
      // A model release: an amber diamond, larger than a paper dot.
      g.append(svgEl("rect", { x: -6.5, y: -6.5, width: 13, height: 13, rx: 1.5, transform: "rotate(45)" }));
      const say = `${n.release.name}, ${n.release.when}. ${n.release.what}`;
      g.addEventListener("mouseenter", () => { status.textContent = say; });
      g.addEventListener("mouseleave", () => { status.textContent = active ? active.msg : idle; });
      g.addEventListener("click", () => { window.location.href = n.release.href; });
    } else if (n.kind === "paper") {
      g.append(svgEl("circle", { r: 4.2 }));
      g.addEventListener("mouseenter", () => { status.textContent = `${n.paper.y}. ${n.paper.t}`; });
      g.addEventListener("mouseleave", () => { status.textContent = active ? active.msg : idle; });
      g.addEventListener("click", () => { window.location.href = `publications.html#${slug(n.paper)}`; });
    } else {
      const r = n.lead ? 13 : n.kind === "topic" ? 10 : 7;
      g.append(svgEl("circle", { r }));
      let t;
      if (n.kind === "topic") {
        // Lines of work: label centred under the node, clear of nearby languages.
        t = svgEl("text", { x: 0, y: r + 19, "text-anchor": "middle", class: "wg-label topic" }, n.label);
      } else {
        const left = n.x < CX;
        t = svgEl("text", { x: left ? -(r + 7) : r + 7, y: 5, "text-anchor": left ? "end" : "start", class: "wg-label" }, n.label);
      }
      if (n.kind === "lang") { t.setAttribute("direction", "ltr"); t.setAttribute("unicode-bidi", "plaintext"); }
      g.append(t);
      g.addEventListener("click", () => toggle(n));
    }
    gNodes.append(g);
  }

  // Highlighting, shared by the graph and the button row.
  let active = null;
  const buttons = new Map();
  const toggle = (n) => {
    if (active && active.node === n) { clear(); return; }
    const linked = new Set([n]);
    for (const e of edges) {
      if (e.b === n) linked.add(e.a);
    }
    svg.classList.add("focus");
    for (const m of nodes) m.el.classList.toggle("on", linked.has(m));
    for (const e of edges) e.el.classList.toggle("on", e.b === n);
    const papers = [...linked].filter((m) => m.kind === "paper").length;
    const releases = [...linked].filter((m) => m.kind === "release").length;
    const label = n.kind === "lang" ? n.name : n.label;
    const msg = `${label}: ${papers} ${papers === 1 ? "paper" : "papers"}` +
      (releases ? ` and ${releases} Villanova ${releases === 1 ? "release" : "releases"}.` : ".");
    status.textContent = msg;
    active = { node: n, msg };
    buttons.forEach((b, key) => b.setAttribute("aria-pressed", String(key === n.id)));
  };
  const clear = () => {
    active = null;
    svg.classList.remove("focus");
    nodes.forEach((m) => m.el.classList.remove("on"));
    edges.forEach((e) => e.el.classList.remove("on"));
    buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
    status.textContent = idle;
  };

  const row = el("div", { className: "wg-keys" });
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Highlight a line of work or a language");
  for (const n of nodes.filter((m) => m.kind === "topic" || m.kind === "lang")) {
    const b = el("button", { type: "button", className: `wg-key ${n.kind}${n.lead ? " lead" : ""}` });
    b.textContent = n.kind === "lang" ? n.label : n.label;
    if (n.kind === "lang") { b.lang = n.key; b.title = n.name; }
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => toggle(n));
    buttons.set(n.id, b);
    row.append(b);
  }
  const onKey = (ev) => {
    if (!mount.isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (ev.key === "Escape" && active) clear();
  };
  document.addEventListener("keydown", onKey);

  mount.append(svg, status, row);
  untangle(nodes);
  for (const e of edges) {
    e.el.setAttribute("x1", e.a.x); e.el.setAttribute("y1", e.a.y);
    e.el.setAttribute("x2", e.b.x); e.el.setAttribute("y2", e.b.y);
  }
  {
    const xs2 = nodes.map((n) => n.x), ys2 = nodes.map((n) => n.y);
    const x0 = Math.min(...xs2) - padX, y0 = Math.min(...ys2) - padY;
    svg.setAttribute("viewBox", `${x0.toFixed(0)} ${y0.toFixed(0)} ${(Math.max(...xs2) - x0 + padX).toFixed(0)} ${(Math.max(...ys2) - y0 + padY + 24).toFixed(0)}`);
  }

  // Assemble: topics, then languages, then papers fly out from the centre; edges last.
  const place = (n, x, y, s) => n.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);

  /* Play: once assembled, nodes can be dragged (their links stretch, and they spring
     back when let go), and nearby nodes lean away from the pointer. The node under the
     pointer stays still, so it can always be clicked. Off under reduced motion. */
  function enablePlay() {
    svg.classList.add("play");
    for (const n of nodes) { n.hx = n.x; n.hy = n.y; n.vx = 0; n.vy = 0; }
    const rest = new Map(edges.map((e) => [e, Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y)]));
    let ptr = null, drag = null, running = false;
    const toSvg = (ev) => new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const drawEdges = () => {
      for (const e of edges) {
        e.el.setAttribute("x1", e.a.x.toFixed(1)); e.el.setAttribute("y1", e.a.y.toFixed(1));
        e.el.setAttribute("x2", e.b.x.toFixed(1)); e.el.setAttribute("y2", e.b.y.toFixed(1));
      }
    };
    const tick = () => {
      for (const e of edges) {
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 0.01;
        const f = (d - rest.get(e)) * 0.01, fx = (dx / d) * f, fy = (dy / d) * f;
        e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
      }
      let energy = 0;
      for (const n of nodes) {
        if (drag && drag.n === n) { n.vx = 0; n.vy = 0; place(n, n.x, n.y, 1.25); continue; }
        n.vx += (n.hx - n.x) * 0.045; n.vy += (n.hy - n.y) * 0.045;
        if (ptr && !drag) {
          const dx = n.x - ptr.x, dy = n.y - ptr.y, d = Math.hypot(dx, dy);
          if (d > 16 && d < 90) { const f = ((90 - d) / 74) * 0.55; n.vx += (dx / d) * f; n.vy += (dy / d) * f; }
        }
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
        energy += Math.abs(n.vx) + Math.abs(n.vy) + Math.abs(n.hx - n.x) + Math.abs(n.hy - n.y);
        place(n, n.x, n.y, 1);
      }
      drawEdges();
      if (ptr || drag || energy > 0.6) requestAnimationFrame(tick);
      else {
        running = false;
        for (const n of nodes) { n.x = n.hx; n.y = n.hy; place(n, n.x, n.y, 1); }
        drawEdges();
      }
    };
    const wake = () => { if (!running) { running = true; requestAnimationFrame(tick); } };
    svg.addEventListener("pointermove", (ev) => {
      if (ev.pointerType === "touch" && !drag) return;
      ptr = toSvg(ev);
      if (drag) {
        if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 4) drag.moved = true;
        drag.n.x = ptr.x; drag.n.y = ptr.y;
      }
      wake();
    });
    svg.addEventListener("pointerleave", () => { if (!drag) { ptr = null; wake(); } });
    for (const n of nodes) {
      n.el.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        drag = { n, sx: ev.clientX, sy: ev.clientY, moved: false };
        n.el.setPointerCapture(ev.pointerId);
        n.el.classList.add("grabbed");
        ev.preventDefault();
        wake();
      });
      const end = (ev) => {
        if (!drag || drag.n !== n) return;
        n.el.classList.remove("grabbed");
        if (drag.moved) n.el.dataset.dragged = "1";
        drag = null;
        if (ev.pointerType === "touch") ptr = null;
        wake();
      };
      n.el.addEventListener("pointerup", end);
      n.el.addEventListener("pointercancel", end);
      // a drag is not a click: swallow the click that follows it
      n.el.addEventListener("click", (ev) => {
        if (n.el.dataset.dragged) { delete n.el.dataset.dragged; ev.stopImmediatePropagation(); ev.preventDefault(); }
      }, true);
    }
  }
  if (calm()) {
    nodes.forEach((n) => place(n, n.x, n.y, 1));
    svg.classList.add("assembled");
    return;
  }
  nodes.forEach((n) => place(n, CX, CY, 0));
  const kinds = ["topic", "release", "lang", "paper"];
  const order = kinds.flatMap((k) => nodes.filter((n) => n.kind === k));
  const startAt = { topic: 0, release: 300, lang: 420, paper: 800 }, gap = { topic: 90, release: 90, lang: 45, paper: 22 };
  const delay = new Map(kinds.flatMap((k) => nodes.filter((n) => n.kind === k).map((n, i) => [n, startAt[k] + i * gap[k]])));
  const dur = 720;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const total = Math.max(...delay.values()) + dur;
  let start = null;
  const frame = (ts) => {
    if (start === null) start = ts;
    const el = ts - start;
    for (const n of nodes) {
      const t = Math.min(1, Math.max(0, (el - delay.get(n)) / dur));
      const e = ease(t);
      place(n, CX + (n.x - CX) * e, CY + (n.y - CY) * e, e);
    }
    if (el < total) requestAnimationFrame(frame);
    else { svg.classList.add("assembled"); if (opts.play) enablePlay(); }
  };
  const go = () => requestAnimationFrame(frame);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { go(); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(svg);
  } else go();
}
