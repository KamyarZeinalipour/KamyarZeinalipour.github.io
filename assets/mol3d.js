/* Real 3D structures for the stage: ubiquitin (PDB 1UBQ) and Abl kinase with
   imatinib bound (PDB 1IEP). The viewer library (3Dmol.js) is loaded only when
   one of these scenes opens. Colour runs from teal to amber along the chain, the
   same encoding used for the sequence letters, so a letter and its place on the
   ribbon share a colour. */
const LIB = "https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.4.0/3Dmol-min.js";
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};

let libPromise = null;
function loadLib() {
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const sc = el("script", { src: LIB, async: true, crossOrigin: "anonymous" });
      sc.onload = () => (window.$3Dmol ? resolve(window.$3Dmol) : reject(new Error("viewer missing")));
      sc.onerror = () => { libPromise = null; reject(new Error("viewer failed to load")); };
      document.head.append(sc);
    });
  }
  return libPromise;
}
const hasWebGL = () => {
  try { return !!document.createElement("canvas").getContext("webgl"); } catch (e) { return false; }
};

/* teal, sea green, amber */
const STOPS = [[18, 96, 106], [89, 165, 143], [224, 160, 60]];
function gradient(t) {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/* The viewer paints the box's own background colour (opaque, so it renders the
   same everywhere) and follows the light and dark themes. */
function boxColor(box) {
  const m = getComputedStyle(box).backgroundColor.match(/\d+/g) || [255, 255, 255];
  return "#" + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
}

/* Shared frame: a viewer box with loading and error states, and cleanup when
   the scene leaves the page. */
function frame(mount, alive, label) {
  const box = el("div", { className: "m3-box" });
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", label);
  const status = el("p", { className: "m3-status", textContent: "Loading the structure." });
  box.append(status);
  mount.append(box);
  let viewer = null, spinTimer = null;
  const repaint = () => { if (viewer) { viewer.setBackgroundColor(boxColor(box)); viewer.render(); } };
  const themeWatch = new MutationObserver(() => requestAnimationFrame(repaint));
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", repaint);
  const watch = setInterval(() => {
    if (alive()) return;
    clearInterval(watch);
    themeWatch.disconnect();
    scheme.removeEventListener("change", repaint);
    clearTimeout(spinTimer);
    if (viewer) { try { viewer.spin(false); viewer.clear(); } catch (e) { /* already gone */ } }
  }, 400);
  return {
    box, status,
    setViewer(v) { viewer = v; },
    spinFor(ms) {
      if (calm() || !viewer) return;
      viewer.spin("y", 0.35);
      spinTimer = setTimeout(() => { try { viewer.spin(false); } catch (e) { /* gone */ } }, ms);
    },
    fail(msg) { status.textContent = msg; status.classList.add("err"); },
  };
}

/* ---------------- ubiquitin: sequence, then the fold ---------------- */
export function sceneProtein3D(mount, alive, fallback) {
  if (!hasWebGL()) { fallback(mount, alive); return; }
  const SEQ = "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG";
  const strip = el("p", { className: "m3-seq" });
  strip.setAttribute("aria-label", `Ubiquitin sequence, ${SEQ.length} amino acids`);
  const letters = [...SEQ].map((ch, i) => {
    const sp = el("span", { textContent: ch });
    sp.style.color = gradient(i / (SEQ.length - 1));
    strip.append(sp);
    return sp;
  });
  mount.append(strip);
  const f = frame(mount, alive, "The folded 3D structure of ubiquitin, PDB 1UBQ, shown as a ribbon coloured from teal at the start of the chain to amber at the end.");

  const typing = calm() ? 0 : SEQ.length * 28;
  letters.forEach((sp, i) => {
    if (calm()) { sp.classList.add("in"); return; }
    setTimeout(() => { if (alive()) sp.classList.add("in"); }, i * 28);
  });

  Promise.all([loadLib(), fetch("assets/pdb/1ubq.pdb").then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })])
    .then(([$3Dmol, pdb]) => {
      if (!alive()) return;
      setTimeout(() => {
        if (!alive()) return;
        f.status.remove();
        const v = $3Dmol.createViewer(f.box, { backgroundColor: boxColor(f.box), antialias: true });
        f.setViewer(v);
        v.addModel(pdb, "pdb");
        const n = SEQ.length;
        v.setStyle({}, { cartoon: { colorfunc: (a) => gradient((a.resi - 1) / (n - 1)), thickness: 0.6, arrows: true } });
        v.setHoverable({}, true,
          (a) => { const sp = letters[a.resi - 1]; if (sp) sp.classList.add("hot"); },
          (a) => { const sp = letters[a.resi - 1]; if (sp) sp.classList.remove("hot"); });
        v.zoomTo();
        v.zoom(1.45);
        v.render();
        f.box.classList.add("ready");
        f.spinFor(22000);
      }, typing);
    })
    .catch(() => f.fail("The 3D structure could not be loaded. The sequence above is ubiquitin, PDB 1UBQ."));
}

/* ---------------- Abl kinase with imatinib ---------------- */
export function sceneDrug3D(mount, alive, fallback) {
  if (!hasWebGL()) { fallback(mount, alive); return; }
  const f = frame(mount, alive, "Abl kinase shown as a ribbon, with the drug imatinib bound in its pocket in amber, from crystal structure PDB 1IEP.");
  const legend = el("p", { className: "m3-legend" }, [
    el("span", { className: "key prot", textContent: "Abl kinase" }),
    el("span", { className: "key drug", textContent: "imatinib" }),
    el("span", { className: "key pocket", textContent: "residues touching the drug" }),
  ]);
  mount.append(legend);

  Promise.all([loadLib(), fetch("assets/pdb/1iep.pdb").then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })])
    .then(([$3Dmol, pdb]) => {
      if (!alive()) return;
      f.status.remove();
      const v = $3Dmol.createViewer(f.box, { backgroundColor: boxColor(f.box), antialias: true });
      f.setViewer(v);
      v.addModel(pdb, "pdb");
      const first = 225, last = 498;
      v.setStyle({ hetflag: false }, { cartoon: { colorfunc: (a) => gradient((a.resi - first) / (last - first)), opacity: 0.78, thickness: 0.45 } });
      v.setStyle({ resn: "STI" }, { stick: { color: "#e0a03c", radius: 0.32 }, sphere: { color: "#f0b454", scale: 0.3 } });
      v.addStyle({ byres: true, hetflag: false, within: { distance: 4.2, sel: { resn: "STI" } } },
        { stick: { color: "#7d8f91", radius: 0.12 } });
      // Frame the whole protein, centred on the drug, then move in a little.
      v.zoomTo();
      v.center({ resn: "STI" });
      v.zoom(1.25);
      v.render();
      f.box.classList.add("ready");
      if (calm()) return;
      setTimeout(() => {
        if (!alive()) return;
        v.zoom(1.35, 1400);
        setTimeout(() => { if (alive()) f.spinFor(16000); }, 1500);
      }, 900);
    })
    .catch(() => f.fail("The 3D structure could not be loaded. It is Abl kinase with imatinib, PDB 1IEP."));
}
