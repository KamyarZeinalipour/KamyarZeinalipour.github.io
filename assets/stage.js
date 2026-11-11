/* The home page stage: one animated scene per research area.
   It plays a single tour through the scenes, then stops on the first one. Tabs
   jump to any scene, a button pauses or replays the tour, and under
   prefers-reduced-motion every scene is drawn in its finished state. */
import { PUZZLE, PROTEIN, SENSE, SURPRISAL } from "./data.js";
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

/* ---------------- scene: one instruction, eight languages ---------------- */
const LINES = [
  { code: "EN", lang: "en", text: "Explain in two sentences why the sky is blue." },
  { code: "IT", lang: "it", text: "Spiega in due frasi perché il cielo è blu." },
  { code: "DE", lang: "de", text: "Erkläre in zwei Sätzen, warum der Himmel blau ist." },
  { code: "ES", lang: "es", text: "Explica en dos frases por qué el cielo es azul." },
  { code: "FR", lang: "fr", text: "Explique en deux phrases pourquoi le ciel est bleu." },
];

const SKY = ["sky", "cielo", "Himmel", "ciel"];
const BLUE = ["blue", "blu", "blau", "azul", "bleu"];
const bare = (w) => w.replace(/[.,،]/g, "");

function sceneLanguages(mount, alive) {
  const svg = stageSvg("One instruction typed out in English, Italian, German, Spanish and French, then threads connect the words for sky and for blue across all five.");
  mount.append(svg);
  const threads = s("g", { class: "st-threads" });
  svg.append(threads);
  const rows = LINES.map((l, i) => {
    const y = 70 + i * 80;
    svg.append(s("text", { x: 14, y: y + 5, class: "st-code" }, l.code));
    svg.append(s("line", { x1: 50, x2: 630, y1: y + 22, y2: y + 22, class: "st-rule" }));
    const g = s("g", { class: "st-row" });
    svg.append(g);
    const chips = [];
    let cursor = l.rtl ? 626 : 56;
    for (const w of l.text.split(" ")) {
      const width = Math.max(20, w.length * 8.3 + 12);
      const x = l.rtl ? cursor - width : cursor;
      cursor = l.rtl ? x - 5 : x + width + 5;
      const c = s("g", { class: "st-tok" });
      c.append(s("rect", { x, y: y - 13, width, height: 26, rx: 5, class: "st-chip" }),
               s("text", { x: x + width / 2, y: y + 5, "text-anchor": "middle", class: "st-word", lang: l.lang }, w));
      g.append(c);
      chips.push({ el: c, cx: x + width / 2, cy: y, word: bare(w) });
    }
    return chips;
  });
  const thread = (list, cls) => {
    const pts = rows.map((chips) => chips.find((c) => list.includes(c.word))).filter(Boolean);
    pts.forEach((c) => c.el.classList.add(cls));
    let d = `M ${pts[0].cx} ${pts[0].cy}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], my = (p.cy + q.cy) / 2;
      d += ` C ${p.cx} ${my}, ${q.cx} ${my}, ${q.cx} ${q.cy}`;
    }
    const path = s("path", { d, class: `st-thread ${cls}` });
    threads.append(path);
    const len = path.getTotalLength ? path.getTotalLength() : 1200;
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    return { path, len, pts };
  };
  const tSky = thread(SKY, "sky"), tBlue = thread(BLUE, "blue");
  const typed = 4 * 70 + 10 * 140 + 260;
  run(alive, (ms) => {
    rows.forEach((chips, i) => chips.forEach((c, j) => {
      const t = clamp01((ms - i * 70 - j * 140) / 260);
      c.el.style.opacity = t;
      c.el.style.transform = `translateY(${(1 - ease(t)) * 6}px)`;
      c.el.classList.toggle("now", t > 0 && t < 1);
    }));
    const k1 = ease(clamp01((ms - typed) / 900)), k2 = ease(clamp01((ms - typed - 500) / 900));
    tSky.path.style.strokeDashoffset = tSky.len * (1 - k1);
    tBlue.path.style.strokeDashoffset = tBlue.len * (1 - k2);
    svg.classList.toggle("aligned", k2 > 0.3);
    return ms < typed + 1500;
  });
}

/* ---------------- scene: a crossword filling itself ---------------- */
function sceneCrossword(mount, alive) {
  const svg = stageSvg("A crossword about the research filling in one answer at a time, each with its clue.");
  mount.append(svg);
  const cell = 34, ox = 18, oy = 26;
  const letters = new Map();
  PUZZLE.entries.forEach((e) => {
    for (let i = 0; i < e.word.length; i++) {
      const r = e.r + (e.dir === "D" ? i : 0), c = e.c + (e.dir === "A" ? i : 0);
      letters.set(`${r},${c}`, e.word[i]);
    }
  });
  const cells = new Map();
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const key = `${r},${c}`;
      const on = letters.has(key);
      const x = ox + c * cell, y = oy + r * cell;
      svg.append(s("rect", { x, y, width: cell - 2, height: cell - 2, class: on ? "st-cell" : "st-block" }));
      if (on) {
        const t = s("text", { x: x + cell / 2 - 1, y: y + cell / 2 + 5, class: "st-letter", "text-anchor": "middle" }, letters.get(key));
        t.style.opacity = 0;
        svg.append(t);
        cells.set(key, t);
      }
    }
  }
  const clueBox = s("g", { class: "st-clue" });
  const gx = ox + PUZZLE.cols * cell + 18;
  clueBox.append(s("text", { x: gx, y: 52, class: "st-clue-num" }, ""));
  const lines = [0, 1, 2, 3, 4].map((i) => s("text", { x: gx, y: 84 + i * 20, class: "st-clue-text" }, ""));
  clueBox.append(...lines);
  const answer = s("text", { x: gx, y: 210, class: "st-clue-ans" }, "");
  clueBox.append(answer);
  svg.append(clueBox);
  const order = [...PUZZLE.entries].sort((a, b) => a.r - b.r || a.c - b.c);
  const wrap = (text, n) => {
    const out = []; let line = "";
    for (const w of text.split(" ")) {
      if ((line + " " + w).trim().length > n) { out.push(line.trim()); line = w; } else line += " " + w;
    }
    out.push(line.trim());
    return out.slice(0, 5);
  };
  const per = 900;
  run(alive, (ms) => {
    const k = Math.min(order.length - 1, Math.floor(ms / per));
    const e = order[k];
    const local = ms === Infinity ? 1 : (ms - k * per) / per;
    clueBox.firstChild.textContent = `${e.dir === "A" ? "Across" : "Down"}`;
    const shown = ms === Infinity ? e.clue : e.clue.slice(0, Math.floor(clamp01(local * 1.6) * e.clue.length));
    wrap(shown, 21).forEach((l, i) => { lines[i].textContent = l; });
    for (let i = wrap(shown, 21).length; i < 5; i++) lines[i].textContent = "";
    answer.textContent = local > 0.55 ? e.word : "";
    for (let j = 0; j <= k; j++) {
      const ej = order[j];
      for (let i = 0; i < ej.word.length; i++) {
        const r = ej.r + (ej.dir === "D" ? i : 0), c = ej.c + (ej.dir === "A" ? i : 0);
        const t = cells.get(`${r},${c}`);
        const reveal = j < k ? 1 : clamp01((local - 0.45 - i * 0.04) / 0.2);
        if (Number(t.style.opacity) < reveal) t.style.opacity = reveal;
        t.classList.toggle("live", j === k && ms !== Infinity);
      }
    }
    return ms < order.length * per;
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

/* ---------------- scene: graph to text and back ---------------- */
function sceneKG(mount, alive) {
  const svg = stageSvg("A knowledge graph with two facts is written out as a sentence, then parsed back into a graph, and both facts are recovered.");
  mount.append(svg);
  const graph = (x0, cls) => {
    const g = s("g", { class: cls });
    const nodes = [{ x: x0 + 80, y: 150, t: "Gas turbine" }, { x: x0 + 30, y: 300, t: "Compressor" }, { x: x0 + 132, y: 300, t: "NOx" }];
    [[0, 1, "has part"], [0, 2, "emits"]].forEach(([a, b, rel]) => {
      const A = nodes[a], B = nodes[b];
      g.append(s("line", { x1: A.x, y1: A.y + 15, x2: B.x, y2: B.y - 15, class: "st-edge" }));
      g.append(s("text", { x: (A.x + B.x) / 2 + (B.x > A.x ? 8 : -8), y: (A.y + B.y) / 2, class: "st-rel", "text-anchor": B.x > A.x ? "start" : "end" }, rel));
    });
    nodes.forEach((n) => {
      g.append(s("rect", { x: n.x - 48, y: n.y - 16, width: 96, height: 32, rx: 4, class: "st-node" }));
      g.append(s("text", { x: n.x, y: n.y + 5, class: "st-node-t", "text-anchor": "middle" }, n.t));
    });
    return g;
  };
  const left = graph(18, "st-g left");
  const sentence = s("g", { class: "st-sent" });
  sentence.append(s("rect", { x: 222, y: 188, width: 196, height: 88, rx: 6, class: "st-card" }));
  ["The gas turbine has", "a compressor and", "emits NOx."].forEach((t, i) =>
    sentence.append(s("text", { x: 238, y: 220 + i * 22, class: "st-sent-t" }, t)));
  const right = graph(436, "st-g right");
  const a1 = s("path", { d: "M 186 232 H 214 M 207 226 L 214 232 L 207 238", class: "st-flow" });
  const a2 = s("path", { d: "M 424 232 H 452 M 445 226 L 452 232 L 445 238", class: "st-flow" });
  const score = s("text", { x: 516, y: 380, class: "st-score", "text-anchor": "middle" }, "2 of 2 facts recovered");
  svg.append(left, a1, sentence, a2, right, score);
  const parts = [left, a1, sentence, a2, right, score];
  run(alive, (ms) => {
    parts.forEach((p, i) => {
      const t = clamp01((ms - i * 450) / 450);
      p.style.opacity = t;
      p.style.transform = `translateY(${(1 - ease(t)) * 8}px)`;
    });
    return ms < parts.length * 450 + 200;
  });
}

/* ---------------- scene: which sentence makes sense ---------------- */
const wrapWords = (text, n) => {
  const out = []; let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > n) { out.push(line.trim()); line = w; } else line += " " + w;
  }
  out.push(line.trim());
  return out;
};

function sceneBenchmarks(mount, alive) {
  const svg = stageSvg("Pairs of Arabic sentences from the ArabicSense test set: in each pair one sentence makes sense and the other is struck out.");
  mount.append(svg);
  svg.append(s("text", { x: 20, y: 34, class: "st-kicker" }, "Which sentence makes sense?"));
  const pairs = SENSE.slice(0, 3);
  const card = (y, ar, gloss) => {
    const g = s("g", { class: "st-sense" });
    const lines = wrapWords(ar, 62), gl = wrapWords(gloss, 74);
    const h = 30 + lines.length * 26 + gl.length * 17;
    g.append(s("rect", { x: 20, y, width: 600, height: h, rx: 6, class: "st-sense-box" }));
    lines.forEach((t, i) => g.append(s("text", { x: 604, y: y + 30 + i * 26, class: "st-ar", "text-anchor": "end", lang: "ar", direction: "rtl" }, t)));
    gl.forEach((t, i) => g.append(s("text", { x: 36, y: y + 34 + lines.length * 26 + i * 17, class: "st-gloss" }, t)));
    const strike = s("line", { x1: 36, x2: 604, y1: y + h / 2, y2: y + h / 2, class: "st-strike" });
    strike.style.opacity = 0;
    g.append(strike);
    const tag = s("text", { x: 604, y: y - 8, class: "st-tag", "text-anchor": "end" }, "");
    g.append(tag);
    svg.append(g);
    return { g, strike, tag, h };
  };
  const groups = pairs.map((p) => {
    const top = card(70, p.a, p.ga);
    const bottom = card(70 + top.h + 34, p.b, p.gb);
    return { p, cards: [top, bottom] };
  });
  const per = 2600;
  run(alive, (ms) => {
    const k = ms === Infinity ? 0 : Math.min(groups.length - 1, Math.floor(ms / per));
    const local = ms === Infinity ? 1 : (ms - k * per) / per;
    groups.forEach((grp, i) => {
      const on = i === k;
      grp.cards.forEach((c, j) => {
        const appear = on ? clamp01(local * 3 - j * 0.3) : 0;
        c.g.style.opacity = appear;
        const decided = on && local > 0.45;
        const sense = j === grp.p.ok;
        c.g.classList.toggle("is-sense", decided && sense);
        c.g.classList.toggle("is-nonsense", decided && !sense);
        c.strike.style.opacity = decided && !sense ? 1 : 0;
        c.tag.textContent = decided ? (sense ? "makes sense" : "cannot be true") : "";
      });
    });
    return ms < groups.length * per;
  });
}

/* ---------------- scene: surprisal and clue difficulty ---------------- */
function sceneMeasuring(mount, alive) {
  const svg = stageSvg("Bars showing the surprisal Llama-3-8B assigns to the answers of eight Italian crossword clues, from lowest to highest.");
  mount.append(svg);
  svg.append(s("text", { x: 20, y: 30, class: "st-kicker" }, "Surprisal of the answer, Llama-3-8B"));
  const rows = [...SURPRISAL].sort((a, b) => a.s - b.s);
  const max = Math.max(...rows.map((r) => r.s));
  const items = rows.map((r, i) => {
    const y = 66 + i * 52;
    svg.append(s("text", { x: 20, y, class: "st-clue-it", lang: "it" }, r.clue));
    svg.append(s("text", { x: 20, y: y + 17, class: "st-gloss" }, r.glossClue));
    const bar = s("rect", { x: 330, y: y - 13, height: 16, width: 0, rx: 3, class: "st-bar" });
    const val = s("text", { x: 336, y: y, class: "st-val" }, r.s.toFixed(1));
    const ans = s("text", { x: 330, y: y + 18, class: "st-ans", lang: "it" }, r.answer.toUpperCase());
    ans.style.opacity = 0;
    svg.append(bar, val, ans);
    return { r, bar, val, ans, w: (r.s / max) * 250 };
  });
  run(alive, (ms) => {
    items.forEach((it, i) => {
      const t = ease(clamp01((ms - i * 120) / 700));
      it.bar.setAttribute("width", (it.w * t).toFixed(1));
      it.val.setAttribute("x", (336 + it.w * t).toFixed(1));
      it.ans.style.opacity = clamp01((ms - 1800 - i * 120) / 300);
    });
    return ms < 1800 + items.length * 120 + 400;
  });
}

/* ---------------- scene: the work as a graph ---------------- */
function sceneGraph(mount) { buildGraph(mount); }

const SCENES = [
  { id: "work", tab: "The work", sub: "31 papers, connected", title: "Every paper, connected",
    text: "Thirty-one papers, four lines of work, nine languages. This map shows how they connect: pick a language or a line of work, and the papers behind it light up.",
    links: [{ href: "publications.html", label: "All publications" }], build: sceneGraph, hold: 8000 },
  { id: "langs", tab: "Languages", sub: "Villanova, five languages", title: "Open models for Europe's languages",
    text: "Most open models are strongest in English. At Villanova.AI we train them in Italy for Europe's own languages. I built the instruction data that teaches the base model to follow a request, in all five.",
    links: [{ href: "https://huggingface.co/collections/VillanovaAI/villanova2-6adf59f613d86d7ccbd654fa", label: "Villanova2" }, { href: "research.html#open", label: "The research" }],
    build: sceneLanguages, hold: 7000 },
  { id: "bench", tab: "Benchmarks", sub: "Commonsense in Arabic and Farsi", title: "Benchmarks for languages that have none",
    text: "Before a model can be trusted in Arabic or Farsi, someone has to test it there. I build those tests. In each pair one sentence is impossible, and a model that has really learned the language should never choose it.",
    links: [{ href: "https://huggingface.co/datasets/Kamyar-zeinalipour/ArabicSense", label: "ArabicSense" }, { href: "https://aclanthology.org/2025.ijcnlp-long.187/", label: "FarSense" }],
    build: sceneBenchmarks, hold: 8000 },
  { id: "cross", tab: "Crosswords", sub: "Study material, generated", title: "Crosswords from course material",
    text: "My Ph.D. began with a small, strict test of generation: a crossword clue has to be true, point to exactly one answer, and be worth solving. The same pipeline now writes clues in Italian, Arabic, Turkish and English.",
    links: [{ href: "crossword.html", label: "Play the crossword" }, { href: "research.html#edu", label: "The research" }],
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
  { id: "kg", tab: "Knowledge graphs", sub: "Graph, text, graph", title: "Graph to text, and back",
    text: "In industry, knowledge sits in documents. We turn it into a knowledge graph, write the graph back out as text, and count which facts survive the round trip.",
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
