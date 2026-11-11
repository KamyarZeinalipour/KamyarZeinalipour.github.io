/* The home page stage: one animated scene per research area.
   It plays a single tour through the scenes, then stops on the first one. Tabs
   jump to any scene, a button pauses or replays the tour, and under
   prefers-reduced-motion every scene is drawn in its finished state. */
import { PUZZLE, PROTEIN, SENSE, SURPRISAL, MSFT, CLUES } from "./data.js";
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

/* ---------------- scene: Multi-SFT, five real examples ---------------- */
function sceneLanguages(mount, alive) {
  const svg = stageSvg("Five real examples from the Multi-SFT instruction data, one each in French, Italian, German, Spanish and English: an instruction, then the answer a model learns from.");
  mount.append(svg);
  const rows = MSFT.map((m, i) => {
    const y = 10 + i * 97;
    const g = s("g", { class: "st-msft" });
    g.append(s("rect", { x: 14, y, width: 612, height: 88, rx: 8, class: "st-msft-card" }));
    g.append(s("text", { x: 30, y: y + 21, class: "st-msft-code" }, m.code));
    g.append(s("text", { x: 58, y: y + 21, class: "st-msft-src" }, m.src));
    g.append(s("text", { x: 30, y: y + 44, class: "st-qa" }, "Q"));
    g.append(s("text", { x: 30, y: y + 75, class: "st-qa a" }, "A"));
    const qLines = wrapWords(m.q, 76).slice(0, 2);
    const q = qLines.map((ln, k) => {
      const t = s("text", { x: 50, y: y + 44 + k * 16, class: "st-q", lang: m.lang }, "");
      g.append(t);
      return { t, ln };
    });
    const aLine = wrapWords(m.a, 80)[0];
    const at = s("text", { x: 50, y: y + 75, class: "st-a", lang: m.lang }, "");
    const caret = s("rect", { y: y + 64, width: 7, height: 14, rx: 1, class: "st-caret" });
    g.append(at, caret);
    g.style.opacity = 0;
    svg.append(g);
    return { g, q, at, aLine, caret, y };
  });
  const per = 1150;
  run(alive, (ms) => {
    rows.forEach((r, i) => {
      const local = ms === Infinity ? 99999 : ms - i * per;
      const t = clamp01(local / 380);
      r.g.style.opacity = t;
      r.g.style.transform = `translateY(${(1 - ease(t)) * 10}px)`;
      const qTotal = r.q.reduce((n, x) => n + x.ln.length, 0);
      let budget = Math.floor(clamp01((local - 200) / 520) * qTotal);
      r.q.forEach(({ t: el2, ln }) => { const n = Math.min(ln.length, budget); el2.textContent = ln.slice(0, n); budget -= n; });
      const words = r.aLine.split(" ");
      const k = Math.floor(clamp01((local - 760) / 600) * words.length);
      r.at.textContent = words.slice(0, k).join(" ");
      const streaming = local > 760 && local < 1500 && ms !== Infinity;
      r.caret.style.opacity = streaming ? 1 : 0;
      if (streaming && r.at.getComputedTextLength) r.caret.setAttribute("x", 52 + r.at.getComputedTextLength());
    });
    return ms < rows.length * per + 800;
  });
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

/* ---------------- scene: the work as a graph ---------------- */
function sceneGraph(mount) { buildGraph(mount); }

const SCENES = [
  { id: "work", tab: "The work", sub: "31 papers, connected", title: "Every paper, connected",
    text: "Thirty-one papers, four lines of work, nine languages. This map shows how they connect: pick a language or a line of work, and the papers behind it light up.",
    links: [{ href: "publications.html", label: "All publications" }], build: sceneGraph, hold: 8000 },
  { id: "langs", tab: "Languages", sub: "Villanova and Multi-SFT", title: "Open models for Europe's languages",
    text: "Most open models are strongest in English. At Villanova.AI we train them in Italy for Europe's own languages. These are real examples from Multi-SFT, our instruction data: one per language, each an instruction and the answer a model learns from.",
    links: [{ href: "https://arxiv.org/abs/2610.22086", label: "Multi-SFT paper" }, { href: "https://huggingface.co/collections/VillanovaAI/villanova2-6adf59f613d86d7ccbd654fa", label: "Villanova2" }],
    build: sceneLanguages, hold: 7000 },
  { id: "bench", tab: "Benchmarks", sub: "Commonsense in Arabic and Farsi", title: "Benchmarks for languages that have none",
    text: "Before a model can be trusted in Arabic or Farsi, someone has to test it there. These are real ArabicSense test pairs: one sentence in each cannot be true, and a model that has really learned the language should spot the impossible phrase.",
    links: [{ href: "https://huggingface.co/datasets/Kamyar-zeinalipour/ArabicSense", label: "ArabicSense" }, { href: "https://aclanthology.org/2025.ijcnlp-long.187/", label: "FarSense" }],
    build: sceneBenchmarks, hold: 8000 },
  { id: "cross", tab: "Crosswords", sub: "Study material, generated", title: "Crosswords from course material",
    text: "My Ph.D. began with crossword clues: a clue has to be true, point to exactly one answer, and be worth solving. These are real rows from Clue-Instruct: a Wikipedia passage, the answer inside it, and the clues written for it.",
    links: [{ href: "https://aclanthology.org/2024.lrec-main.297/", label: "Clue-Instruct" }, { href: "crossword.html", label: "Play the crossword" }],
    build: sceneCrossword, hold: 11000 },
  { id: "measure", tab: "Measuring", sub: "Surprisal and difficulty", title: "How hard is a clue?",
    text: "How hard is a clue? Sixty people solved 160 Italian clues for us. The surprisal a model gives the answer tracked how hard they found it, so a generator can aim for an easy or a hard puzzle on purpose.",
    links: [{ href: "https://aclanthology.org/2025.clicit-1.50/", label: "CLiC-it 2025 paper" }, { href: "https://huggingface.co/datasets/Kamyar-zeinalipour/Crossword-Surprisal-IT", label: "The data" }],
    build: sceneMeasuring, hold: 6500 },
  { id: "protein", tab: "Proteins", sub: "Sequence to structure", title: "From a sentence to a fold",
    text: "To a language model, a protein is a sentence in a twenty-letter alphabet. The letters are ubiquitin's sequence; the ribbon is how it really folds, coloured by the same position along the chain. Hover the ribbon to find its letter.",
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
