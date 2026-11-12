/* Builds one static page per paper (papers/<slug>.html) from assets/data.js and
   assets/papers-meta.json, and adds them to sitemap.xml.
   Each page carries the Google Scholar citation_* tags and ScholarlyArticle JSON-LD.
   Run from the repository root:  node tools/build-papers.mjs
   To add a paper: add it to PAPERS in data.js, add its entry (keyed by title) to
   papers-meta.json, run this script, commit. */
import fs from "node:fs";
import path from "node:path";
import { PAPERS, TOPICS } from "../assets/data.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://kamyarzeinalipour.github.io";
const META = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/papers-meta.json"), "utf8"));
const ME = "Kamyar Zeinalipour";

// Same anchor rule as app.js, so old publications.html#anchors and these pages agree.
export const slug = (p) => (p.t.split(":")[0] + " " + p.y).toLowerCase()
  .normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
// page addresses drop a trailing hyphen left by the 60-character cut
const page_ = (p) => slug(p).replace(/-+$/, "");
const STAGE = fs.readFileSync(path.join(ROOT, "assets/stage.js"), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const niceDate = (d) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };

function pdfUrl(link) {
  if (!link) return null;
  if (/aclanthology\.org\/[^/]+\/?$/.test(link)) return link.replace(/\/$/, "") + ".pdf";
  const ax = link.match(/arxiv\.org\/abs\/([\w.]+)/);
  if (ax) return `https://arxiv.org/pdf/${ax[1]}`;
  if (/\.pdf$/i.test(link)) return link;
  return null;
}
const doiOf = (link) => (link && link.match(/doi\.org\/(10\.[^\s?#]+)/) || [])[1] || null;

// BibTeX from DOI content negotiation comes on one line; put one field per line.
function prettyBib(b) {
  if (b.includes("\n  ") || b.includes("\n    ")) return b;
  let out = "", depth = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === "{") depth++;
    if (c === "}") depth--;
    out += c;
    if (c === "," && depth === 1) { out += "\n "; while (b[i + 1] === " ") i++; }
  }
  return out.replace(/\}\s*$/, "\n}").trim();
}

const verb = { conference: "Presented on", workshop: "Presented on", "journal-online": "Published online on", "arxiv-v1": "Preprint posted on" };

function page(p, m, related) {
  const s = page_(p);
  const anchor = slug(p);
  const url = `${SITE}/papers/${s}.html`;
  const hasScene = !!p.link && STAGE.includes(`href: "${p.link}"`);
  const year = m.date.slice(0, 4);
  const journal = m.kind === "journal-online";
  const pdf = pdfUrl(p.link), doi = doiOf(p.link);
  const desc = `${p.t}. ${m.authors.join(", ")}. ${m.venue}, ${year}.`.slice(0, 300);
  const authorsHtml = m.authors.map((a) => (a === ME ? `<strong>${esc(a)}</strong>` : esc(a))).join(", ");
  const scholar = [
    `<meta name="citation_title" content="${esc(p.t)}">`,
    ...m.authors.map((a) => `<meta name="citation_author" content="${esc(a)}">`),
    `<meta name="citation_publication_date" content="${m.date.replace(/-/g, "/")}">`,
    journal ? `<meta name="citation_journal_title" content="${esc(m.venue.split(",")[0])}">`
      : m.kind === "arxiv-v1" ? `<meta name="citation_technical_report_institution" content="arXiv">`
        : `<meta name="citation_conference_title" content="${esc(m.venue)}">`,
    doi ? `<meta name="citation_doi" content="${esc(doi)}">` : "",
    pdf ? `<meta name="citation_pdf_url" content="${esc(pdf)}">` : "",
    `<meta name="citation_abstract_html_url" content="${url}">`,
  ].filter(Boolean).join("\n");
  const ld = {
    "@context": "https://schema.org", "@type": "ScholarlyArticle", headline: p.t, name: p.t,
    datePublished: m.date, url, description: m.summary, image: `${SITE}/images/papers/${s}.jpg`,
    author: m.authors.map((a) => (a === ME ? { "@type": "Person", "@id": `${SITE}/#person`, name: a, url: `${SITE}/` } : { "@type": "Person", name: a })),
    isPartOf: { "@type": journal ? "Periodical" : "PublicationEvent", name: m.venue },
    ...(p.link ? { sameAs: [p.link] } : {}),
    ...(doi ? { identifier: { "@type": "PropertyValue", propertyID: "DOI", value: doi } } : {}),
    about: p.topics.map((t) => TOPICS[t]),
  };
  const links = [
    p.link && `<a class="go-main" href="${esc(p.link)}">Read the paper</a>`,
    pdf && pdf !== p.link && `<a href="${esc(pdf)}">PDF</a>`,
    p.code && `<a href="${esc(p.code)}">Code</a>`,
    p.hf && `<a href="${esc(p.hf)}">Models and data</a>`,
  ].filter(Boolean).join("\n        ");
  const rel = related.map((r) => `<li><a href="${page_(r)}.html">${esc(r.t)}</a><span>${esc(r.v)}</span></li>`).join("\n          ");
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.t.split(":")[0])}, ${year}: Kamyar Zeinalipour</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="../favicon.ico" sizes="48x48">
<link rel="icon" href="../images/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<meta name="theme-color" content="#faf8f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141110" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.t)}">
<meta property="og:description" content="${esc(m.summary)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Kamyar Zeinalipour">
<meta property="og:image" content="${SITE}/images/papers/${s}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(p.t)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/images/papers/${s}.jpg">
${scholar}
<script type="application/ld+json">
${JSON.stringify(ld, null, 1).replace(/</g, "\\u003c")}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,600;1,300&family=Vazirmatn:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../assets/style.css">
<script>
  try {
    var t = localStorage.getItem("kz-theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else document.documentElement.removeAttribute("data-theme");
  } catch (e) { document.documentElement.removeAttribute("data-theme"); }
</script>
</head>
<body class="paper-page${hasScene ? " has-scene" : ""}">
<a class="skip" href="#main">Skip to content</a>

<header class="masthead">
  <div class="wrap masthead-in">
    <a class="wordmark" href="../index.html"><span class="kz" aria-hidden="true">KZ</span> Kamyar Zeinalipour</a>
    <a class="mast-link" href="https://github.com/KamyarZeinalipour">GitHub</a>
    <a class="mast-link" href="https://huggingface.co/Kamyar-zeinalipour">Hugging&nbsp;Face</a>
    <button class="theme-toggle" type="button" id="theme-toggle" aria-pressed="false">
      <span id="theme-label">Dark</span>
    </button>
  </div>
  <nav class="nav" aria-label="Pages">
    <div class="wrap nav-in"><a href="../index.html">Home</a>
      <a href="../research.html">Research</a>
      <a href="../projects.html">Projects</a>
      <a href="../publications.html" aria-current="page">Publications</a>
      <a href="../teaching.html">Teaching</a>
      <a href="../updates.html">Updates</a>
      <a href="../about.html">About</a></div>
  </nav>
</header>

<main id="main">
  <article>
    <section class="page-head paper-head">
      <div class="wrap paper-head-in">
        <div class="paper-head-text">
        <p class="crumbs"><a href="../publications.html">Publications</a> / <a href="../publications.html#${anchor}">${year}</a></p>
        <h1>${esc(p.t)}</h1>
        <p class="paper-authors">${authorsHtml}</p>
        <p class="paper-venue">${esc(m.venue)}<br><span>${verb[m.kind] || "Published on"} <time datetime="${m.date}">${niceDate(m.date)}</time>${p.c > 0 ? `, ${p.c} ${p.c === 1 ? "citation" : "citations"} on Google Scholar` : ""}</span></p>
        <p class="home-go paper-links">
        ${links}
        </p>
        </div>${hasScene ? `
        <figure class="paper-scene">
          <div id="paper-scene" data-href="${esc(p.link)}"></div>
          <figcaption>The idea of the paper in one short animation.</figcaption>
        </figure>` : ""}
      </div>
    </section>

    <section class="band">
      <div class="wrap paper-body">
        <h2>In short</h2>
        <p class="paper-summary">${esc(m.summary)}</p>
        <p class="paper-topics">${p.topics.map((t) => `<a class="chip" href="../research.html">${esc(TOPICS[t])}</a>`).join(" ")}</p>

        <h2 id="cite-h">Cite</h2>
        <pre class="bib" aria-labelledby="cite-h"><code id="bib">${esc(prettyBib(m.bib))}</code></pre>
        <p><button class="chip copy-bib" type="button" data-target="bib">Copy BibTeX</button></p>
${rel ? `
        <h2>Related papers</h2>
        <ul class="related">
          ${rel}
        </ul>` : ""}
        <p class="cite"><a href="../publications.html">All thirty-one papers</a></p>
      </div>
    </section>
  </article>
</main>

<footer class="site-foot">
  <div class="wrap foot-row">
    <p>Kamyar Zeinalipour, DIISM, University of Siena, Via Roma 56, 53100 Siena, Italy.</p>
    <p><a href="mailto:kamyar.zeinalipour2@unisi.it">kamyar.zeinalipour2@unisi.it</a>
       · <a href="https://github.com/KamyarZeinalipour/KamyarZeinalipour.github.io">Source</a></p>
  </div>
</footer>

<script type="module" src="../assets/app.js"></script>
</body>
</html>
`;
}

fs.rmSync(path.join(ROOT, "papers"), { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, "papers"), { recursive: true });
const made = [];
for (const p of PAPERS) {
  const m = META[p.t];
  if (!m) { console.error("no metadata for:", p.t); process.exitCode = 1; continue; }
  // related: other papers sharing a topic, newest first, at most four
  const related = PAPERS.filter((q) => q !== p && q.topics.some((t) => p.topics.includes(t))).slice(0, 4);
  fs.writeFileSync(path.join(ROOT, "papers", page_(p) + ".html"), page(p, m, related));
  made.push(page_(p));
}

// sitemap: keep the existing entries, replace the papers block
const smPath = path.join(ROOT, "sitemap.xml");
let sm = fs.readFileSync(smPath, "utf8").replace(/\s*<url><loc>[^<]*\/papers\/[^<]*<\/loc>[^]*?<\/url>/g, "");
const today = new Date().toISOString().slice(0, 10);
const block = made.map((s) => `  <url><loc>${SITE}/papers/${s}.html</loc><lastmod>${today}</lastmod></url>`).join("\n");
sm = sm.replace("</urlset>", block + "\n</urlset>");
fs.writeFileSync(smPath, sm);
console.log(`built ${made.length} paper pages`);
