import { PUZZLE, PAPERS, TOPICS, RELEASES, PATH, BUILT, TEACHING, UPDATES, SERVICE, TALKS, CERTS } from "./data.js";
import { buildFigures } from "./figures.js";
import { buildGraph } from "./graph.js";

/* A stable anchor for each paper: the part of the title before the colon, plus the year. */
const slug = (p) => (p.t.split(":")[0] + " " + p.y).toLowerCase()
  .normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const paperByRef = (ref) => PAPERS.find((p) => p.t.startsWith(ref));

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const linkList = (links) => {
  const p = el("p", { className: "cite links" });
  links.forEach((l, i) => {
    if (i) p.append(document.createTextNode(" "));
    p.append(el("a", { href: l.href, textContent: l.label }));
  });
  return p;
};

/* ---------------- theme ---------------- */
function initTheme() {
  const btn = $("#theme-toggle");
  if (!btn) return;
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

/* ---------------- crossword: playable ---------------- */
function buildPuzzle() {
  const board = $("#board");
  const cluesBox = $("#clues");
  if (!board || !cluesBox) return;
  const status = $("#puzzle-status");
  board.style.setProperty("--cols", PUZZLE.cols);
  const KEY = "kz-crossword";

  const letters = new Map();
  const starts = new Map();
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

  const inputs = new Map();
  for (let r = 0; r < PUZZLE.rows; r++) {
    for (let c = 0; c < PUZZLE.cols; c++) {
      const key = `${r},${c}`;
      const cell = el("div", { className: "cell" });
      if (letters.has(key)) {
        cell.classList.add("on");
        const nums = starts.has(key) ? starts.get(key) : null;
        if (nums) cell.append(el("span", { className: "num", textContent: nums }));
        const input = el("input", { type: "text", className: "letter", maxLength: 1, autocomplete: "off",
          inputMode: "text", spellcheck: false });
        input.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}${nums ? `, clue ${nums}` : ""}`);
        input.dataset.r = r;
        input.dataset.c = c;
        cell.append(input);
        inputs.set(key, input);
      }
      board.append(cell);
    }
  }

  const cellsOf = (e) => {
    const out = [];
    for (let i = 0; i < e.word.length; i++) {
      const r = e.r + (e.dir === "D" ? i : 0);
      const c = e.c + (e.dir === "A" ? i : 0);
      out.push(inputs.get(`${r},${c}`));
    }
    return out;
  };

  const save = () => {
    const state = {};
    for (const [k, i] of inputs) if (i.value) state[k] = i.value;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) { /* private mode */ }
  };
  const restore = () => {
    try {
      const state = JSON.parse(localStorage.getItem(KEY) || "{}");
      for (const [k, v] of Object.entries(state)) {
        const i = inputs.get(k);
        if (i) i.value = v;
      }
    } catch (err) { /* nothing saved, or unreadable */ }
  };

  let current = null;
  const answers = new Map(PUZZLE.entries.map((e) => [e.word, e]));

  const highlight = (entry) => {
    board.querySelectorAll(".cell.lit").forEach((c) => c.classList.remove("lit"));
    cluesBox.querySelectorAll(".clue-btn[aria-current]").forEach((b) => b.removeAttribute("aria-current"));
    current = entry || null;
    if (!entry) return;
    cellsOf(entry).forEach((i) => i && i.parentElement.classList.add("lit"));
    const btn = cluesBox.querySelector(`[data-word="${entry.word}"] .clue-btn`);
    if (btn) btn.setAttribute("aria-current", "true");
  };

  const entriesAt = (r, c) => PUZZLE.entries.filter((e) => {
    if (e.dir === "A") return e.r === r && c >= e.c && c < e.c + e.word.length;
    return e.c === c && r >= e.r && r < e.r + e.word.length;
  });

  const solvedCheck = (entry) => {
    const got = cellsOf(entry).map((i) => (i.value || "").toUpperCase()).join("");
    const li = cluesBox.querySelector(`[data-word="${entry.word}"]`);
    if (!li) return false;
    const done = got === entry.word;
    li.classList.toggle("solved", done);
    li.querySelector(".clue-answer").hidden = !done;
    return done;
  };

  const announce = (msg) => { if (status) status.textContent = msg; };

  const moveTo = (r, c) => {
    const i = inputs.get(`${r},${c}`);
    if (i) { i.focus(); i.select(); }
    return !!i;
  };

  const step = (input, back) => {
    if (!current) return;
    const cells = cellsOf(current);
    const idx = cells.indexOf(input);
    const next = cells[idx + (back ? -1 : 1)];
    if (next) { next.focus(); next.select(); }
  };

  for (const [key, input] of inputs) {
    const [r, c] = key.split(",").map(Number);
    input.addEventListener("focus", () => {
      const here = entriesAt(r, c);
      if (!here.length) return;
      if (!current || !here.includes(current)) highlight(here[0]);
    });
    input.addEventListener("input", () => {
      const v = (input.value || "").replace(/[^\p{L}]/gu, "").toUpperCase().slice(-1);
      input.value = v;
      input.classList.remove("wrong");
      save();
      if (v) {
        for (const e of entriesAt(r, c)) if (solvedCheck(e)) announce(`${e.word} solved.`);
        step(input, false);
      }
    });
    input.addEventListener("keydown", (ev) => {
      const k = ev.key;
      if (k === "Backspace" && !input.value) { ev.preventDefault(); step(input, true); return; }
      if (k === "ArrowRight") { ev.preventDefault(); moveTo(r, c + 1) || moveTo(r, c + 2); }
      else if (k === "ArrowLeft") { ev.preventDefault(); moveTo(r, c - 1) || moveTo(r, c - 2); }
      else if (k === "ArrowDown") { ev.preventDefault(); moveTo(r + 1, c) || moveTo(r + 2, c); }
      else if (k === "ArrowUp") { ev.preventDefault(); moveTo(r - 1, c) || moveTo(r - 2, c); }
      else if (k === " ") {
        ev.preventDefault();
        const here = entriesAt(r, c);
        if (here.length > 1) highlight(here[(here.indexOf(current) + 1) % here.length]);
      } else if (k === "Escape") highlight(null);
    });
  }

  for (const dir of ["A", "D"]) {
    const group = PUZZLE.entries.filter((e) => e.dir === dir).sort((a, b) => a.num - b.num);
    if (!group.length) continue;
    const list = el("ul", { className: "clue-list" });
    for (const e of group) {
      const li = el("li");
      li.dataset.word = e.word;
      const btn = el("button", { type: "button", className: "clue-btn" });
      btn.append(el("b", { textContent: `${e.num}.` }), el("span", { textContent: e.clue }));
      btn.addEventListener("click", () => {
        highlight(e);
        const cells = cellsOf(e);
        const target = cells.find((i) => !i.value) || cells[0];
        target.focus();
        target.select();
      });
      const answer = el("div", { className: "clue-answer", hidden: true });
      answer.append(el("span", { textContent: `${e.word}. ` }), el("a", { href: e.href, textContent: e.hrefLabel }));
      li.append(btn, answer);
      list.append(li);
    }
    cluesBox.append(el("h2", { className: "clue-dir", textContent: dir === "A" ? "Across" : "Down" }), list);
  }

  const check = () => {
    let wrong = 0, blank = 0, right = 0;
    for (const [key, input] of inputs) {
      const want = letters.get(key);
      const got = (input.value || "").toUpperCase();
      input.classList.remove("wrong");
      if (!got) blank++;
      else if (got !== want) { input.classList.add("wrong"); wrong++; }
      else right++;
    }
    PUZZLE.entries.forEach(solvedCheck);
    if (!blank && !wrong) announce("All of it is right. Every clue now links to its paper or repository.");
    else if (wrong) announce(`${right} letters right, ${wrong} wrong, marked in the grid.`);
    else announce(`${right} letters right, ${blank} still empty.`);
  };

  $("#btn-check").addEventListener("click", check);
  $("#btn-reveal").addEventListener("click", () => {
    for (const [key, input] of inputs) { input.value = letters.get(key); input.classList.remove("wrong"); }
    PUZZLE.entries.forEach(solvedCheck);
    save();
    announce("Revealed. Each clue below links to the paper or repository it points at.");
  });
  $("#btn-clear").addEventListener("click", () => {
    for (const input of inputs.values()) { input.value = ""; input.classList.remove("wrong"); }
    PUZZLE.entries.forEach(solvedCheck);
    highlight(null);
    save();
    announce("Cleared. Pick a clue, then type.");
  });

  restore();
  PUZZLE.entries.forEach(solvedCheck);
}

/* ---------------- figure: papers per year ---------------- */
function buildChart() {
  const holder = $("#chart-holder");
  if (!holder) return;
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
  if (!out) return;
  const fieldset = $("#filters");
  const limit = Number(out.dataset.limit || 0);
  const source = limit ? PAPERS.slice(0, limit) : PAPERS;

  const draw = (list) => {
    if (!list.length) {
      out.replaceChildren(el("p", { className: "empty-note",
        textContent: "No papers under that subject yet. Choose another filter." }));
      return;
    }
    let year = null;
    const ul = el("ul", { className: "papers" });
    for (const p of list) {
      if (p.y !== year && !limit) {
        year = p.y;
        ul.append(el("li", { className: "year-head", textContent: String(year) }));
      }
      const li = el("li", { className: "paper", id: slug(p) });
      const h = el("h3", {}, el("a", { href: p.link, textContent: p.t }));
      const side = el("div", { className: "side" });
      if (p.c > 0) side.append(el("span", {
        className: "cites", textContent: `${p.c} ${p.c === 1 ? "citation" : "citations"}`,
      }));
      if (p.code) side.append(el("a", { href: p.code, textContent: "Code" }));
      if (p.hf) side.append(el("a", { href: p.hf, textContent: "Models" }));
      li.append(h, el("p", { className: "authors", textContent: p.a }),
        el("p", { className: "meta", textContent: limit ? `${p.v}, ${p.y}` : p.v }), side);
      ul.append(li);
    }
    out.replaceChildren(ul);
  };

  if (fieldset) {
    let active = "all";
    const labels = { all: `All ${PAPERS.length}`, ...TOPICS };
    for (const k of ["all", ...Object.keys(TOPICS)]) {
      const b = el("button", { type: "button", className: "chip", textContent: labels[k] });
      b.setAttribute("aria-pressed", String(k === "all"));
      b.addEventListener("click", () => {
        active = k;
        fieldset.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
        draw(active === "all" ? PAPERS : PAPERS.filter((p) => p.topics.includes(active)));
      });
      fieldset.append(b);
    }
  }
  draw(source);
}

/* ---------------- releases ---------------- */
function buildReleases() {
  const mount = $("#releases-out");
  if (!mount) return;
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
    links.append(el("a", { href: r.repo, textContent: "Code" }), el("a", { href: r.hf, textContent: "Models" }));
    tr.append(links);
    body.append(tr);
  }
  table.append(head, body);
  mount.replaceChildren(table);
}

/* ---------------- built things ---------------- */
function buildBuilt() {
  const mount = $("#built-out");
  if (!mount) return;
  const limit = Number(mount.dataset.limit || 0);
  const list = limit ? BUILT.slice(0, limit) : BUILT;
  const frag = document.createDocumentFragment();
  for (const b of list) {
    const art = el("article", { className: "built" });
    art.append(el("p", { className: "kind", textContent: b.kind }));
    art.append(el("h3", { textContent: b.name }));
    art.append(el("p", { textContent: b.body }));
    art.append(linkList(b.links));
    frag.append(art);
  }
  mount.replaceChildren(frag);
}

/* ---------------- updates ---------------- */
/* News comes from UPDATES plus any paper or project that carries its own `news`
   field, so adding one entry to data.js updates every page that shows it. */
function allUpdates() {
  const items = [...UPDATES];
  for (const p of PAPERS) if (p.news) items.push({ ...p.news, ref: p.t });
  for (const b of BUILT) if (b.news) items.push({ ...b.news, page: "index.html", pageLabel: b.name });
  return items.sort((a, b) => String(b.when).localeCompare(String(a.when)));
}

function buildUpdates() {
  const mount = $("#updates-out");
  if (!mount) return;
  const limit = Number(mount.dataset.limit || 0);
  const all = allUpdates();
  const list = limit ? all.slice(0, limit) : all;
  if (!list.length) {
    mount.replaceChildren(el("p", { className: "empty-note", textContent: "No updates yet." }));
    return;
  }
  const ol = el("ol", { className: "updates" });
  for (const u of list) {
    const li = el("li");
    li.append(el("p", { className: "when", textContent: u.date }));
    const body = el("div");
    body.append(el("p", { textContent: u.text }));
    const links = [];
    const paper = u.ref && paperByRef(u.ref);
    if (paper) links.push({ href: `publications.html#${slug(paper)}`, label: "In the publications" });
    if (u.page) links.push({ href: u.page, label: u.pageLabel || "More" });
    if (u.href) links.push({ href: u.href, label: u.hrefLabel });
    if (links.length) body.append(linkList(links));
    li.append(body);
    ol.append(li);
  }
  mount.replaceChildren(ol);
}

/* ---------------- teaching ---------------- */
function buildTeaching() {
  const mount = $("#teaching-out");
  if (!mount) return;
  const ol = el("ol", { className: "path" });
  for (const t of TEACHING) {
    const li = el("li");
    li.append(el("p", { className: "when", textContent: t.when }));
    const right = el("div");
    right.append(el("h3", {}, [
      document.createTextNode(t.role + ", "),
      el("span", { className: "where", textContent: t.where }),
    ]));
    right.append(el("p", { textContent: t.body }));
    li.append(right);
    ol.append(li);
  }
  mount.replaceChildren(ol);
}

/* ---------------- service, talks, certificates ---------------- */
function buildRows(mountId, items, toRow) {
  const mount = $(mountId);
  if (!mount) return;
  const ol = el("ol", { className: "path" });
  for (const it of items) {
    const { when, title, where, note, links } = toRow(it);
    const li = el("li");
    li.append(el("p", { className: "when", textContent: when }));
    const right = el("div");
    right.append(el("h3", {}, [document.createTextNode(title + ", "), el("span", { className: "where", textContent: where })]));
    if (note) right.append(el("p", { textContent: note }));
    if (links && links.length) right.append(linkList(links));
    li.append(right);
    ol.append(li);
  }
  mount.replaceChildren(ol);
}

function buildService() {
  buildRows("#service-out", SERVICE, (x) => ({ when: x.when, title: x.role, where: x.where, note: x.note,
    links: x.href ? [{ href: x.href, label: "Page" }] : [] }));
}
function buildTalks() {
  buildRows("#talks-out", TALKS, (x) => ({ when: x.when, title: x.what, where: x.where,
    links: x.href ? [{ href: x.href, label: x.hrefLabel || "More" }] : [] }));
}
function buildCerts() {
  buildRows("#certs-out", CERTS, (x) => ({ when: x.year, title: x.name, where: x.by, note: x.parts ? `Courses: ${x.parts}.` : "" }));
}

/* ---------------- path ---------------- */
function buildPath() {
  const ol = $("#path-out");
  if (!ol) return;
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
  buildBuilt();
  buildUpdates();
  buildTeaching();
  buildPath();
  buildService();
  buildTalks();
  buildCerts();
  buildFigures();
  buildGraph();
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
  for (const id of ["#papers-out", "#releases-out", "#built-out", "#updates-out", "#teaching-out", "#service-out", "#talks-out", "#certs-out"]) {
    const node = $(id);
    if (node && !node.querySelector("table, ul, ol, article")) node.replaceChildren(msg());
  }
}
