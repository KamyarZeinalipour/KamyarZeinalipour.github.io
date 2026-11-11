/* The work as a knowledge graph, for the home page.
   Nodes: the four lines of work, the languages, and every paper. Edges: a paper's
   subjects and, where certain, its language. The layout is computed once with a
   small force simulation (seeded, so it is the same on every visit), then the
   graph assembles in a single orchestrated sequence and stays still. */
import { PAPERS, TOPICS, LANGS, PAPER_LANGS } from "./data.js";

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

const W = 640, H = 560, CX = W / 2, CY = H / 2;
const ANCHOR = { edu: [190, 175], lang: [455, 175], ling: [190, 395], sci: [455, 395] };

function buildModel() {
  const nodes = [];
  const edges = [];
  const byId = new Map();
  const add = (n) => { nodes.push(n); byId.set(n.id, n); return n; };

  for (const [k, label] of Object.entries(TOPICS)) {
    const [x, y] = ANCHOR[k];
    add({ id: `t:${k}`, kind: "topic", key: k, label, x, y, fixed: true });
  }
  const used = new Set(Object.values(PAPER_LANGS).flat());
  const rand = rng(7);
  for (const [k, v] of Object.entries(LANGS)) {
    if (!used.has(k)) continue;
    add({ id: `l:${k}`, kind: "lang", key: k, label: v.native, name: v.name,
      x: CX + (rand() - 0.5) * 200, y: CY + (rand() - 0.5) * 200 });
  }
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
        const big = a.kind !== "paper" && b.kind !== "paper";
        const rep = (a.kind === "paper" && b.kind === "paper" ? 380 : big ? 5200 : 1400) / d2;
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

export function buildGraph(mount = $("#fig-graph")) {
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
    `A graph of ${PAPERS.length} papers linked to ${Object.keys(TOPICS).length} lines of work and ${langCount} languages. Use the buttons below to highlight one of them.`);

  const gEdges = svgEl("g", { class: "wg-edges" });
  const gNodes = svgEl("g", { class: "wg-nodes" });
  svg.append(gEdges, gNodes);

  for (const e of edges) {
    e.el = svgEl("line", { x1: e.a.x, y1: e.a.y, x2: e.b.x, y2: e.b.y, class: `wg-edge ${e.kind}` });
    gEdges.append(e.el);
  }

  const status = el("p", { className: "wg-status" });
  status.setAttribute("aria-live", "polite");
  const idle = `${PAPERS.length} papers, ${langCount} languages, ${Object.keys(TOPICS).length} lines of work. Pick one to see what connects.`;
  status.textContent = idle;

  for (const n of nodes) {
    const g = svgEl("g", { class: `wg-node ${n.kind}` });
    n.el = g;
    if (n.kind === "paper") {
      g.append(svgEl("circle", { r: 4.2 }));
      g.addEventListener("mouseenter", () => { status.textContent = `${n.paper.y}. ${n.paper.t}`; });
      g.addEventListener("mouseleave", () => { status.textContent = active ? active.msg : idle; });
      g.addEventListener("click", () => { window.location.href = `publications.html#${slug(n.paper)}`; });
    } else {
      const r = n.kind === "topic" ? 10 : 7;
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
    const count = linked.size - 1;
    const label = n.kind === "lang" ? n.name : n.label;
    const msg = `${label}: ${count} ${count === 1 ? "paper" : "papers"}.`;
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
  for (const n of nodes.filter((m) => m.kind !== "paper")) {
    const b = el("button", { type: "button", className: `wg-key ${n.kind}` });
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

  // Assemble: topics, then languages, then papers fly out from the centre; edges last.
  const place = (n, x, y, s) => n.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})`);
  if (calm()) {
    nodes.forEach((n) => place(n, n.x, n.y, 1));
    svg.classList.add("assembled");
    return;
  }
  nodes.forEach((n) => place(n, CX, CY, 0));
  const order = [...nodes.filter((n) => n.kind === "topic"), ...nodes.filter((n) => n.kind === "lang"), ...nodes.filter((n) => n.kind === "paper")];
  const delay = new Map(order.map((n, i) => [n, n.kind === "topic" ? i * 90 : n.kind === "lang" ? 380 + i * 45 : 760 + i * 22]));
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
    else svg.classList.add("assembled");
  };
  const go = () => requestAnimationFrame(frame);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { go(); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(svg);
  } else go();
}
