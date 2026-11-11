/* Figures for the research page. Each one runs only if its mount point exists.
   Motion plays once when the figure scrolls into view, can be replayed by the
   reader, and is skipped entirely under prefers-reduced-motion. */
import { SENSE, SURPRISAL, PROTEIN, MULTI } from "./data.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const whenVisible = (node, fn) => {
  if (calm() || !("IntersectionObserver" in window)) { fn(); return; }
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { fn(); io.disconnect(); }
  }, { threshold: 0.35 });
  io.observe(node);
};

/* ---------- one instruction, five languages ---------- */
function figMulti() {
  const mount = $("#fig-multi");
  if (!mount) return;
  const tabs = el("div", { className: "seg" });
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Language");
  const out = el("p", { className: "typed" });
  out.setAttribute("aria-live", "polite");
  let timer = null;

  const show = (item, btn) => {
    tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    out.lang = item.code.toLowerCase();
    clearTimeout(timer);
    const words = item.text.split(" ");
    if (calm()) { out.textContent = item.text; return; }
    out.textContent = "";
    let i = 0;
    const tick = () => {
      out.textContent = words.slice(0, ++i).join(" ");
      if (i < words.length) timer = setTimeout(tick, 110);
    };
    tick();
  };

  MULTI.forEach((m, i) => {
    const b = el("button", { type: "button", textContent: m.code, title: m.lang });
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", m.lang);
    b.addEventListener("click", () => show(m, b));
    tabs.append(b);
    if (i === 0) b.dataset.first = "1";
  });
  mount.append(tabs, out);
  out.textContent = MULTI[0].text;
  tabs.querySelector("button").setAttribute("aria-pressed", "true");
  whenVisible(mount, () => show(MULTI[0], tabs.querySelector("button")));
}

/* ---------- ArabicSense: which one makes sense ---------- */
function figSense() {
  const mount = $("#fig-sense");
  if (!mount) return;
  let idx = 0, score = 0, answered = false;

  const head = el("p", { className: "fig-progress" });
  const pair = el("div", { className: "sense-pair" });
  const foot = el("div", { className: "sense-foot" });
  const note = el("p", { className: "fig-note" });
  note.setAttribute("aria-live", "polite");
  const next = el("button", { type: "button", className: "chip", textContent: "Next pair" });
  foot.append(note, next);
  mount.append(head, pair, foot);

  const render = () => {
    answered = false;
    const item = SENSE[idx];
    head.textContent = `Pair ${idx + 1} of ${SENSE.length}. Pick the sentence that makes sense.`;
    pair.replaceChildren();
    note.textContent = "";
    next.hidden = true;
    [item.a, item.b].forEach((text, i) => {
      const b = el("button", { type: "button", className: "sense-opt" });
      b.append(el("span", { className: "ar", lang: "ar", dir: "rtl", textContent: text }),
        el("span", { className: "gloss", textContent: i === 0 ? item.ga : item.gb, hidden: true }));
      b.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const right = i === item.ok;
        if (right) score++;
        pair.querySelectorAll(".sense-opt").forEach((o, j) => {
          o.classList.add(j === item.ok ? "is-sense" : "is-nonsense");
          o.querySelector(".gloss").hidden = false;
          o.setAttribute("aria-disabled", "true");
        });
        note.textContent = right ? "Right. Models have to make this call too." : "Not that one. The other sentence is the sensible one.";
        if (idx < SENSE.length - 1) { next.textContent = "Next pair"; }
        else { next.textContent = "Play again"; note.textContent += ` You got ${score} of ${SENSE.length}.`; }
        next.hidden = false;
        next.focus();
      });
      pair.append(b);
    });
  };

  next.addEventListener("click", () => {
    if (idx < SENSE.length - 1) idx++;
    else { idx = 0; score = 0; }
    render();
    pair.querySelector(".sense-opt").focus();
  });
  render();
}

/* ---------- surprisal vs clue difficulty ---------- */
function figSurprisal() {
  const mount = $("#fig-surprisal");
  if (!mount) return;
  const max = Math.max(...SURPRISAL.map((r) => r.s));
  const toggle = el("button", { type: "button", className: "chip", textContent: "Show the answers" });
  toggle.setAttribute("aria-pressed", "false");
  const list = el("ol", { className: "surp" });
  for (const r of [...SURPRISAL].sort((a, b) => a.s - b.s)) {
    const li = el("li");
    li.style.setProperty("--i", list.children.length);
    const label = el("div", { className: "surp-label" });
    label.append(
      el("span", { className: "clue-it", lang: "it", textContent: r.clue }),
      el("span", { className: "clue-gloss", textContent: r.glossClue }),
      el("span", { className: "surp-ans", hidden: true }, [
        el("b", { lang: "it", textContent: r.answer }),
        document.createTextNode(`, ${r.glossAnswer}`),
      ])
    );
    const track = el("div", { className: "surp-track" });
    const bar = el("span", { className: "surp-bar" });
    bar.style.setProperty("--w", `${(r.s / max) * 100}%`);
    track.append(bar, el("span", { className: "surp-val", textContent: r.s.toFixed(1) }));
    li.append(label, track);
    list.append(li);
  }
  toggle.addEventListener("click", () => {
    const on = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(on));
    toggle.textContent = on ? "Hide the answers" : "Show the answers";
    list.querySelectorAll(".surp-ans").forEach((a) => { a.hidden = !on; });
  });
  mount.append(list, toggle);
  whenVisible(mount, () => list.classList.add("grown"));
}

/* ---------- a protein as a sentence ---------- */
const AA = {
  A: "Alanine", C: "Cysteine", D: "Aspartate", E: "Glutamate", F: "Phenylalanine", G: "Glycine",
  H: "Histidine", I: "Isoleucine", K: "Lysine", L: "Leucine", M: "Methionine", N: "Asparagine",
  P: "Proline", Q: "Glutamine", R: "Arginine", S: "Serine", T: "Threonine", V: "Valine",
  W: "Tryptophan", Y: "Tyrosine",
};
function figProtein() {
  const mount = $("#fig-protein");
  if (!mount) return;
  const row = el("div", { className: "aa-row" });
  const readout = el("p", { className: "fig-note" });
  readout.setAttribute("aria-live", "polite");
  readout.textContent = `${PROTEIN.name}, ${PROTEIN.seq.length} residues. Hover or focus a letter to name it.`;
  const cells = [...PROTEIN.seq].map((ch, i) => {
    const b = el("button", { type: "button", className: "aa", textContent: ch });
    b.setAttribute("aria-label", `Position ${i + 1}, ${AA[ch]}`);
    const say = () => { readout.textContent = `Position ${i + 1}: ${ch}, ${AA[ch]}.`; };
    b.addEventListener("mouseenter", say);
    b.addEventListener("focus", say);
    row.append(b);
    return b;
  });
  const replay = el("button", { type: "button", className: "chip", textContent: "Read it again" });
  const play = () => {
    if (calm()) { cells.forEach((c) => c.classList.add("in")); return; }
    cells.forEach((c) => c.classList.remove("in"));
    cells.forEach((c, i) => setTimeout(() => c.classList.add("in"), 60 + i * 55));
  };
  replay.addEventListener("click", play);
  mount.append(row, readout, replay);
  whenVisible(mount, play);
}

/* ---------- graph, to text, and back ---------- */
function figKG() {
  const mount = $("#fig-kg");
  if (!mount) return;
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = make("svg", { viewBox: "0 0 640 250", class: "kg", role: "img",
    "aria-label": "A small knowledge graph with two facts is written out as a sentence, then parsed back into a graph, and both facts are recovered." });

  const graph = (x0, cls) => {
    const g = make("g", { class: cls });
    // Node centres. Boxes are 92 wide, so the outer edges sit at x0 + 4 and x0 + 204.
    const nodes = [
      { x: x0 + 104, y: 50, t: "Gas turbine" },
      { x: x0 + 50, y: 175, t: "Compressor" },
      { x: x0 + 158, y: 175, t: "NOx" },
    ];
    const edge = (a, b, label) => {
      g.append(make("line", { x1: a.x, y1: a.y + 15, x2: b.x, y2: b.y - 15, class: "kg-edge" }));
      g.append(make("text", { x: (a.x + b.x) / 2 + (b.x > a.x ? 9 : -9), y: (a.y + b.y) / 2 + 4,
        class: "kg-rel", "text-anchor": b.x > a.x ? "start" : "end" }, label));
    };
    edge(nodes[0], nodes[1], "has part");
    edge(nodes[0], nodes[2], "emits");
    for (const n of nodes) {
      g.append(make("rect", { x: n.x - 46, y: n.y - 15, width: 92, height: 30, rx: 3, class: "kg-node" }));
      g.append(make("text", { x: n.x, y: n.y + 5, class: "kg-label", "text-anchor": "middle" }, n.t));
    }
    return g;
  };
  // A short horizontal arrow with a head, from x1 to x2 at height y.
  const arrow = (x1, x2, y, cls) =>
    make("path", { d: `M ${x1} ${y} H ${x2} M ${x2 - 7} ${y - 5} L ${x2} ${y} L ${x2 - 7} ${y + 5}`, class: `kg-arrow ${cls}` });

  svg.append(graph(0, "kg-left"));
  svg.append(arrow(214, 244, 118, "a1"));
  const textG = make("g", { class: "kg-text" });
  textG.append(make("rect", { x: 250, y: 80, width: 140, height: 76, rx: 3, class: "kg-card" }));
  ["The gas turbine", "has a compressor", "and emits NOx."].forEach((line, i) =>
    textG.append(make("text", { x: 262, y: 106 + i * 18, class: "kg-sent" }, line)));
  svg.append(textG);
  svg.append(arrow(396, 426, 118, "a2"));
  svg.append(graph(432, "kg-right"));
  svg.append(make("text", { x: 536, y: 236, class: "kg-score", "text-anchor": "middle" }, "2 of 2 facts recovered"));

  const replay = el("button", { type: "button", className: "chip", textContent: "Run the round trip" });
  const play = () => {
    svg.classList.remove("run");
    if (calm()) { svg.classList.add("done"); return; }
    void svg.getBoundingClientRect();
    svg.classList.add("run");
  };
  replay.addEventListener("click", play);
  mount.append(svg, replay);
  whenVisible(mount, play);
}

export function buildFigures() {
  figMulti();
  figSense();
  figSurprisal();
  figProtein();
  figKG();
}
