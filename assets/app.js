import { PUZZLE, PAPERS, TOPICS, RELEASES, PATH } from "./data.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- theme ---------------- */
function initTheme() {
  const btn = $("#theme-toggle");
  const label = $("#theme-label");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => document.documentElement.dataset.theme
    || (systemDark.matches ? "dark" : "light");

  const paint = () => {
    const dark = current() === "dark";
    label.textContent = dark ? "Light" : "Dark";
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute("aria-label", dark ? "Switch to the light theme" : "Switch to the dark theme");
  };

  btn.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("kz-theme", next); } catch (e) { /* private mode: session only */ }
    paint();
  });
  systemDark.addEventListener("change", () => { if (!document.documentElement.dataset.theme) paint(); });
  paint();
}

/* ---------------- crossword ---------------- */
function buildPuzzle() {
  const board = $("#board");
  const cluesBox = $("#clues");
  board.style.setProperty("--cols", PUZZLE.cols);

  const letters = new Map();   // "r,c" -> letter
  const starts = new Map();    // "r,c" -> number
  for (const e of PUZZLE.entries) {
    for (let i = 0; i < e.word.length; i++) {
      const r = e.r + (e.dir === "D" ? i : 0);
      const c = e.c + (e.dir === "A" ? i : 0);
      letters.set(`${r},${c}`, e.word[i]);
    }
  }
  const ordered = [...PUZZLE.entries].sort((a, b) => a.r - b.r || a.c - b.c);
  let n = 0;
  for (const e of ordered) {
    const key = `${e.r},${e.c}`;
    if (!starts.has(key)) starts.set(key, ++n);
    e.num = starts.get(key);
  }

  const cells = new Map();
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const key = `${r},${c}`;
      const cell = el("div", { className: "cell" });
      if (letters.has(key)) {
        cell.classList.add("on");
        cell.dataset.ch = letters.get(key);
        if (starts.has(key)) cell.append(el("span", { className: "num", textContent: starts.get(key) }));
        cells.set(key, cell);
      }
      board.append(cell);
    }
  }

  // One orchestrated fill, as if the grid were being solved.
  const all = [...cells.values()];
  if (calm()) {
    all.forEach((c) => c.classList.add("filled"));
  } else {
    all.forEach((c, i) => setTimeout(() => c.classList.add("filled"), 220 + i * 26));
  }

  const cellsOf = (e) => {
    const out = [];
    for (let i = 0; i < e.word.length; i++) {
      const r = e.r + (e.dir === "D" ? i : 0);
      const c = e.c + (e.dir === "A" ? i : 0);
      out.push(cells.get(`${r},${c}`));
    }
    return out;
  };

  let open = null;
  const clear = () => {
    document.querySelectorAll(".cell.lit").forEach((c) => c.classList.remove("lit"));
    if (open) {
      open.btn.setAttribute("aria-expanded", "false");
      open.answer.hidden = true;
      open = null;
    }
  };

  for (const dir of ["A", "D"]) {
    const group = PUZZLE.entries.filter((e) => e.dir === dir).sort((a, b) => a.num - b.num);
    if (!group.length) continue;
    const list = el("ul", { className: "clue-list" });
    for (const e of group) {
      const id = `ans-${e.word.toLowerCase()}`;
      const btn = el("button", { type: "button", className: "clue-btn" });
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-controls", id);
      btn.append(el("b", { textContent: `${e.num}.` }), el("span", { textContent: e.clue }));

      const answer = el("div", { className: "clue-answer", id, hidden: true });
      answer.append(
        el("span", { textContent: `${e.word}. ` }),
        el("a", { href: e.href, textContent: e.hrefLabel })
      );

      btn.addEventListener("click", () => {
        const wasOpen = open && open.btn === btn;
        clear();
        if (wasOpen) return;
        cellsOf(e).forEach((c) => c && c.classList.add("lit"));
        btn.setAttribute("aria-expanded", "true");
        answer.hidden = false;
        open = { btn, answer };
      });

      list.append(el("li", {}, [btn, answer]));
    }
    cluesBox.append(el("h3", { textContent: dir === "A" ? "Across" : "Down" }), list);
  }

  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") clear(); });
}

/* ---------------- figure: papers per year ---------------- */
function buildChart() {
  const holder = $("#chart-holder");
  const counts = new Map();
  for (const p of PAPERS) counts.set(p.y, (counts.get(p.y) || 0) + 1);
  const years = [...counts.keys()].sort();
  const max = Math.max(...counts.values());

  const W = 640, H = 280, padL = 8, padR = 8, padT = 34, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const band = plotW / years.length;
  const barW = Math.min(76, band * 0.52);

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    "Bar chart of papers per year: " + years.map((y) => `${y}, ${counts.get(y)}`).join("; ") + ".");

  const make = (tag, attrs, text) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  };

  years.forEach((y, i) => {
    const v = counts.get(y);
    const h = Math.max(3, (v / max) * plotH);
    const x = padL + band * i + (band - barW) / 2;
    const yTop = padT + plotH - h;
    const r = Math.min(4, barW / 2, h);
    // Rounded top, square foot on the baseline.
    const d = `M${x} ${yTop + h} V${yTop + r} a${r} ${r} 0 0 1 ${r} ${-r}
               h${barW - 2 * r} a${r} ${r} 0 0 1 ${r} ${r} V${yTop + h} Z`;
    svg.append(make("path", { d, class: "bar" }));
    svg.append(make("text", { x: x + barW / 2, y: yTop - 9, class: "val", "text-anchor": "middle" }, v));
    svg.append(make("text", { x: x + barW / 2, y: H - 12, class: "tick", "text-anchor": "middle" }, y));
  });
  svg.append(make("line", {
    x1: padL, x2: W - padR, y1: padT + plotH + 0.5, y2: padT + plotH + 0.5,
    class: "axis", "stroke-width": 1,
  }));

  holder.replaceChildren(svg);
  holder.removeAttribute("style");
  holder.style.maxWidth = "40rem";

  if (calm()) { svg.classList.add("shown"); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { svg.classList.add("shown"); io.disconnect(); }
  }, { threshold: 0.3 });
  io.observe(svg);
}

/* ---------------- papers ---------------- */
function buildPapers() {
  const out = $("#papers-out");
  const fieldset = $("#filters");
  const keys = ["all", ...Object.keys(TOPICS)];
  const labels = { all: `All ${PAPERS.length}`, ...TOPICS };
  let active = "all";

  const render = () => {
    const list = active === "all" ? PAPERS : PAPERS.filter((p) => p.topics.includes(active));
    if (!list.length) {
      out.replaceChildren(el("p", { className: "empty-note",
        textContent: "No papers under that subject yet. Choose another filter." }));
      return;
    }
    const frag = document.createDocumentFragment();
    let year = null;
    const ul = el("ul", { className: "papers" });
    for (const p of list) {
      if (p.y !== year) {
        year = p.y;
        ul.append(el("li", { className: "year-head", textContent: String(year) }));
      }
      const li = el("li", { className: "paper" });
      const h = el("h3", {}, el("a", { href: p.link, textContent: p.t }));
      const side = el("div", { className: "side" });
      if (p.c > 0) side.append(el("span", {
        className: "cites", textContent: `${p.c} ${p.c === 1 ? "citation" : "citations"}`,
      }));
      if (p.code) side.append(el("a", { href: p.code, textContent: "Code" }));
      li.append(h, el("p", { className: "authors", textContent: p.a }),
        el("p", { className: "meta", textContent: p.v }), side);
      ul.append(li);
    }
    frag.append(ul);
    out.replaceChildren(frag);
  };

  for (const k of keys) {
    const b = el("button", { type: "button", className: "chip", textContent: labels[k] });
    b.setAttribute("aria-pressed", String(k === "all"));
    b.addEventListener("click", () => {
      active = k;
      fieldset.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      render();
    });
    fieldset.append(b);
  }
  render();
}

/* ---------------- releases ---------------- */
function buildReleases() {
  const table = el("table", { className: "rel-table" });
  table.append(el("caption", {
    textContent: `${RELEASES.length} papers with a public repository and a model collection.`,
  }));
  const head = el("thead");
  const hr = el("tr");
  for (const t of ["Release", "What is in it", "Links"]) hr.append(el("th", { scope: "col", textContent: t }));
  head.append(hr);
  const body = el("tbody");
  for (const r of RELEASES) {
    const tr = el("tr");
    tr.append(el("th", { scope: "row", textContent: r.name }));
    tr.append(el("td", { className: "what", textContent: r.what }));
    const links = el("td", { className: "links" });
    links.append(
      el("a", { href: r.repo, textContent: "Code" }),
      document.createTextNode(" "),
      el("a", { href: r.hf, textContent: "Models" })
    );
    tr.append(links);
    body.append(tr);
  }
  table.append(head, body);
  $("#releases-out").replaceChildren(table);
}

/* ---------------- path ---------------- */
function buildPath() {
  const ol = $("#path-out");
  for (const s of PATH) {
    const li = el("li");
    li.append(el("p", { className: "when", textContent: s.when }));
    const right = el("div");
    right.append(el("h3", {}, [
      document.createTextNode(s.what + ", "),
      el("span", { className: "where", textContent: s.where }),
    ]));
    right.append(el("p", { textContent: s.note }));
    li.append(right);
    ol.append(li);
  }
}

try {
  initTheme();
  buildPuzzle();
  buildChart();
  buildPapers();
  buildReleases();
  buildPath();
} catch (err) {
  console.error(err);
  const msg = () => {
    const p = el("p", { className: "empty-note" });
    p.append(
      document.createTextNode("This part of the page failed to load. The full list is on "),
      el("a", { href: "https://scholar.google.com/citations?user=RewxhZwAAAAJ", textContent: "Google Scholar" }),
      document.createTextNode(" and the code is on "),
      el("a", { href: "https://github.com/KamyarZeinalipour", textContent: "GitHub" }),
      document.createTextNode(".")
    );
    return p;
  };
  for (const id of ["#papers-out", "#releases-out"]) {
    const node = $(id);
    if (node && !node.querySelector("table, ul")) node.replaceChildren(msg());
  }
}
