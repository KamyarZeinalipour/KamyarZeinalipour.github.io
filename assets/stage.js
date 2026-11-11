/* The home page stage: one animated scene per research area.
   It plays a single tour through the scenes, then stops on the first one. Tabs
   jump to any scene, a button pauses or replays the tour, and under
   prefers-reduced-motion every scene is drawn in its finished state. */
import { PUZZLE, PROTEIN, SENSE, SURPRISAL, MSFT, CLUES, BENCH, CROSS, LEARN, CALAMITA, BANANAS } from "./data.js";
import { buildGraph } from "./graph.js";
import { sceneProtein3D, sceneDrug3D } from "./mol3d.js";

const NS = "http://www.w3.org/2000/svg";
const $ = (sel, root = document) => root.querySelector(sel);
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
const s = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
const ease = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/* Run fn(elapsedMs) every frame until it returns false or the scene is gone. */
function run(alive, fn) {
  if (calm()) { fn(Infinity); return; }
  let start = null;
  const frame = (ts) => {
    if (!alive()) return;
    if (start === null) start = ts;
    if (fn(ts - start) !== false) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const VB = "0 0 640 500";
const stageSvg = (label) => s("svg", { viewBox: VB, class: "st-svg", role: "img", "aria-label": label });

/* Break text into lines of at most n characters, on word boundaries. */
function wrapWords(text, n) {
  const out = []; let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > n) { out.push(line.trim()); line = w; } else line += " " + w;
  }
  out.push(line.trim());
  return out;
}

/* Words of `text` that belong to the contiguous phrase `span` (punctuation ignored). */
function spanMask(text, span) {
  const clean = (w) => w.replace(/[.,،؛:;!?"“”]/g, "");
  const words = text.split(" "), target = span.split(" ").map(clean);
  const mask = words.map(() => false);
  for (let i = 0; i + target.length <= words.length; i++) {
    if (target.every((t, k) => clean(words[i + k]) === t)) { for (let k = 0; k < target.length; k++) mask[i + k] = true; break; }
  }
  return mask;
}

/* ---------------- Multi-SFT, five real examples (a slide in the Languages chapter) ---------------- */
function slideMSFT(g) {
  const rows = MSFT.map((m, i) => {
    const y = 10 + i * 97;
    const r = s("g", { class: "st-msft" });
    r.append(s("rect", { x: 14, y, width: 612, height: 88, rx: 8, class: "st-msft-card" }));
    r.append(s("text", { x: 30, y: y + 21, class: "st-msft-code" }, m.code));
    r.append(s("text", { x: 58, y: y + 21, class: "st-msft-src" }, m.src));
    r.append(s("text", { x: 30, y: y + 44, class: "st-qa" }, "Q"));
    r.append(s("text", { x: 30, y: y + 75, class: "st-qa a" }, "A"));
    const q = wrapWords(m.q, 76).slice(0, 2).map((ln, k) => {
      const t = s("text", { x: 50, y: y + 44 + k * 16, class: "st-q", lang: m.lang }, "");
      r.append(t);
      return { t, ln };
    });
    const aLine = wrapWords(m.a, 80)[0];
    const at = s("text", { x: 50, y: y + 75, class: "st-a", lang: m.lang }, "");
    const caret = s("rect", { y: y + 64, width: 7, height: 14, rx: 1, class: "st-caret" });
    r.append(at, caret);
    r.style.opacity = 0;
    g.append(r);
    return { r, q, at, aLine, caret };
  });
  const per = 1150;
  return (ms) => {
    rows.forEach((row, i) => {
      const local = ms === Infinity ? 99999 : ms - i * per;
      reveal(row.r, clamp01(local / 380), 10);
      const qTotal = row.q.reduce((n, x) => n + x.ln.length, 0);
      let budget = Math.floor(clamp01((local - 200) / 520) * qTotal);
      row.q.forEach(({ t, ln }) => { const n = Math.min(ln.length, budget); t.textContent = ln.slice(0, n); budget -= n; });
      const words = row.aLine.split(" ");
      row.at.textContent = words.slice(0, Math.floor(clamp01((local - 760) / 600) * words.length)).join(" ");
      const streaming = local > 760 && local < 1500 && ms !== Infinity;
      row.caret.style.opacity = streaming ? 1 : 0;
      if (streaming && row.at.getComputedTextLength) row.caret.setAttribute("x", 52 + row.at.getComputedTextLength());
    });
  };
}

/* ---------------- scene: Clue-Instruct, passage to clues to grid ---------------- */
function sceneCrossword(mount, alive) {
  const svg = stageSvg("Real rows from the Clue-Instruct dataset: a Wikipedia passage, the answer word highlighted inside it, three clues for it, and the answer placed into crossword boxes.");
  mount.append(svg);
  const per = 3800;
  const groups = CLUES.map((c) => {
    const g = s("g", { class: "st-ci" });
    g.append(s("rect", { x: 14, y: 14, width: 612, height: 118, rx: 8, class: "st-ci-src" }));
    g.append(s("text", { x: 30, y: 38, class: "st-kicker" }, "Wikipedia passage"));
    const key = c.answer.toLowerCase();
    const lineEls = wrapWords(c.context, 78).slice(0, 4).map((ln, k) => {
      const t = s("text", { x: 30, y: 62 + k * 19, class: "st-ci-text" });
      ln.split(" ").forEach((w, j) => {
        const sp = s("tspan", { class: w.toLowerCase().replace(/[^a-z]/g, "").startsWith(key) ? "st-key" : "" }, (j ? " " : "") + w);
        t.append(sp);
      });
      g.append(t);
      return t;
    });
    g.append(s("path", { d: "M 320 140 V 164 M 313 157 L 320 165 L 327 157", class: "st-flow" }));
    g.append(s("text", { x: 30, y: 192, class: "st-kicker" }, "Clues in the dataset"));
    const clueEls = c.clues.map((cl, k) => {
      g.append(s("text", { x: 30, y: 220 + k * 26, class: "st-clue-n" }, String(k + 1)));
      const t = s("text", { x: 50, y: 220 + k * 26, class: "st-clue-line" }, "");
      g.append(t);
      return { t, cl };
    });
    const n = c.answer.length, cell = 50, x0 = 320 - (n * cell) / 2;
    const boxes = [...c.answer].map((ch, k) => {
      const bx = s("g", { class: "st-ans-box" });
      bx.append(s("rect", { x: x0 + k * cell, y: 318, width: cell - 4, height: cell - 4, rx: 4, class: "st-cell" }));
      const t = s("text", { x: x0 + k * cell + (cell - 4) / 2, y: 318 + 32, "text-anchor": "middle", class: "st-letter big" }, ch);
      t.style.opacity = 0;
      bx.append(t);
      g.append(bx);
      return t;
    });
    g.style.opacity = 0;
    svg.append(g);
    return { g, lineEls, clueEls, boxes };
  });
  const dots = CLUES.map((_, i) => { const d = s("circle", { cx: 300 + i * 20, cy: 470, r: 5, class: "st-dot" }); svg.append(d); return d; });
  run(alive, (ms) => {
    const k = ms === Infinity ? 0 : Math.min(groups.length - 1, Math.floor(ms / per));
    const local = ms === Infinity ? 99999 : ms - k * per;
    groups.forEach((grp, i) => {
      const on = i === k;
      const fadeIn = clamp01(local / 350), fadeOut = 1 - clamp01((local - per + 350) / 350);
      grp.g.style.opacity = on ? (ms === Infinity ? 1 : Math.min(fadeIn, k === groups.length - 1 ? 1 : fadeOut)) : 0;
      if (!on) return;
      grp.g.classList.toggle("found", local > 600);
      let t0 = 900;
      grp.clueEls.forEach(({ t, cl }) => {
        t.textContent = cl.slice(0, Math.floor(clamp01((local - t0) / 520) * cl.length));
        t0 += 560;
      });
      grp.boxes.forEach((t, j) => {
        const v = clamp01((local - 2700 - j * 110) / 220);
        t.style.opacity = v;
        t.style.transform = `translateY(${(1 - ease(v)) * -14}px)`;
      });
    });
    dots.forEach((d, i) => d.classList.toggle("on", i === k));
    return ms < groups.length * per;
  });
}

/* ---------------- scene: a protein read, then folded ---------------- */
function sceneProtein(mount, alive) {
  const svg = stageSvg("Human insulin B chain, thirty amino acids, appearing one by one in a line and then folding into a coil.");
  mount.append(svg);
  const seq = PROTEIN.seq.split("");
  const n = seq.length;
  const line = (i) => ({ x: 40 + (i % 15) * 38, y: 150 + Math.floor(i / 15) * 70, z: 1 });
  const coil = (i) => {
    const a = i * 0.62;
    const z = (Math.cos(a) + 1) / 2;
    return { x: 70 + i * 17.5, y: 300 + Math.sin(a) * 78, z };
  };
  const beads = seq.map((ch, i) => {
    const g = s("g", { class: "st-bead" });
    g.append(s("circle", { r: 14 }), s("text", { y: 5, "text-anchor": "middle" }, ch));
    svg.append(g);
    return g;
  });
  const bonds = seq.slice(1).map(() => s("line", { class: "st-bond" }));
  bonds.forEach((b) => svg.insertBefore(b, svg.firstChild));
  svg.append(s("text", { x: 320, y: 470, class: "st-caption", "text-anchor": "middle" }, PROTEIN.name));
  const read = n * 70 + 300, fold = 1600;
  run(alive, (ms) => {
    const f = ms === Infinity ? 1 : ease(clamp01((ms - read - 300) / fold));
    const pos = beads.map((g, i) => {
      const a = line(i), b = coil(i);
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: 1 + (b.z - 1) * f };
      const appear = ms === Infinity ? 1 : clamp01((ms - i * 70) / 240);
      const scale = (0.82 + 0.18 * p.z) * appear;
      g.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${scale.toFixed(3)})`);
      g.style.opacity = appear * (0.62 + 0.38 * p.z);
      return p;
    });
    bonds.forEach((b, i) => {
      const p = pos[i], q = pos[i + 1];
      b.setAttribute("x1", p.x); b.setAttribute("y1", p.y);
      b.setAttribute("x2", q.x); b.setAttribute("y2", q.y);
      b.style.opacity = f;
    });
    return ms < read + 300 + fold;
  });
}

/* ---------------- scene: protein target to molecule (illustration) ---------------- */
function sceneMolecule(mount, alive) {
  const svg = stageSvg("Illustration: a protein sequence on the left, a model in the middle, and an abstract ring-shaped molecule assembling on the right.");
  mount.append(svg);
  // A short strand of beads on the left.
  const strand = "MKTAYIAK".split("").map((ch, i) => {
    const g = s("g", { class: "st-bead small" });
    g.append(s("circle", { r: 11 }), s("text", { y: 4, "text-anchor": "middle" }, ch));
    g.setAttribute("transform", `translate(${60 + (i % 2) * 34} ${110 + i * 38})`);
    svg.append(g);
    return g;
  });
  const arrow = s("path", { d: "M 160 250 C 220 250, 230 250, 280 250", class: "st-flow" });
  const head = s("path", { d: "M 272 243 L 282 250 L 272 257", class: "st-flow" });
  const box = s("rect", { x: 290, y: 222, width: 92, height: 56, rx: 6, class: "st-model" });
  const label = s("text", { x: 336, y: 256, class: "st-model-t", "text-anchor": "middle" }, "model");
  const arrow2 = s("path", { d: "M 386 250 L 430 250", class: "st-flow" });
  const head2 = s("path", { d: "M 422 243 L 432 250 L 422 257", class: "st-flow" });
  svg.append(arrow, head, box, label, arrow2, head2);
  // Two fused hexagons and a short side chain: an abstract shape, not a real compound.
  const R = 32, cx1 = 500, cy = 250, cx2 = cx1 + R * Math.sqrt(3);
  const hex = (cx) => [0, 1, 2, 3, 4, 5].map((k) => {
    const a = Math.PI / 6 + k * Math.PI / 3;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
  const h1 = hex(cx1), h2 = hex(cx2);
  const pts = [...h1, h2[0], h2[1], h2[5], h2[4], [h2[0][0] + 26, h2[0][1] - 16], [h2[0][0] + 48, h2[0][1] - 2]];
  const bondsIdx = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 7], [7, 8], [8, 9], [9, 5], [6, 10], [10, 11]];
  const bonds = bondsIdx.map(([a, b]) => {
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const l = s("line", { x1, y1, x2, y2, class: "st-mbond" });
    l.style.strokeDasharray = len; l.style.strokeDashoffset = len;
    svg.append(l);
    return { l, len };
  });
  const atoms = pts.map(([x, y]) => {
    const c = s("circle", { cx: x, cy: y, r: 5, class: "st-atom" });
    c.style.opacity = 0;
    svg.append(c);
    return c;
  });
  svg.append(s("text", { x: 320, y: 470, class: "st-caption", "text-anchor": "middle" }, "Illustration"));
  run(alive, (ms) => {
    strand.forEach((g, i) => { g.style.opacity = clamp01((ms - i * 90) / 300); });
    const flow = clamp01((ms - 800) / 500);
    [arrow, head, box, label, arrow2, head2].forEach((x) => { x.style.opacity = flow; });
    bonds.forEach(({ l, len }, i) => { l.style.strokeDashoffset = len * (1 - ease(clamp01((ms - 1400 - i * 140) / 360))); });
    atoms.forEach((c, i) => { c.style.opacity = clamp01((ms - 1400 - i * 120) / 300); });
    return ms < 1400 + bonds.length * 140 + 500;
  });
}

/* ---------------- scene: graph to text and back ----------------
   The worked example from the paper's own figure (round-trip-kg,
   figures/example_dragon.png): five facts about the Komodo dragon, written
   out twice. The faithful paragraph reads back with a similarity of 0.80 and is
   kept; the unfaithful one scores 0.45 and is rejected. */
const KG_FACTS = [
  { rel: "is native to", obj: "Indonesian islands", x: 92, y: 46 },
  { rel: "is known as", obj: "largest living lizard", x: 548, y: 46 },
  { rel: "has", obj: "venomous bite", x: 92, y: 150 },
  { rel: "is classified as", obj: "vulnerable species", x: 548, y: 150 },
  { rel: "hunts primarily by", obj: "ambush", x: 320, y: 196 },
];
const KG_TEXTS = [
  { label: "High fidelity", score: 0.8, keep: true,
    text: "The Komodo Dragon, native to the Indonesian islands, is the largest living lizard and an apex predator. It relies on ambush tactics and a venomous bite as a deadly deterrent." },
  { label: "Low fidelity", score: 0.45, keep: false,
    text: "The Komondo Dragon is revered as the monarch of its domain, famed for skills honed to perfection and a lethal arsenal that subdues prey; many believe its presence keeps the ecosystem in balance." },
];

function sceneKG(mount, alive) {
  const svg = stageSvg("The paper's example: five facts about the Komodo dragon are written out as two paragraphs. Read back into facts, the faithful paragraph scores a round-trip similarity of 0.80 and is kept; the other scores 0.45 and is rejected.");
  mount.append(svg);
  const hub = { x: 320, y: 98 };
  const gGraph = s("g", { class: "st-kg-graph" });
  const edges = KG_FACTS.map((f) => {
    const l = s("line", { x1: hub.x, y1: hub.y, x2: f.x, y2: f.y, class: "st-edge" });
    const len = Math.hypot(f.x - hub.x, f.y - hub.y);
    l.style.strokeDasharray = len; l.style.strokeDashoffset = len;
    gGraph.append(l);
    return { l, len };
  });
  const rels = KG_FACTS.map((f) => {
    const t = s("text", { x: (hub.x + f.x) / 2, y: (hub.y + f.y) / 2 - 5, class: "st-rel", "text-anchor": "middle" }, f.rel);
    t.style.opacity = 0;
    gGraph.append(t);
    return t;
  });
  const leaves = KG_FACTS.map((f) => {
    const g = s("g", { class: "st-kg-leaf" });
    const w = f.obj.length * 7.4 + 22;
    g.append(s("rect", { x: f.x - w / 2, y: f.y - 15, width: w, height: 30, rx: 15, class: "st-node" }),
             s("text", { x: f.x, y: f.y + 5, class: "st-node-t", "text-anchor": "middle" }, f.obj));
    g.style.opacity = 0;
    gGraph.append(g);
    return g;
  });
  const hubG = s("g");
  hubG.append(s("rect", { x: hub.x - 72, y: hub.y - 18, width: 144, height: 36, rx: 18, class: "st-hub" }),
              s("text", { x: hub.x, y: hub.y + 6, class: "st-hub-t", "text-anchor": "middle" }, "Komodo dragon"));
  gGraph.append(hubG);
  svg.append(gGraph);

  const cards = KG_TEXTS.map((k, i) => {
    const x = i ? 330 : 20, w = 290, y = 238;
    const g = s("g", { class: `st-kg-card ${k.keep ? "keep" : "drop"}` });
    g.append(s("rect", { x, y, width: w, height: 150, rx: 8, class: "st-card" }),
             s("text", { x: x + 14, y: y + 22, class: "st-kicker" }, k.label));
    const lines = wrapWords(k.text, 38).slice(0, 6);
    const tl = lines.map((ln, j) => {
      const t = s("text", { x: x + 14, y: y + 46 + j * 18, class: "st-sent-t" }, "");
      g.append(t);
      return { t, ln };
    });
    const barBg = s("rect", { x, y: y + 168, width: w, height: 10, rx: 5, class: "st-track" });
    const bar = s("rect", { x, y: y + 168, width: 0, height: 10, rx: 5, class: `st-sim ${k.keep ? "keep" : "drop"}` });
    const val = s("text", { x, y: y + 200, class: "st-simval" }, "");
    const verdict = s("text", { x: x + w, y: y + 200, class: `st-verdict ${k.keep ? "keep" : "drop"}`, "text-anchor": "end" }, "");
    g.append(barBg, bar, val, verdict);
    g.style.opacity = 0;
    svg.append(g);
    return { g, tl, bar, val, verdict, k, x, w };
  });

  const T_GRAPH = 1300, T_TEXT = T_GRAPH + 300, TYPE = 2200, T_SCORE = T_TEXT + TYPE + 200;
  run(alive, (ms) => {
    edges.forEach(({ l, len }, i) => { l.style.strokeDashoffset = len * (1 - ease(clamp01((ms - 200 - i * 120) / 500))); });
    rels.forEach((t, i) => { t.style.opacity = clamp01((ms - 500 - i * 120) / 400); });
    leaves.forEach((g, i) => { g.style.opacity = clamp01((ms - 400 - i * 120) / 400); });
    cards.forEach((c) => {
      c.g.style.opacity = clamp01((ms - T_GRAPH) / 400);
      const total = c.tl.reduce((n, x) => n + x.ln.length, 0);
      let budget = Math.floor(clamp01((ms - T_TEXT) / TYPE) * total);
      c.tl.forEach(({ t, ln }) => { const n = Math.min(ln.length, budget); t.textContent = ln.slice(0, n); budget -= n; });
      const sc = ease(clamp01((ms - T_SCORE) / 900));
      c.bar.setAttribute("width", (c.w * c.k.score * sc).toFixed(1));
      c.val.textContent = sc > 0 ? `round-trip similarity ${(c.k.score * sc).toFixed(2)}` : "";
      const decided = ms >= T_SCORE + 900;
      c.verdict.textContent = decided ? (c.k.keep ? "kept" : "rejected") : "";
      c.g.classList.toggle("decided", decided);
    });
    return ms < T_SCORE + 1300;
  });
}

/* ---------------- scene: ArabicSense, which sentence makes sense ---------------- */
function sceneBenchmarks(mount, alive) {
  const svg = stageSvg("Pairs of Arabic sentences from the ArabicSense test set. A reading scan passes over both; the impossible phrase lights up, the impossible sentence is stamped, and the sensible one is marked as making sense. English glosses are the author's.");
  mount.append(svg);
  svg.append(s("text", { x: 20, y: 30, class: "st-kicker" }, "Which sentence makes sense?"));
  const pairs = SENSE.slice(0, 3);
  const card = (y, ar, gloss, bad, absurd, absurdGloss) => {
    const g = s("g", { class: "st-sense" });
    const arLines = wrapWords(ar, 58), glLines = wrapWords(gloss, 76);
    const h = 26 + arLines.length * 27 + glLines.length * 17 + 12;
    g.append(s("rect", { x: 20, y, width: 600, height: h, rx: 8, class: "st-sense-box" }));
    const arMask = bad ? spanMask(ar, absurd) : [];
    let wi = 0;
    arLines.forEach((ln, i) => {
      const t = s("text", { x: 600, y: y + 30 + i * 27, class: "st-ar", "text-anchor": "start", direction: "rtl", lang: "ar" });
      ln.split(" ").forEach((w, j) => {
        if (j) t.append(document.createTextNode(" "));
        t.append(s("tspan", { class: arMask[wi++] ? "st-absurd" : "" }, w));
      });
      g.append(t);
    });
    const glMask = bad ? spanMask(gloss, absurdGloss) : [];
    let gi = 0;
    glLines.forEach((ln, i) => {
      const t = s("text", { x: 36, y: y + 30 + arLines.length * 27 + i * 17, class: "st-gloss" });
      ln.split(" ").forEach((w, j) => {
        if (j) t.append(document.createTextNode(" "));
        t.append(s("tspan", { class: glMask[gi++] ? "st-absurd" : "" }, w));
      });
      g.append(t);
    });
    const scan = s("rect", { x: 560, y: y + 4, width: 56, height: h - 8, rx: 6, class: "st-scan" });
    scan.style.opacity = 0;
    g.append(scan);
    const stamp = s("g", { class: "st-stamp" });
    stamp.append(s("rect", { x: 470, y: y - 13, width: 132, height: 26, rx: 4 }),
                 s("text", { x: 536, y: y + 5, "text-anchor": "middle" }, bad ? "impossible" : "makes sense"));
    stamp.style.opacity = 0;
    g.append(stamp);
    svg.append(g);
    return { g, scan, stamp, h, bad, y };
  };
  const groups = pairs.map((p) => {
    const first = card(56, p.a, p.ga, p.ok !== 0, p.absurd, p.absurdGloss);
    const second = card(56 + first.h + 26, p.b, p.gb, p.ok !== 1, p.absurd, p.absurdGloss);
    return [first, second];
  });
  const dots = pairs.map((_, i) => { const d = s("circle", { cx: 300 + i * 20, cy: 472, r: 5, class: "st-dot" }); svg.append(d); return d; });
  const per = 3600;
  run(alive, (ms) => {
    const k = ms === Infinity ? 0 : Math.min(groups.length - 1, Math.floor(ms / per));
    const local = ms === Infinity ? 99999 : ms - k * per;
    groups.forEach((cards, i) => cards.forEach((c, j) => {
      if (i !== k) { c.g.style.opacity = 0; return; }
      const enter = ease(clamp01((local - j * 120) / 450));
      const leave = k < groups.length - 1 && ms !== Infinity ? clamp01((local - per + 380) / 380) : 0;
      c.g.style.opacity = enter * (1 - leave);
      c.g.style.transform = `translateX(${(1 - enter) * 40 - leave * 40}px)`;
      const sc = clamp01((local - 520) / 1000);
      c.scan.style.opacity = sc > 0 && sc < 1 ? 0.9 : 0;
      c.scan.setAttribute("x", (560 - sc * 540).toFixed(1));
      const reveal = local > 1600;
      c.g.classList.toggle("hit", reveal && c.bad);
      const decided = local > 2200;
      c.g.classList.toggle("is-sense", decided && !c.bad);
      c.g.classList.toggle("is-nonsense", decided && c.bad);
      const st = clamp01((local - 2200) / 260);
      c.stamp.style.opacity = st;
      c.stamp.style.transform = `rotate(${c.bad ? -4 : 0}deg) scale(${1.25 - 0.25 * ease(st)})`;
    }));
    dots.forEach((d, i) => d.classList.toggle("on", i === k));
    return ms < groups.length * per;
  });
}

/* ---------------- scene: surprisal and clue difficulty ---------------- */
function sceneMeasuring(mount, alive) {
  const svg = stageSvg("Bars showing the surprisal Llama-3-8B assigns to the answers of eight Italian crossword clues, from lowest to highest, with each answer revealed in crossword tiles. English glosses are the author's.");
  mount.append(svg);
  svg.append(s("text", { x: 20, y: 28, class: "st-kicker" }, "Surprisal of the answer, Llama-3-8B, low to high"));
  const rows = [...SURPRISAL].sort((a, b) => a.s - b.s);
  const max = Math.max(...rows.map((r) => r.s));
  const items = rows.map((r, i) => {
    const y = 64 + i * 53;
    svg.append(s("text", { x: 20, y, class: "st-clue-it", lang: "it" }, r.clue));
    svg.append(s("text", { x: 20, y: y + 17, class: "st-gloss" }, r.glossClue));
    const bar = s("rect", { x: 300, y: y - 14, height: 14, width: 0, rx: 3, class: "st-bar" });
    const val = s("text", { x: 306, y: y - 3, class: "st-val" }, r.s.toFixed(1));
    svg.append(bar, val);
    const tiles = [...r.answer.toUpperCase()].map((ch, j) => {
      const g = s("g", { class: "st-tile" });
      g.append(s("rect", { x: 300 + j * 17, y: y + 4, width: 15, height: 15, rx: 2 }),
               s("text", { x: 300 + j * 17 + 7.5, y: y + 15.5, "text-anchor": "middle" }, ch));
      g.style.opacity = 0;
      svg.append(g);
      return g;
    });
    return { bar, val, tiles, w: (r.s / max) * 250 };
  });
  run(alive, (ms) => {
    items.forEach((it, i) => {
      const t = ease(clamp01((ms - i * 130) / 700));
      it.bar.setAttribute("width", (it.w * t).toFixed(1));
      it.val.setAttribute("x", (306 + it.w * t).toFixed(1));
      it.tiles.forEach((g, j) => {
        const v = clamp01((ms - 1900 - i * 140 - j * 45) / 200);
        g.style.opacity = v;
        g.style.transform = `scaleY(${ease(v).toFixed(3)})`;
      });
    });
    return ms < 1900 + items.length * 140 + 600;
  });
}

/* ---------------- paper by paper: a slide engine ----------------
   A chapter becomes a run of slides, one per paper. Each slide names its paper
   (with a link) and plays one real example from it. Buttons jump between papers. */
function slideScene(mount, alive, slides) {
  const head = el("p", { className: "sl-paper" });
  const svg = stageSvg("");
  const pills = el("div", { className: "sl-pills" });
  pills.setAttribute("role", "group");
  pills.setAttribute("aria-label", "Papers in this chapter");
  mount.append(pills, head, svg);
  let idx = 0, auto = !calm(), started = 0, step = null, raf = 0;
  const buttons = slides.map((sl, i) => {
    const b = el("button", { type: "button", className: "sl-pill", textContent: sl.paper });
    b.addEventListener("click", () => { auto = false; go(i); });
    pills.append(b);
    return b;
  });
  function go(i) {
    idx = i;
    const sl = slides[i];
    buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
    head.replaceChildren(el("a", { href: sl.href, textContent: sl.paper }), document.createTextNode(`, ${sl.venue}. ${sl.task}`));
    svg.setAttribute("aria-label", `${sl.paper}: ${sl.label}`);
    svg.replaceChildren();
    const g = s("g", { class: "sl-g" });
    svg.append(g);
    step = sl.build(g);
    started = performance.now();
    if (calm()) { step(Infinity); return; }
    cancelAnimationFrame(raf);
    const frame = (ts) => {
      if (!alive()) return;
      const local = ts - started;
      step(local);
      g.style.opacity = clamp01(local / 300) * (auto && i < slides.length - 1 ? 1 - clamp01((local - sl.dur + 300) / 300) : 1);
      if (auto && local >= sl.dur && idx < slides.length - 1) { go(idx + 1); return; }
      if (local < sl.dur + 400 || auto) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }
  go(0);
}

/* RTL text line made of word tspans; `mask` marks words to highlight. */
function rtlLine(parent, x, y, text, cls, mask = []) {
  const t = s("text", { x, y, class: cls, "text-anchor": "start", direction: "rtl" });
  text.split(" ").forEach((w, j) => {
    if (j) t.append(document.createTextNode(" "));
    t.append(s("tspan", { class: mask[j] ? "st-absurd" : "" }, w));
  });
  parent.append(t);
  return t;
}
const reveal = (node, v, dy = 8) => { node.style.opacity = v; node.style.transform = `translateY(${((1 - ease(v)) * dy).toFixed(1)}px)`; };

/* ArabicSense: one pair, the impossible phrase found and stamped. */
function slideArabicSense(g) {
  const p = SENSE[0];
  const mk = (y, ar, gloss, bad) => {
    const c = s("g", { class: "st-sense" });
    const arL = wrapWords(ar, 58), glL = wrapWords(gloss, 76);
    const h = 26 + arL.length * 27 + glL.length * 17 + 12;
    c.append(s("rect", { x: 20, y, width: 600, height: h, rx: 8, class: "st-sense-box" }));
    const mask = bad ? spanMask(ar, p.absurd) : [];
    let off = 0;
    arL.forEach((ln, i) => { const n = ln.split(" ").length; rtlLine(c, 600, y + 30 + i * 27, ln, "st-ar", mask.slice(off, off + n)); off += n; });
    const gm = bad ? spanMask(gloss, p.absurdGloss) : [];
    let go2 = 0;
    glL.forEach((ln, i) => {
      const t = s("text", { x: 36, y: y + 30 + arL.length * 27 + i * 17, class: "st-gloss" });
      ln.split(" ").forEach((w, j) => { if (j) t.append(document.createTextNode(" ")); t.append(s("tspan", { class: gm[go2++] ? "st-absurd" : "" }, w)); });
      c.append(t);
    });
    const scan = s("rect", { x: 560, y: y + 4, width: 56, height: h - 8, rx: 6, class: "st-scan" });
    const stamp = s("g", { class: "st-stamp" });
    stamp.append(s("rect", { x: 470, y: y - 13, width: 132, height: 26, rx: 4 }), s("text", { x: 536, y: y + 5, "text-anchor": "middle" }, bad ? "impossible" : "makes sense"));
    c.append(scan, stamp);
    g.append(c);
    return { c, scan, stamp, h, bad };
  };
  const a = mk(40, p.a, p.ga, p.ok !== 0);
  const b = mk(40 + a.h + 26, p.b, p.gb, p.ok !== 1);
  return (ms) => [a, b].forEach((c, j) => {
    reveal(c.c, clamp01((ms - j * 120) / 420));
    const sc = clamp01((ms - 500) / 1000);
    c.scan.style.opacity = sc > 0 && sc < 1 ? 0.9 : 0;
    c.scan.setAttribute("x", (560 - sc * 540).toFixed(1));
    c.c.classList.toggle("hit", ms > 1600 && c.bad);
    c.c.classList.toggle("is-sense", ms > 2200 && !c.bad);
    c.c.classList.toggle("is-nonsense", ms > 2200 && c.bad);
    const st = clamp01((ms - 2200) / 260);
    c.stamp.style.opacity = st;
    c.stamp.style.transform = `rotate(${c.bad ? -4 : 0}deg) scale(${(1.25 - 0.25 * ease(st)).toFixed(3)})`;
  });
}

/* FarSense: read a story, judge a statement. */
function slideFarSense(g) {
  const d = BENCH.farsense;
  const ctx = s("g", { class: "sl-card" });
  const cl = wrapWords(d.context, 62);
  const ch = 30 + cl.length * 26 + 44;
  ctx.append(s("rect", { x: 20, y: 30, width: 600, height: ch, rx: 8 }), s("text", { x: 36, y: 52, class: "st-kicker" }, "Story"));
  cl.forEach((ln, i) => rtlLine(ctx, 604, 80 + i * 26, ln, "st-ar"));
  wrapWords(d.contextGloss, 84).forEach((ln, i) => ctx.append(s("text", { x: 36, y: 80 + cl.length * 26 + i * 16, class: "st-gloss" }, ln)));
  const sy = 30 + ch + 30;
  const st = s("g", { class: "sl-card stmt" });
  st.append(s("rect", { x: 20, y: sy, width: 600, height: 96, rx: 8 }), s("text", { x: 36, y: sy + 22, class: "st-kicker" }, "Statement"));
  rtlLine(st, 604, sy + 52, d.statement, "st-ar");
  st.append(s("text", { x: 36, y: sy + 78, class: "st-gloss" }, d.statementGloss));
  const verdicts = ["True", "False"].map((v, i) => {
    const vg = s("g", { class: `sl-verdict ${(i === 0) === d.answer ? "right" : ""}` });
    vg.append(s("rect", { x: 220 + i * 110, y: sy + 120, width: 96, height: 34, rx: 17 }), s("text", { x: 268 + i * 110, y: sy + 142, "text-anchor": "middle" }, v));
    g.append(vg);
    return vg;
  });
  g.append(ctx, st);
  return (ms) => {
    reveal(ctx, clamp01(ms / 400));
    reveal(st, clamp01((ms - 900) / 400));
    verdicts.forEach((v, i) => { reveal(v, clamp01((ms - 1700 - i * 100) / 300), 4); v.classList.toggle("lit", ms > 2600); });
  };
}

/* Shawarma Chats: a dialogue in Maghrebi Arabic, turn by turn. */
function slideShawarma(g) {
  const d = BENCH.shawarma;
  g.append(s("text", { x: 20, y: 24, class: "st-kicker" }, `${d.dialect}, about the Wikipedia article on the ${d.about}`));
  const bubbles = d.turns.map((t, i) => {
    const y = 40 + i * 72, right = t.s === "A";
    const w = Math.min(460, Math.max(220, t.t.length * 7.6 + 40));
    const x = right ? 620 - w : 20;
    const b = s("g", { class: `sl-bubble ${right ? "a" : "b"}` });
    b.append(s("rect", { x, y, width: w, height: 60, rx: 14 }));
    rtlLine(b, x + w - 14, y + 26, t.t, "st-ar sm");
    b.append(s("text", { x: x + 14, y: y + 47, class: "st-gloss" }, t.g));
    b.append(s("text", { x: right ? x + w - 4 : x + 4, y: y - 4, class: "sl-who", "text-anchor": right ? "end" : "start" }, t.s));
    g.append(b);
    return b;
  });
  return (ms) => bubbles.forEach((b, i) => reveal(b, clamp01((ms - i * 700) / 380), 12));
}

/* PersianMCQ: a generated question, options appear, the right one lights up. */
function slidePMCQ(g) {
  const d = BENCH.pmcq;
  const q = s("g", { class: "sl-card" });
  const ql = wrapWords(d.q, 60);
  q.append(s("rect", { x: 20, y: 24, width: 600, height: 40 + ql.length * 27 + 20, rx: 8 }), s("text", { x: 36, y: 46, class: "st-kicker" }, "Question"));
  ql.forEach((ln, i) => rtlLine(q, 604, 74 + i * 27, ln, "st-ar"));
  q.append(s("text", { x: 36, y: 74 + ql.length * 27, class: "st-gloss" }, d.qGloss));
  g.append(q);
  const top = 24 + 40 + ql.length * 27 + 44;
  const opts = d.options.map((o, i) => {
    const y = top + i * 62;
    const og = s("g", { class: `sl-opt ${o.ok ? "ok" : ""}` });
    og.append(s("rect", { x: 20, y, width: 600, height: 50, rx: 8 }));
    og.append(s("text", { x: 600, y: y + 31, class: "sl-opt-key", "text-anchor": "start", direction: "rtl" }, `${o.key}.`));
    rtlLine(og, 566, y + 31, o.t, "st-ar");
    og.append(s("text", { x: 36, y: y + 31, class: "st-gloss" }, o.g));
    g.append(og);
    return og;
  });
  return (ms) => {
    reveal(q, clamp01(ms / 400));
    opts.forEach((o, i) => { reveal(o, clamp01((ms - 800 - i * 220) / 320), 6); o.classList.toggle("lit", ms > 2500); });
  };
}

/* Sindhi: an instruction, its reasoning type, and the reasoned answer. */
function slideSindhi(g) {
  const d = BENCH.sindhi;
  const tag = s("g", { class: "sl-tag" });
  tag.append(s("rect", { x: 20, y: 18, width: 150, height: 28, rx: 14 }), s("text", { x: 95, y: 37, "text-anchor": "middle" }, d.type));
  const ins = s("g", { class: "sl-card" });
  const il = wrapWords(d.instruction, 58);
  ins.append(s("rect", { x: 20, y: 62, width: 600, height: 36 + il.length * 27 + 26, rx: 8 }), s("text", { x: 36, y: 84, class: "st-kicker" }, "Instruction"));
  il.forEach((ln, i) => rtlLine(ins, 604, 112 + i * 27, ln, "st-ar"));
  ins.append(s("text", { x: 36, y: 112 + il.length * 27, class: "st-gloss" }, d.instructionGloss));
  const oy = 62 + 36 + il.length * 27 + 26 + 26;
  const out = s("g", { class: "sl-card out" });
  const ol = wrapWords(d.output, 58);
  out.append(s("rect", { x: 20, y: oy, width: 600, height: 36 + ol.length * 27 + 26, rx: 8 }), s("text", { x: 36, y: oy + 22, class: "st-kicker" }, "Answer"));
  const lines = ol.map((ln, i) => ({ el: rtlLine(out, 604, oy + 50 + i * 27, ln, "st-ar"), ln }));
  out.append(s("text", { x: 36, y: oy + 50 + ol.length * 27, class: "st-gloss" }, d.outputGloss));
  g.append(tag, ins, out);
  return (ms) => {
    reveal(tag, clamp01(ms / 300), 4);
    reveal(ins, clamp01((ms - 300) / 400));
    reveal(out, clamp01((ms - 1300) / 400));
    lines.forEach(({ el: t }, i) => { t.style.opacity = clamp01((ms - 1600 - i * 500) / 500); });
  };
}

/* TalkFa: utterances classified by speech act and emotion. */
function slideTalkFa(g) {
  let y = 14;
  const rows = BENCH.talkfa.map((r) => {
    const tl = wrapWords(r.t, 62);
    const h = 40 + tl.length * 26 + 20 + 34;
    const rg = s("g", { class: "sl-card" });
    rg.append(s("rect", { x: 20, y, width: 600, height: h, rx: 8 }));
    rg.append(s("text", { x: 604, y: y + 24, class: "sl-who", "text-anchor": "start", direction: "rtl" }, r.who));
    tl.forEach((ln, j) => rtlLine(rg, 604, y + 50 + j * 26, ln, "st-ar"));
    const gy = y + 50 + tl.length * 26 - 6;
    rg.append(s("text", { x: 36, y: gy, class: "st-gloss" }, r.g));
    const cy = gy + 12;
    const chips = [["act", r.act], ["emotion", r.emotion]].map(([k, v], j) => {
      const cg = s("g", { class: `sl-chip ${k}` });
      cg.append(s("rect", { x: 36 + j * 150, y: cy, width: 140, height: 24, rx: 12 }), s("text", { x: 106 + j * 150, y: cy + 16, "text-anchor": "middle" }, `${k}: ${v}`));
      rg.append(cg);
      return cg;
    });
    g.append(rg);
    y += h + 14;
    return { rg, chips };
  });
  return (ms) => rows.forEach((r, i) => {
    reveal(r.rg, clamp01((ms - i * 900) / 380));
    r.chips.forEach((c, j) => reveal(c, clamp01((ms - i * 900 - 500 - j * 180) / 260), 4));
  });
}

const BENCH_SLIDES = [
  { paper: "ArabicSense", venue: "WACL-4 2025", href: "https://aclanthology.org/2025.wacl-1.1/", task: "Which sentence cannot be true?", label: "an Arabic sentence pair with the impossible phrase highlighted", build: slideArabicSense, dur: 3600 },
  { paper: "FarSense", venue: "IJCNLP-AACL 2025", href: "https://aclanthology.org/2025.ijcnlp-long.187/", task: "Read the story, judge the statement.", label: "a Farsi story, a statement about it, and the answer True", build: slideFarSense, dur: 4000 },
  { paper: "Shawarma Chats", venue: "ArabicNLP 2025", href: "https://aclanthology.org/2025.arabicnlp-main.39/", task: "A dialogue written in Maghrebi Arabic.", label: "a six-turn dialogue in Maghrebi Arabic", build: slideShawarma, dur: 5000 },
  { paper: "PersianMCQ-Instruct", venue: "LoResLM 2025", href: "https://aclanthology.org/2025.loreslm-1.27/", task: "A generated multiple-choice question in Persian.", label: "a Persian multiple-choice question with the right option highlighted", build: slidePMCQ, dur: 4000 },
  { paper: "Sindhi reasoning", venue: "LoResLM 2026", href: "https://aclanthology.org/2026.loreslm-1.22/", task: "An instruction that asks for causal reasoning in Sindhi.", label: "a Sindhi instruction and its reasoned answer", build: slideSindhi, dur: 4200 },
  { paper: "TalkFa", venue: "arXiv 2026", href: "https://arxiv.org/abs/2609.01810", task: "Farsi utterances, each labelled with a speech act and an emotion.", label: "three Farsi utterances with speech act and emotion labels", build: slideTalkFa, dur: 4200 },
];

function sceneBenchmarks2(mount, alive) { slideScene(mount, alive, BENCH_SLIDES); }

/* ---------------- crosswords, paper by paper ---------------- */
/* A row of answer tiles; words separated by a gap; right to left when rtl. */
function tiles(parent, cx, y, answer, { cell = 34, rtl = false } = {}) {
  const words = answer.split(" ");
  const total = words.reduce((n, w) => n + w.length, 0) * cell + (words.length - 1) * cell * 0.5;
  let x = rtl ? cx + total / 2 - cell : cx - total / 2;
  const out = [];
  words.forEach((w, wi) => {
    [...w].forEach((ch) => {
      const tg = s("g", { class: "cw-tile" });
      tg.append(s("rect", { x: x + 2, y, width: cell - 4, height: cell - 4, rx: 3 }));
      const t = s("text", { x: x + cell / 2, y: y + cell / 2 + 6, "text-anchor": "middle" }, ch);
      t.style.opacity = 0;
      tg.append(t);
      parent.append(tg);
      out.push(t);
      x += rtl ? -cell : cell;
    });
    if (wi < words.length - 1) x += rtl ? -cell * 0.5 : cell * 0.5;
  });
  return out;
}
const fillTiles = (list, ms, start, gap = 60) => list.forEach((t, j) => {
  const v = clamp01((ms - start - j * gap) / 200);
  t.style.opacity = v;
  t.style.transform = `translateY(${((1 - ease(v)) * -10).toFixed(1)}px)`;
});

/* Passage, the answer found inside it, clues for it, then the answer in tiles. */
function slidePassage(d, rtl = false) {
  return (g) => {
    const card = s("g", { class: "sl-card" });
    const pl = wrapWords(d.passage, rtl ? 58 : 74);
    const gl = d.gloss ? wrapWords(d.gloss, 84) : [];
    const h = 34 + pl.length * 24 + gl.length * 16 + 14;
    card.append(s("rect", { x: 20, y: 14, width: 600, height: h, rx: 8 }), s("text", { x: 36, y: 34, class: "st-kicker" }, "Passage"));
    const keyClean = d.key.toLowerCase();
    pl.forEach((ln, i) => {
      const y = 58 + i * 24;
      const mask = ln.split(" ").map((w) => w.toLowerCase().replace(/[.,'’]/g, "").startsWith(keyClean));
      if (rtl) rtlLine(card, 604, y, ln, "st-ar sm", mask);
      else {
        const t = s("text", { x: 36, y, class: "st-ci-text" });
        ln.split(" ").forEach((w, j) => { if (j) t.append(document.createTextNode(" ")); t.append(s("tspan", { class: mask[j] ? "st-absurd" : "" }, w)); });
        card.append(t);
      }
    });
    gl.forEach((ln, i) => card.append(s("text", { x: 36, y: 58 + pl.length * 24 + i * 16 - 4, class: "st-gloss" }, ln)));
    g.append(card);
    let y = 14 + h + 30;
    g.append(s("text", { x: 36, y, class: "st-kicker" }, "Clues"));
    y += 24;
    const clueEls = d.clues.map((c, k) => {
      const row = s("g");
      row.append(s("text", { x: rtl ? 610 : 30, y, class: "st-clue-n", "text-anchor": rtl ? "end" : "start" }, String(k + 1)));
      const t = rtl ? rtlLine(row, 592, y, c.t, "st-ar sm") : s("text", { x: 50, y, class: "st-clue-line" }, c.t);
      if (!rtl) row.append(t);
      if (c.g) row.append(s("text", { x: rtl ? 36 : 50, y: y + 17, class: "st-gloss" }, c.g));
      g.append(row);
      y += c.g ? 44 : 28;
      return row;
    });
    const tl = tiles(g, 320, Math.max(y + 10, 400), d.answer, { cell: 40, rtl });
    return (ms) => {
      reveal(card, clamp01(ms / 380));
      card.classList.toggle("hit", ms > 650);
      g.classList.add("st-sense");
      g.classList.toggle("hit", ms > 650);
      clueEls.forEach((r, k) => reveal(r, clamp01((ms - 900 - k * 520) / 360), 6));
      fillTiles(tl, ms, 900 + d.clues.length * 520 + 150);
    };
  };
}

/* Clue and answer pairs; optional length hint (empty tiles first) and a tag. */
function slidePairs(list, { rtl = false, hint = false } = {}) {
  return (g) => {
    const rows = list.map((d, i) => {
      const y = 12 + i * (hint ? 118 : 104);
      const r = s("g", { class: "cw-row" });
      r.append(s("rect", { x: 20, y, width: 600, height: hint ? 106 : 92, rx: 8, class: "cw-row-bg" }));
      if (rtl) rtlLine(r, 604, y + 26, d.clue, "st-ar sm");
      else r.append(s("text", { x: 36, y: y + 26, class: "st-clue-line" }, d.clue));
      r.append(s("text", { x: 36, y: y + 44, class: "st-gloss" }, d.gloss + (d.answerGloss ? `  (${d.answerGloss})` : "")));
      if (d.tag) {
        const tg = s("g", { class: "sl-chip emotion" });
        tg.append(s("rect", { x: 486, y: y + 10, width: 120, height: 22, rx: 11 }), s("text", { x: 546, y: y + 25, "text-anchor": "middle" }, d.tag));
        r.append(tg);
      }
      if (hint && d.hint) r.append(s("text", { x: 604, y: y + 26, class: "cw-hint", "text-anchor": "end" }, `(${d.hint.join(",")})`));
      const cell = d.answer.replace(/ /g, "").length > 12 ? 30 : 34;
      const t = tiles(r, 320, y + (hint ? 60 : 52), d.answer, { cell, rtl });
      g.append(r);
      return { r, t };
    });
    return (ms) => rows.forEach((row, i) => {
      reveal(row.r, clamp01((ms - i * 850) / 360), 8);
      fillTiles(row.t, ms, i * 850 + (hint ? 650 : 420), row.t.length > 12 ? 28 : 55);
    });
  };
}

/* IJCoL: how a clue is derived from a full sentence. */
function slideDerive(g) {
  const blocks = CROSS.ijcol.map((d, i) => {
    const y = 18 + i * 236;
    const b = s("g", { class: "cw-derive" });
    b.append(s("rect", { x: 20, y, width: 600, height: 216, rx: 8, class: "cw-row-bg" }));
    b.append(s("text", { x: 36, y: y + 24, class: "st-kicker" }, "Full sentence"));
    const sent = s("text", { x: 36, y: y + 54, class: "cw-sent" });
    d.sentence.split(" ").forEach((w, j) => {
      if (j) sent.append(document.createTextNode(" "));
      const clean = w.toLowerCase().replace(/^l'/, "");
      sent.append(s("tspan", { class: clean === d.answer ? "cw-ans" : "" }, w));
    });
    b.append(sent, s("text", { x: 36, y: y + 74, class: "st-gloss" }, d.gloss));
    b.append(s("text", { x: 36, y: y + 108, class: "st-kicker" }, "Clue"));
    const clue = s("text", { x: 36, y: y + 136, class: "cw-sent clue" }, d.clue);
    clue.style.opacity = 0;
    b.append(clue);
    const chips = d.steps.map((st, k) => {
      const c = s("g", { class: "sl-chip" });
      const w = st.length * 7 + 22;
      c.append(s("rect", { x: 36 + k * 168, y: y + 150, width: Math.min(160, w), height: 22, rx: 11 }), s("text", { x: 36 + k * 168 + Math.min(160, w) / 2, y: y + 165, "text-anchor": "middle" }, st));
      b.append(c);
      return c;
    });
    const t = tiles(b, 470, y + 112, d.answer.toUpperCase(), { cell: d.answer.length > 6 ? 22 : 28 });
    g.append(b);
    return { b, sent, clue, chips, t };
  });
  return (ms) => blocks.forEach((bl, i) => {
    const o = i * 1800;
    reveal(bl.b, clamp01((ms - o) / 380));
    bl.sent.classList.toggle("lit", ms > o + 600);
    bl.clue.style.opacity = clamp01((ms - o - 1000) / 400);
    fillTiles(bl.t, ms, o + 1000, 50);
    bl.chips.forEach((c, k) => reveal(c, clamp01((ms - o - 1300 - k * 180) / 260), 4));
  });
}

/* Building Bridges: a huge clue archive, then generate and verify. */
function slideBridges(g) {
  const d = CROSS.bridges;
  const top = s("g", { class: "sl-card" });
  top.append(s("rect", { x: 20, y: 14, width: 600, height: 150, rx: 8 }));
  top.append(s("text", { x: 36, y: 38, class: "st-kicker" }, "Training data: clue-answer pairs, " + d.years));
  const count = s("text", { x: 36, y: 92, class: "cw-count" }, "0");
  top.append(count, s("text", { x: 36, y: 116, class: "st-gloss" }, "over seven million pairs, according to the paper"));
  top.append(s("rect", { x: 36, y: 132, width: 568, height: 10, rx: 5, class: "st-track" }));
  const bar = s("rect", { x: 36, y: 132, width: 0, height: 10, rx: 5, class: "st-sim keep" });
  top.append(bar, s("text", { x: 36, y: 158, class: "st-gloss" }, "1913"), s("text", { x: 604, y: 158, class: "st-gloss", "text-anchor": "end" }, "2021"));
  g.append(top);
  const box = (x, label, sub) => {
    const b = s("g", { class: "cw-box" });
    b.append(s("rect", { x, y: 220, width: 170, height: 70, rx: 8 }), s("text", { x: x + 85, y: 248, "text-anchor": "middle", class: "cw-box-t" }, label), s("text", { x: x + 85, y: 268, "text-anchor": "middle", class: "st-gloss" }, sub));
    g.append(b);
    return b;
  };
  const gen = box(20, "Generator", d.generators), chk = box(235, "Checker", "BERT, zero-shot");
  const kept = s("g", { class: "cw-out keep" }); kept.append(s("rect", { x: 450, y: 196, width: 170, height: 48, rx: 8 }), s("text", { x: 535, y: 225, "text-anchor": "middle" }, "kept"));
  const drop = s("g", { class: "cw-out drop" }); drop.append(s("rect", { x: 450, y: 266, width: 170, height: 48, rx: 8 }), s("text", { x: 535, y: 295, "text-anchor": "middle" }, "filtered out"));
  g.append(kept, drop);
  const dots = Array.from({ length: 14 }, (_, i) => { const c = s("circle", { r: 5, class: i % 4 === 3 ? "cw-dot bad" : "cw-dot" }); g.append(c); return c; });
  g.append(s("text", { x: 320, y: 360, class: "st-gloss", "text-anchor": "middle" }, "Generated clues pass a checker that filters out nonsensical pairs."));
  g.append(s("text", { x: 320, y: 378, class: "st-gloss", "text-anchor": "middle" }, "The dots are an illustration of that flow, not data."));
  return (ms) => {
    reveal(top, clamp01(ms / 380));
    const c = ease(clamp01((ms - 300) / 1400));
    count.textContent = Math.round(7000000 * c).toLocaleString("en-US") + (c >= 1 ? "+" : "");
    bar.setAttribute("width", (568 * c).toFixed(1));
    [gen, chk, kept, drop].forEach((b, i) => reveal(b, clamp01((ms - 1500 - i * 150) / 300), 6));
    dots.forEach((dot, i) => {
      const t = ms === Infinity ? -1 : (ms - 2200 - i * 140) / 1100;
      if (t < 0 || t > 1) { dot.style.opacity = 0; return; }
      const bad = dot.classList.contains("bad");
      const x = t < 0.5 ? 190 + t * 2 * 45 : 405 + (t - 0.5) * 2 * 40;
      const y = t < 0.5 ? 255 : 255 + (bad ? 1 : -1) * (t - 0.5) * 2 * 35;
      dot.setAttribute("cx", x.toFixed(1)); dot.setAttribute("cy", y.toFixed(1));
      dot.style.opacity = 1;
    });
  };
}

const CROSS_SLIDES = [
  { paper: "Clue-Instruct", venue: "LREC-COLING 2024", href: "https://aclanthology.org/2024.lrec-main.297/", task: "Wikipedia passage in, clues out.", label: "a passage about grebes, three clues and the answer GREBE",
    build: slidePassage({ passage: CLUES[0].context, key: "grebe", answer: "GREBE", clues: CLUES[0].clues.map((t) => ({ t })) }), dur: 4200 },
  { paper: "Building Bridges", venue: "ICMLA 2023", href: "https://doi.org/10.1109/ICMLA58977.2023.00185", task: "Generate clues, then verify them.", label: "seven million clue-answer pairs and a generate-then-verify pipeline", build: slideBridges, dur: 4600 },
  { paper: "Italian crosswords", venue: "CLiC-it 2023", href: "https://arxiv.org/abs/2311.15723", task: "Real clue-answer pairs from the Italian dataset.", label: "four Italian clues and their answers", build: slidePairs(CROSS.ita2023), dur: 4200 },
  { paper: "Italian, from text", venue: "CLiC-it 2024", href: "https://aclanthology.org/2024.clicit-1.110/", task: "Clues written from an Italian Wikipedia passage.", label: "an Italian passage about Fucus, two clues and the answer", build: slidePassage(CROSS.ita2024), dur: 4000 },
  { paper: "Italian, linguistic analysis", venue: "IJCoL 2025", href: "https://doi.org/10.17454/ijcol111.03", task: "How a clue is derived from a full sentence.", label: "two Italian sentences turned into clues by omission, inversion and a clitic", build: slideDerive, dur: 4400 },
  { paper: "ArabIcros", venue: "ArabicNLP 2023", href: "https://aclanthology.org/2023.arabicnlp-1.23/", task: "Arabic clue-answer pairs.", label: "three Arabic clues and their answers", build: slidePairs(CROSS.arabicros, { rtl: true }), dur: 3800 },
  { paper: "Arabic, from text", venue: "LoResLM 2025", href: "https://arxiv.org/abs/2501.11035", task: "Clues written from an Arabic Wikipedia passage.", label: "an Arabic passage about muscle, three clues and the answer", build: slidePassage(CROSS.arabic2025, true), dur: 4200 },
  { paper: "Turkish crosswords", venue: "AIED 2024", href: "https://arxiv.org/abs/2405.07035", task: "Clues written from a Turkish passage.", label: "a Turkish passage about manganese, three clues and the answer", build: slidePassage(CROSS.turkish), dur: 4200 },
  { paper: "WebCrow French", venue: "INTETAIN 2023", href: "https://doi.org/10.1007/978-3-031-55722-4_14", task: "French clues the paper singles out as hard to solve.", label: "three hard French clues and their answers", build: slidePairs(CROSS.webcrow), dur: 3800 },
  { paper: "ECWCA", venue: "CLiC-it 2024", href: "https://aclanthology.org/2024.clicit-1.138/", task: "Answer the clue, with the length of each word as a hint.", label: "three Italian clues with length hints and their answers", build: slidePairs(CROSS.ecwca, { hint: true }), dur: 4000 },
];

function sceneCrossword2(mount, alive) { slideScene(mount, alive, CROSS_SLIDES); }

/* ---------------- learning, paper by paper ---------------- */
/* Turkish quiz: a generated question with the correct option lighting up. */
function slideQuiz(g) {
  const d = LEARN.quiz;
  g.append(s("text", { x: 20, y: 24, class: "st-kicker" }, d.subject));
  const q = s("g", { class: "sl-card" });
  q.append(s("rect", { x: 20, y: 38, width: 600, height: 88, rx: 8 }), s("text", { x: 36, y: 60, class: "st-kicker" }, "Generated question"));
  q.append(s("text", { x: 36, y: 88, class: "st-clue-line" }, d.q), s("text", { x: 36, y: 110, class: "st-gloss" }, d.qGloss));
  g.append(q);
  const opts = d.options.map((o, i) => {
    const y = 148 + i * 70;
    const og = s("g", { class: `sl-opt ${o.ok ? "ok" : ""}` });
    og.append(s("rect", { x: 20, y, width: 600, height: 58, rx: 8 }), s("text", { x: 36, y: y + 26, class: "sl-opt-key" }, "ABC"[i] + "."));
    og.append(s("text", { x: 62, y: y + 26, class: "st-clue-line" }, o.t), s("text", { x: 62, y: y + 45, class: "st-gloss" }, o.g));
    g.append(og);
    return og;
  });
  return (ms) => { reveal(q, clamp01(ms / 380)); opts.forEach((o, i) => { reveal(o, clamp01((ms - 700 - i * 220) / 320), 6); o.classList.toggle("lit", ms > 2200); }); };
}

/* Syntax feedback: errors found in a real student essay, with corrections. */
function slideEssay(g) {
  const d = LEARN.essay;
  const card = s("g", { class: "sl-card" });
  // keep each error phrase on one line: glue its words while wrapping
  let glued = d.text;
  d.fixes.forEach((f) => { glued = glued.replace(f.find, f.find.replace(/ /g, "\u0001")); });
  const lines = wrapWords(glued, 84).map((ln) => ln.replace(/\u0001/g, " "));
  card.append(s("rect", { x: 20, y: 14, width: 600, height: 40 + lines.length * 22, rx: 8 }), s("text", { x: 36, y: 36, class: "st-kicker" }, "Student essay"));
  const spans = [];
  lines.forEach((ln, i) => {
    const t = s("text", { x: 36, y: 62 + i * 22, class: "st-ci-text" });
    let rest = ln;
    // split each line around any of the error phrases it contains
    while (rest.length) {
      const hit = d.fixes.map((f, k) => ({ k, at: rest.indexOf(f.find) })).filter((h) => h.at >= 0).sort((a, b) => a.at - b.at)[0];
      if (!hit) { t.append(document.createTextNode(rest)); break; }
      if (hit.at) t.append(document.createTextNode(rest.slice(0, hit.at)));
      const sp = s("tspan", { class: "fb-err" }, d.fixes[hit.k].find);
      spans.push({ sp, k: hit.k });
      t.append(sp);
      rest = rest.slice(hit.at + d.fixes[hit.k].find.length);
    }
    card.append(t);
  });
  g.append(card);
  const top = 14 + 40 + lines.length * 22 + 24;
  const cards = d.fixes.map((f, k) => {
    const y = top + k * 74;
    const c = s("g", { class: "fb-card" });
    c.append(s("rect", { x: 20, y, width: 600, height: 62, rx: 8 }), s("text", { x: 36, y: y + 24, class: "st-kicker" }, f.kind));
    c.append(s("text", { x: 36, y: y + 47, class: "fb-old" }, f.find), s("text", { x: 300, y: y + 47, class: "fb-arrow" }, "becomes"), s("text", { x: 370, y: y + 47, class: "fb-new" }, f.fix));
    g.append(c);
    return c;
  });
  return (ms) => {
    reveal(card, clamp01(ms / 380));
    spans.forEach(({ sp, k }) => sp.classList.toggle("on", ms > 800 + k * 700));
    cards.forEach((c, k) => reveal(c, clamp01((ms - 1000 - k * 700) / 320), 6));
  };
}

/* MultiHint-9K: the generator, critic and refiner loops from the paper's Figure 1. */
function slideHints(g) {
  const d = LEARN.hints;
  const nodes = [
    { x: 20, y: 70, t: "Generator", sub: "writes Q and A" },
    { x: 180, y: 70, t: "Critic", sub: "rates A, B or C" },
    { x: 340, y: 70, t: "Hint architect", sub: "writes the hint" },
    { x: 500, y: 70, t: "Hint critic", sub: "rates A, B or C" },
  ];
  g.append(s("text", { x: 20, y: 40, class: "st-kicker" }, "Three languages in parallel, 21 agents, from the paper's pipeline"));
  const boxes = nodes.map((n) => {
    const b = s("g", { class: "cw-box" });
    b.append(s("rect", { x: n.x, y: n.y, width: 120, height: 64, rx: 8 }), s("text", { x: n.x + 60, y: n.y + 28, "text-anchor": "middle", class: "cw-box-t" }, n.t), s("text", { x: n.x + 60, y: n.y + 48, "text-anchor": "middle", class: "st-gloss" }, n.sub));
    g.append(b);
    return b;
  });
  const arrows = [[140, 180], [300, 340], [460, 500]].map(([a, b]) => { const p2 = s("path", { d: `M ${a} 102 H ${b - 6} M ${b - 12} 96 L ${b - 6} 102 L ${b - 12} 108`, class: "st-flow" }); g.append(p2); return p2; });
  const loops = [[240, 80], [560, 400]].map(([from, to]) => {
    const p2 = s("path", { d: `M ${from} 134 C ${from} 178, ${to} 178, ${to} 134`, class: "fb-loop" });
    g.append(p2, s("text", { x: (from + to) / 2, y: 184, "text-anchor": "middle", class: "fb-loop-t" }, "B or C: refine and retry"));
    return p2;
  });
  const stats = s("g", { class: "sl-card" });
  stats.append(s("rect", { x: 20, y: 214, width: 600, height: 236, rx: 8 }), s("text", { x: 36, y: 240, class: "st-kicker" }, "Wikipedia articles in, verified tuples out"));
  const max = Math.max(...d.articles.map((a) => a[1]));
  const bars = d.articles.map(([lang, n], i) => {
    const y = 262 + i * 40;
    stats.append(s("text", { x: 36, y: y + 14, class: "st-clue-it" }, lang));
    const bar = s("rect", { x: 120, y, width: 0, height: 18, rx: 3, class: "st-bar" });
    const val = s("text", { x: 126, y: y + 14, class: "st-val" }, n.toLocaleString("en-US"));
    stats.append(bar, val);
    return { bar, val, w: (n / max) * 380 };
  });
  const out = s("text", { x: 36, y: 412, class: "cw-count sm" }, "");
  stats.append(out, s("text", { x: 36, y: 436, class: "st-gloss" }, `QA-hint tuples kept. Without the critic, ${d.noCritic} of hints would contain errors.`));
  g.append(stats);
  return (ms) => {
    boxes.forEach((b, i) => reveal(b, clamp01((ms - i * 260) / 300), 6));
    arrows.forEach((a, i) => { a.style.opacity = clamp01((ms - 300 - i * 260) / 300); });
    loops.forEach((l, i) => { l.style.opacity = clamp01((ms - 1200 - i * 300) / 400); });
    reveal(stats, clamp01((ms - 1500) / 380));
    bars.forEach((b, i) => { const t = ease(clamp01((ms - 1800 - i * 150) / 600)); b.bar.setAttribute("width", (b.w * t).toFixed(1)); b.val.setAttribute("x", (126 + b.w * t).toFixed(1)); });
    const c = ease(clamp01((ms - 2600) / 900));
    out.textContent = c > 0 ? Math.round(d.tuples * c).toLocaleString("en-US") : "";
  };
}

/* Iterative ICL: evaluating a nested expression where + comes before *. */
function slideICL(g) {
  const d = LEARN.icl;
  const rule = s("g", { class: "sl-tag" });
  rule.append(s("rect", { x: 20, y: 18, width: 230, height: 28, rx: 14 }), s("text", { x: 135, y: 37, "text-anchor": "middle" }, `Rule: ${d.rule}`));
  const expr = s("text", { x: 320, y: 110, class: "icl-expr", "text-anchor": "middle" }, d.expr);
  g.append(rule, expr);
  const steps = d.steps.map((st, i) => {
    const y = 160 + i * 52;
    const r = s("g", { class: "icl-step" });
    r.append(s("rect", { x: 170, y, width: 300, height: 40, rx: 8 }), s("text", { x: 190, y: y + 26, class: "st-clue-n" }, String(i + 1)), s("text", { x: 320, y: y + 27, class: "icl-step-t", "text-anchor": "middle" }, st));
    g.append(r);
    return r;
  });
  const res = s("g");
  res.append(s("text", { x: 320, y: 450, class: "cw-count", "text-anchor": "middle" }, `= ${d.result}`), s("text", { x: 320, y: 474, class: "st-gloss", "text-anchor": "middle" }, d.usual));
  g.append(res);
  return (ms) => {
    reveal(rule, clamp01(ms / 300), 4);
    expr.style.opacity = clamp01((ms - 200) / 400);
    steps.forEach((r, i) => { reveal(r, clamp01((ms - 700 - i * 420) / 300), 6); r.classList.toggle("on", ms > 700 + i * 420 && ms < 700 + (i + 1) * 420 + 200); });
    reveal(res, clamp01((ms - 700 - steps.length * 420) / 400), 6);
  };
}

const LEARN_SLIDES = [
  { paper: "Turkish quizzes", venue: "ISPR 2024", href: "https://arxiv.org/abs/2406.03397", task: "A quiz question generated from Turkish course material.", label: "a Turkish chemistry question with the correct option highlighted", build: slideQuiz, dur: 3600 },
  { paper: "Syntax feedback", venue: "AIEER 2024", href: "https://arxiv.org/abs/2501.07740", task: "Feedback on a real student essay.", label: "a student essay with three errors found and corrected", build: slideEssay, dur: 3800 },
  { paper: "MultiHint-9K", venue: "AIED 2026 workshops", href: "https://ceur-ws.org/Vol-4248/short11.pdf", task: "Agents that write, judge and repair hints.", label: "the generator, critic and refiner pipeline and the dataset counts", build: slideHints, dur: 4200 },
  { paper: "Iterative ICL for algebra", venue: "ACM SAC 2026", href: "https://doi.org/10.1145/3748522.3779772", task: "A nested expression solved step by step, under a changed rule.", label: "the expression ((4 + 0) * (3 + 1) + (2 + 4)) evaluated in five steps to 40", build: slideICL, dur: 4000 },
];

function sceneLearning(mount, alive) { slideScene(mount, alive, LEARN_SLIDES); }

/* ---------------- languages, paper by paper ---------------- */
/* CALAMITA: a community benchmark for Italian, by ability (Table 1 of the paper). */
function slideCalamita(g) {
  const d = CALAMITA;
  const top = s("g");
  top.append(s("text", { x: 20, y: 44, class: "cw-count sm" }, `${d.challenges} challenges, ${d.subtasks} subtasks`));
  top.append(s("text", { x: 20, y: 68, class: "st-gloss" }, "Written in and for Italian by research groups across Italy and beyond."));
  g.append(top);
  const max = Math.max(...d.abilities.map((a) => a[1]));
  const mineIdx = d.abilities.findIndex((a) => a[0] === d.mine);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const rows = d.abilities.map(([name, ch, t], i) => {
    const y = 100 + i * 40 + (i > mineIdx ? 24 : 0);
    const r = s("g", { class: name === d.mine ? "cal-row mine" : "cal-row" });
    r.append(s("text", { x: 20, y: y + 14, class: "st-clue-it" }, name));
    const bar = s("rect", { x: 210, y, width: 0, height: 18, rx: 3, class: "cal-bar" });
    const val = s("text", { x: 216, y: y + 14, class: "cal-val" }, `${plural(ch, "challenge")}, ${plural(t, "subtask")}`);
    r.append(bar, val);
    g.append(r);
    return { r, bar, val, w: (ch / max) * 250 };
  });
  const my = 100 + mineIdx * 40;
  const note = s("text", { x: 210, y: my + 38, class: "fb-loop-t" }, "One of these is ECWCA, my crossword challenge.");
  g.append(note, s("text", { x: 20, y: 470, class: "st-gloss" }, "A challenge can count in more than one ability."));
  return (ms) => {
    reveal(top, clamp01(ms / 380));
    rows.forEach((row, i) => {
      reveal(row.r, clamp01((ms - 300 - i * 120) / 300), 4);
      const t = ease(clamp01((ms - 400 - i * 120) / 600));
      row.bar.setAttribute("width", (row.w * t).toFixed(1));
      row.val.setAttribute("x", (216 + row.w * t).toFixed(1));
    });
    note.style.opacity = clamp01((ms - 1800) / 400);
  };
}

/* Elections go bananas: three steps by which a plural drifts away from its singular. */
function slideBananas(g) {
  const d = BANANAS;
  const chip = (parent, x, y, word, gloss, lang, cls) => {
    const c = s("g", { class: `pt-chip ${cls}` });
    c.append(s("rect", { x, y, width: 120, height: 46, rx: 6 }));
    c.append(s("text", { x: x + 60, y: y + (gloss ? 21 : 28), "text-anchor": "middle", class: "pt-word", lang: lang || "en" }, word));
    if (gloss) c.append(s("text", { x: x + 60, y: y + 38, "text-anchor": "middle", class: "st-gloss" }, `‘${gloss}’`));
    parent.append(c);
    return c;
  };
  const rows = d.ladder.map((st, i) => {
    const y = 14 + i * 98;
    const r = s("g", { class: "pt-row" });
    r.append(s("text", { x: 20, y: y + 22, class: "st-msft-code" }, st.code));
    r.append(s("text", { x: 58, y: y + 22, class: "st-clue-it" }, st.name));
    wrapWords(st.note, 36).forEach((ln, k) => r.append(s("text", { x: 20, y: y + 46 + k * 17, class: "st-gloss" }, ln)));
    const sg = chip(r, 340, y + 4, st.sg, st.sgGloss, st.lang, "sg");
    const link = s("path", { d: `M 460 ${y + 27} H 500`, class: `pt-link l${i}` });
    r.append(link);
    chip(r, 500, y + 4, st.pl, st.plGloss, st.lang, "pl");
    r.append(s("text", { x: 400, y: y + 66, "text-anchor": "middle", class: "pt-lab" }, "singular"), s("text", { x: 560, y: y + 66, "text-anchor": "middle", class: "pt-lab" }, "plural"));
    g.append(r);
    return { r, sg, link, i };
  });
  // Italian case study on a 1910 to 2005 time line.
  const c = d.case, cy = 318;
  const card = s("g", { class: "sl-card" });
  card.append(s("rect", { x: 20, y: cy, width: 600, height: 150, rx: 8 }), s("text", { x: 36, y: cy + 24, class: "st-kicker" }, "Italian, from the paper's case study"));
  const sx = (yr) => 60 + ((yr - c.from) / (c.to - c.from)) * 520;
  card.append(s("text", { x: 36, y: cy + 54, class: "pt-word", lang: "it" }, c.sg), s("text", { x: 108, y: cy + 54, class: "st-gloss" }, `‘${c.sgGloss}’`));
  card.append(s("text", { x: 330, y: cy + 54, class: "pt-word", lang: "it" }, c.pl), s("text", { x: 390, y: cy + 54, class: "st-gloss" }, `‘${c.plGloss}’, almost only in the plural`));
  card.append(s("path", { d: `M ${sx(c.from)} ${cy + 96} H ${sx(c.to)}`, class: "pt-axis" }));
  [c.from, c.at, c.to].forEach((yr) => card.append(s("text", { x: sx(yr), y: cy + 120, "text-anchor": "middle", class: "pt-lab" }, String(yr))));
  const grow = s("path", { d: `M ${sx(c.at)} ${cy + 96} H ${sx(c.to)}`, class: "pt-grow" });
  const dot = s("circle", { cx: sx(c.at), cy: cy + 96, r: 6, class: "pt-dot" });
  const mark = s("text", { x: sx(c.at) + 12, y: cy + 86, class: "fb-loop-t" }, "the sense ‘waste’ appears");
  card.append(grow, dot, mark);
  card.append(s("text", { x: 36, y: cy + 142, class: "st-gloss" }, `Words kept for study: ${d.kept.map(([l, n]) => `${l} ${n}`).join(", ")}.`));
  g.append(card);
  const len = sx(c.to) - sx(c.at);
  grow.setAttribute("stroke-dasharray", `${len} ${len}`);
  return (ms) => {
    rows.forEach((row) => {
      const t0 = row.i * 650;
      reveal(row.r, clamp01((ms - t0) / 320), 6);
      // the bond between singular and plural weakens down the ladder
      const loosen = clamp01((ms - t0 - 350) / 500);
      if (row.i === 2) row.sg.style.opacity = 1 - 0.55 * loosen;
      row.link.style.opacity = row.i === 0 ? 1 : 1 - (row.i === 1 ? 0.35 : 0.85) * loosen;
    });
    reveal(card, clamp01((ms - 2100) / 380));
    grow.setAttribute("stroke-dashoffset", (len * (1 - ease(clamp01((ms - 2600) / 900)))).toFixed(1));
    dot.style.opacity = clamp01((ms - 2500) / 300);
    mark.style.opacity = clamp01((ms - 2700) / 400);
  };
}

const LANG_SLIDES = [
  { paper: "Multi-SFT", venue: "arXiv 2026", href: "https://arxiv.org/abs/2610.22086", task: "Instruction data in Europe's languages, behind Villanova2.", label: "five real Multi-SFT examples in French, Italian, German, Spanish and English, each an instruction and its answer", build: slideMSFT, dur: 7400 },
  { paper: "CALAMITA", venue: "IJCoL 2026", href: "https://arxiv.org/abs/2512.04759", task: "A community benchmark for Italian.", label: "22 challenges and 95 subtasks grouped by the ability they test, with ECWCA under commonsense reasoning", build: slideCalamita, dur: 4200 },
  { paper: "Elections go bananas", venue: "EACL 2026", href: "https://aclanthology.org/2026.eacl-long.308/", task: "How a plural drifts away from its singular, read by LLMs in Italian, Russian and English corpora.", label: "eyelash and eyelashes, banana and bananas meaning crazy, and the Russian plural for elections, then the Italian rifiuti meaning waste appearing around 1930", build: slideBananas, dur: 5200 },
];
function sceneLanguages2(mount, alive) { slideScene(mount, alive, LANG_SLIDES); }

/* ---------------- scene: the work as a graph ---------------- */
function sceneGraph(mount) { buildGraph(mount); }

const SCENES = [
  { id: "work", tab: "The work", sub: "31 papers, connected", title: "Every paper, connected",
    text: "Thirty-one papers, four lines of work, nine languages. This map shows how they connect: pick a language or a line of work, and the papers behind it light up.",
    links: [{ href: "publications.html", label: "All publications" }], build: sceneGraph, hold: 8000 },
  { id: "langs", tab: "Languages", sub: "Three papers, Europe's languages", title: "Open models for Europe's languages",
    text: "Most open models are strongest in English. At Villanova.AI we train them in Italy for Europe's own languages, starting from the data they learn from. Three papers: the instruction data, a community benchmark for Italian, and what LLMs can tell us about how words change.",
    links: [{ href: "https://arxiv.org/abs/2610.22086", label: "Multi-SFT paper" }, { href: "https://huggingface.co/collections/VillanovaAI/villanova2-6adf59f613d86d7ccbd654fa", label: "Villanova2" }],
    build: sceneLanguages2, hold: 18000 },
  { id: "bench", tab: "Benchmarks", sub: "Six papers, six languages", title: "Benchmarks for languages that have none",
    text: "Before a model can be trusted in Arabic, Farsi or Sindhi, someone has to test it there. Each slide is a real item from one of the benchmarks I built, one paper at a time; pick a paper above the scene to jump to it.",
    links: [{ href: "https://huggingface.co/datasets/Kamyar-zeinalipour/ArabicSense", label: "ArabicSense" }, { href: "https://aclanthology.org/2025.ijcnlp-long.187/", label: "FarSense" }],
    build: sceneBenchmarks2, hold: 26000 },
  { id: "cross", tab: "Crosswords", sub: "Ten papers, five languages", title: "Crosswords from course material",
    text: "My Ph.D. began with crossword clues: a clue has to be true, point to exactly one answer, and be worth solving. Ten papers, from Italian and Arabic to Turkish, English and French, one real example each; pick a paper above the scene to jump to it.",
    links: [{ href: "https://aclanthology.org/2024.lrec-main.297/", label: "Clue-Instruct" }, { href: "crossword.html", label: "Play the crossword" }],
    build: sceneCrossword2, hold: 42000 },
  { id: "learn", tab: "Learning", sub: "Quizzes, hints, feedback", title: "Material a student can learn from",
    text: "Quizzes, hints and writing feedback: material that helps a student learn, not just read. Four papers, one real example each; pick a paper above the scene to jump to it.",
    links: [{ href: "https://ceur-ws.org/Vol-4248/short11.pdf", label: "MultiHint-9K" }, { href: "https://arxiv.org/abs/2501.07740", label: "Syntax feedback" }],
    build: sceneLearning, hold: 16000 },
  { id: "measure", tab: "Measuring", sub: "Surprisal and difficulty", title: "How hard is a clue?",
    text: "How hard is a clue? Sixty people solved 160 Italian clues for us. The surprisal a model gives the answer tracked how hard they found it, so a generator can aim for an easy or a hard puzzle on purpose.",
    links: [{ href: "https://aclanthology.org/2025.clicit-1.50/", label: "CLiC-it 2025 paper" }, { href: "https://huggingface.co/datasets/Kamyar-zeinalipour/Crossword-Surprisal-IT", label: "The data" }],
    build: sceneMeasuring, hold: 6500 },
  { id: "protein", tab: "Proteins", sub: "Sequence to structure", title: "From a sentence to a fold",
    text: "To a language model, a protein is a sentence in a twenty-letter alphabet. In the paper, fine-tuned models write new sequences, AlphaFold 2 folds them, and pLDDT and TM-score judge the fold. Shown here: a real folded protein, coloured by position along the chain.",
    links: [{ href: "https://aclanthology.org/2024.langmol-1.5/", label: "Design proteins with LLMs" }, { href: "https://www.rcsb.org/structure/1UBQ", label: "PDB 1UBQ" }],
    build: (m, a) => sceneProtein3D(m, a, sceneProtein), hold: 10000 },
  { id: "drug", tab: "Drugs", sub: "Targets and molecules", title: "A drug in its target",
    text: "The same idea, pointed at medicine. This is a real drug, imatinib, sitting in the pocket of its target, Abl kinase. PharMistral learns to propose molecules for targets like this one, starting from the protein sequence alone.",
    links: [{ href: "https://doi.org/10.1016/j.cmpbup.2026.100257", label: "PharMistral" }, { href: "https://www.rcsb.org/structure/1IEP", label: "PDB 1IEP" }],
    build: (m, a) => sceneDrug3D(m, a, sceneMolecule), hold: 10000 },
  { id: "kg", tab: "Knowledge graphs", sub: "Semantic fidelity", title: "Graph to text, and back",
    text: "Knowledge graphs hold facts, but people read text. A model writes the graph out as a paragraph, a second model reads the facts back, and only text that survives the round trip is kept. This is the paper's own example: one paragraph keeps the facts, the other drifts away from them.",
    links: [{ href: "https://aclanthology.org/2026.acl-industry.140/", label: "ACL 2026 paper" }],
    build: sceneKG, hold: 5000 },
];

export function buildStage() {
  const root = $("#stage");
  if (!root) return;

  const side = el("div", { className: "st-side" });
  const list = el("div", { className: "st-list" });
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Chapters of the work");
  list.setAttribute("aria-orientation", "vertical");
  const story = el("div", { className: "st-story" });
  story.setAttribute("aria-live", "polite");
  const storyText = el("p", { className: "st-story-text" });
  const storyLinks = el("p", { className: "cite links" });
  story.append(storyText, storyLinks);
  const tour = el("button", { type: "button", className: "st-tour" });
  side.append(list, tour);

  const main = el("div", { className: "st-main", id: "st-panel" });
  main.setAttribute("role", "tabpanel");
  const view = el("div", { className: "st-view" });
  main.append(view);
  root.append(side, main);

  // Desktop: the story opens under its chapter. Narrow screens: under the row of chapters.
  const wide = window.matchMedia("(min-width: 60rem)");
  const placeStory = () => {
    if (current < 0) return;
    if (wide.matches) tabs[current].after(story);
    else list.after(story);
  };
  wide.addEventListener("change", placeStory);

  let current = -1, token = 0, timer = null, touring = false, visited = 0;
  const tabs = SCENES.map((sc, i) => {
    const b = el("button", { type: "button", className: "st-tab", id: `st-tab-${sc.id}` });
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", "st-panel");
    b.append(el("span", { className: "st-tab-title", textContent: sc.tab }),
             el("span", { className: "st-tab-sub", textContent: sc.sub }),
             el("span", { className: "st-prog" }));
    b.addEventListener("click", () => { stopTour(); show(i); });
    b.addEventListener("keydown", (ev) => {
      const fwd = ev.key === "ArrowDown" || ev.key === "ArrowRight";
      const back = ev.key === "ArrowUp" || ev.key === "ArrowLeft";
      if (!fwd && !back) return;
      ev.preventDefault();
      const j = (i + (fwd ? 1 : SCENES.length - 1)) % SCENES.length;
      stopTour(); show(j); tabs[j].focus();
    });
    list.append(b);
    return b;
  });

  function show(i) {
    current = i;
    const my = ++token;
    const sc = SCENES[i];
    tabs.forEach((b, j) => {
      b.setAttribute("aria-selected", String(j === i));
      b.tabIndex = j === i ? 0 : -1;
      const bar = b.querySelector(".st-prog");
      bar.style.animation = "none";
      if (j === i && touring) { void bar.offsetWidth; bar.style.animation = `stprog ${sc.hold}ms linear forwards`; }
    });
    main.setAttribute("aria-labelledby", `st-tab-${sc.id}`);
    main.setAttribute("aria-label", sc.title);
    storyText.textContent = sc.text;
    storyLinks.replaceChildren(...sc.links.flatMap((l, k) => [k ? document.createTextNode(" ") : "", el("a", { href: l.href, textContent: l.label })]));
    placeStory();
    story.classList.remove("in"); void story.offsetWidth; story.classList.add("in");
    view.classList.remove("in");
    view.replaceChildren();
    sc.build(view, () => my === token && view.isConnected);
    void view.offsetWidth;
    view.classList.add("in");
  }

  function paintTour() {
    tour.hidden = calm();
    tour.textContent = touring ? "Pause the story" : "Play the story";
    tour.setAttribute("aria-pressed", String(touring));
  }
  function stopTour() {
    touring = false;
    clearTimeout(timer);
    tabs.forEach((b) => { b.querySelector(".st-prog").style.animation = "none"; });
    paintTour();
  }
  function next() {
    if (!touring) return;
    visited++;
    if (visited >= SCENES.length) { stopTour(); show(0); return; }
    show((current + 1) % SCENES.length);
    timer = setTimeout(next, SCENES[current].hold);
  }
  function startTour(from) {
    touring = true; visited = 0; paintTour();
    show(from);
    timer = setTimeout(next, SCENES[from].hold);
  }
  tour.addEventListener("click", () => {
    if (touring) stopTour();
    else startTour(current >= 0 ? (current + 1) % SCENES.length : 0);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && touring) stopTour(); });

  show(0);
  paintTour();
  if (calm()) return;
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { io.disconnect(); startTour(0); }
  }, { threshold: 0.3 });
  io.observe(root);
}
