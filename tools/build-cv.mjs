/* Builds cv.html (the choice), resume.html (one page, for industry) and
   cv-full.html (the academic CV) from assets/data.js, using teaching.html as the
   page shell so the header, menu and footer stay the same as everywhere else.
   Run from the repository root:  node tools/build-cv.mjs
   The deploy workflow runs it on every push, then .github/scripts/cv-pdf.mjs
   prints both to PDF. */
import fs from "node:fs";
import path from "node:path";
import { PROFILE, CV, PATH, PAPERS, RELEASES, TEACHING, SERVICE, TALKS, CERTS, AWARDS } from "../assets/data.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = "https://kamyarzeinalipour.github.io";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const now = new Date();
const UPDATED = `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
export const PDF = { resume: "Kamyar-Zeinalipour-Resume.pdf", cv: "Kamyar-Zeinalipour-CV.pdf" };

const shell = fs.readFileSync(path.join(ROOT, "teaching.html"), "utf8");
const HEAD = shell.slice(0, shell.indexOf('<main id="main">'));
const FOOT = shell.slice(shell.indexOf("</main>") + "</main>".length);

function wrapPage(file, title, desc, main) {
  let head = HEAD
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta (?:name|property)="(?:description|og:description)" content=")[^"]*"/g, `$1${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(title)}"`)
    .replace(/(href|content)="https:\/\/kamyarzeinalipour\.github\.io\/teaching\.html"/g, `$1="${SITE}/${file}"`)
    .replace(' aria-current="page"', "")
    .replace('<a href="cv.html">CV</a>', '<a href="cv.html" aria-current="page">CV</a>');
  fs.writeFileSync(path.join(ROOT, file), `${head}<main id="main">\n${main}\n</main>${FOOT}`);
}

/* ---------- pieces ---------- */
const host = (u) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
// The resume uses the personal address (CV.email); the academic CV the university one.
const contacts = (extra = [], email = CV.email) => {
  const items = [
    [`mailto:${email}`, email],
    [CV.site, host(CV.site)],
    [PROFILE.linkedin, host(PROFILE.linkedin)],
    [PROFILE.github, host(PROFILE.github)],
    [PROFILE.huggingface, host(PROFILE.huggingface)],
    ...extra,
  ];
  return `<ul class="cv-contact">${items.map(([h, t]) => `<li><a href="${esc(h)}">${esc(t)}</a></li>`).join("")}</ul>`;
};
const section = (id, title, body) => `
      <section class="cv-sec" aria-labelledby="${id}">
        <h2 id="${id}">${esc(title)}</h2>
        ${body}
      </section>`;
const row = (when, head, body = "") => `<div class="cv-row"><p class="cv-when">${esc(when)}</p><div><h3>${head}</h3>${body}</div></div>`;
const isDegree = (p) => /^(Ph\.D\.|M\.Sc\.|B\.Sc\.)/.test(p.what);
const degrees = PATH.filter(isDegree);
const positions = PATH.filter((p) => !isDegree(p));
const firstAuthor = PAPERS.filter((p) => p.a.startsWith("K. Zeinalipour")).length;
const me = (a) => esc(a).replace("K. Zeinalipour", "<strong>K. Zeinalipour</strong>");

/* ---------- resume.html: one page ---------- */
function resume() {
  const jobs = CV.jobs.map((j) => row(j.when, `${esc(j.what)}, <span class="cv-where">${esc(j.where)}</span>`,
    `<ul>${j.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`)).join("");
  const edu = degrees.map((d) => row(d.when, `${esc(d.what)}, <span class="cv-where">${esc(d.where)}</span>`,
    d.what.startsWith("Ph.D.") ? `<p>Thesis: From Language to Learning, an LLM-driven framework for multilingual educational content. Grade eccellente.</p>` : "")).join("");
  const projects = `<ul class="cv-plain">${CV.projects.map((p) => `<li><a href="${esc(p.href)}">${esc(p.name)}</a>: ${esc(p.text)}</li>`).join("")}</ul>`;
  const skills = `<dl class="cv-skills">${CV.skills.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
  const teach = TEACHING[0];
  const main = `
  <div class="wrap cv-page">
    <nav class="cv-bar" aria-label="CV versions">
      <p>Resume, one page, for industry roles. Updated ${UPDATED}.</p>
      <p class="links"><a href="${PDF.resume}" download>Download PDF</a> <a href="cv-full.html">Academic CV</a> <a href="cv.html">Both versions</a></p>
    </nav>
    <article class="cv-doc cv-short">
      <header class="cv-top">
        <h1>${esc(PROFILE.name)}</h1>
        <p class="cv-headline">${esc(CV.headline)}</p>
        ${contacts()}
      </header>
      <p class="cv-summary">${esc(CV.summary)}</p>
      ${section("r-exp", "Experience", jobs)}
      ${section("r-proj", "Projects", projects)}
      ${section("r-skills", "Skills", skills)}
      ${section("r-edu", "Education", edu)}
      ${section("r-more", "Teaching and languages", `<ul class="cv-plain">
          <li>${esc(teach.role)}, ${esc(teach.where)}, ${esc(teach.when)}: 20 hours, a lab for every lecture. Teaching assistant, Machine Learning, University of Siena, 2022 to 2026; supervised ten master's theses.</li>
          <li>${CV.spoken.map(([l, lv]) => `${esc(l)} (${esc(lv)})`).join(", ")}.</li>
        </ul>`)}
      <p class="cv-foot">${PAPERS.length} papers, ${firstAuthor} as first author, and 17 open releases: <a href="${SITE}/publications.html">${host(SITE)}/publications.html</a></p>
    </article>
  </div>`;
  wrapPage("resume.html", "Resume, Kamyar Zeinalipour",
    "One-page resume of Kamyar Zeinalipour, AI engineer and NLP researcher: language models, instruction data and evaluation, at Villanova.AI, YUKAI! and the University of Siena.", main);
}

/* ---------- cv-full.html: the academic CV ---------- */
function full() {
  const pos = positions.map((p) => row(p.when, `${esc(p.what)}, <span class="cv-where">${esc(p.where)}</span>`, `<p>${esc(p.note)}</p>`)).join("");
  const edu = degrees.map((p) => row(p.when, `${esc(p.what)}, <span class="cv-where">${esc(p.where)}</span>`, `<p>${esc(p.note)}</p>`)).join("");
  const years = [...new Set(PAPERS.map((p) => p.y))].sort((a, b) => b - a);
  let n = PAPERS.length;
  const pubs = years.map((y) => `<h3 class="cv-year">${y}</h3><ol class="cv-pubs" reversed start="${n}">${PAPERS.filter((p) => p.y === y).map((p) => {
    n--;
    const t = p.link ? `<a href="${esc(p.link)}">${esc(p.t)}</a>` : esc(p.t);
    return `<li>${me(p.a)}. ${t}. <em>${esc(p.v)}</em>.</li>`;
  }).join("")}</ol>`).join("");
  const rel = `<ul class="cv-plain cv-cols">${RELEASES.map((r) => `<li><a href="${esc(r.repo || r.hf)}">${esc(r.name)}</a>: ${esc(r.what)}</li>`).join("")}</ul>`;
  const teach = TEACHING.map((t) => row(t.when, `${esc(t.role)}, <span class="cv-where">${esc(t.where)}</span>`, `<p>${esc(t.body.replace(" in the list on this site", " in the list above"))}</p>`)).join("");
  const serv = SERVICE.map((s) => row(s.when, `${esc(s.role)}, <span class="cv-where">${esc(s.where)}</span>`, s.note ? `<p>${esc(s.note)}</p>` : "")).join("");
  const awards = AWARDS.map((a) => row(a.when, `${esc(a.what)}, <span class="cv-where">${esc(a.where)}</span>`, `<p>${esc(a.note)}</p>`)).join("");
  const talks = TALKS.map((t) => row(t.when, `${esc(t.what)}, <span class="cv-where">${esc(t.where)}</span>`)).join("");
  const certs = CERTS.map((c) => row(c.year, `${esc(c.name)}, <span class="cv-where">${esc(c.by)}</span>`)).join("");
  const skills = `<dl class="cv-skills">${CV.skills.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}
        <div><dt>Languages</dt><dd>${CV.spoken.map(([l, lv]) => `${esc(l)} (${esc(lv)})`).join(", ")}</dd></div></dl>`;
  const main = `
  <div class="wrap cv-page">
    <nav class="cv-bar" aria-label="CV versions">
      <p>Academic CV. Updated ${UPDATED}.</p>
      <p class="links"><a href="${PDF.cv}" download>Download PDF</a> <a href="resume.html">One-page resume</a> <a href="cv.html">Both versions</a></p>
    </nav>
    <article class="cv-doc cv-long">
      <header class="cv-top">
        <h1>${esc(PROFILE.name)}</h1>
        <p class="cv-headline">${esc(PROFILE.role)}</p>
        ${contacts([[PROFILE.orcid, "ORCID " + PROFILE.orcid.split("/").pop()], [PROFILE.scholar, "Google Scholar"]], PROFILE.email)}
      </header>
      ${section("c-int", "Research interests", `<p>${esc(CV.interests)}</p>`)}
      ${section("c-pos", "Positions", pos)}
      ${section("c-edu", "Education", edu)}
      ${section("c-award", "Awards", awards)}
      ${section("c-pub", `Publications (${PAPERS.length}, ${firstAuthor} as first author)`, pubs)}
      ${section("c-rel", "Open research releases", `<p>Each with its code on GitHub and its models and data on Hugging Face.</p>${rel}`)}
      ${section("c-teach", "Teaching and supervision", teach)}
      ${section("c-serv", "Service", serv)}
      ${section("c-talk", "Talks", talks)}
      ${section("c-cert", "Certificates", certs)}
      ${section("c-skill", "Skills and languages", skills)}
      <p class="cv-foot">References available on request. The current version of this CV is at <a href="${SITE}/cv-full.html">${host(SITE)}/cv-full.html</a>.</p>
    </article>
  </div>`;
  wrapPage("cv-full.html", "Academic CV, Kamyar Zeinalipour",
    `Academic CV of Kamyar Zeinalipour, postdoctoral researcher at the University of Siena: positions, education, ${PAPERS.length} papers, teaching, service and talks.`, main);
}

/* ---------- cv.html: pick one ---------- */
function choose() {
  const main = `
  <section class="page-head">
    <div class="wrap">
      <h1>CV</h1>
      <p class="lede">Two versions of the same record. Both are built from the data behind this site, so they agree with it and with each other. Updated ${UPDATED}.</p>
    </div>
  </section>

  <section class="band cv-choose" aria-label="Versions">
    <div class="wrap cv-pick">
      <article>
        <h2><a href="resume.html">Resume</a></h2>
        <p class="cv-for">For industry roles. One page.</p>
        <p>What I have built and what it did, with numbers: Villanova.AI's instruction data, models and pipelines in production, the Baker Hughes forecasting service. Then the tools I use, education and languages.</p>
        <p class="links"><a href="resume.html">Read the resume</a> <a href="${PDF.resume}" download>Download PDF</a></p>
      </article>
      <article>
        <h2><a href="cv-full.html">Academic CV</a></h2>
        <p class="cv-for">For universities and grant applications. The full record.</p>
        <p>Every position and degree, all ${PAPERS.length} papers with their authors and venues, the 17 open releases, teaching and supervision, service, talks and certificates.</p>
        <p class="links"><a href="cv-full.html">Read the CV</a> <a href="${PDF.cv}" download>Download PDF</a></p>
      </article>
    </div>
  </section>`;
  wrapPage("cv.html", "CV, Kamyar Zeinalipour",
    "The CV of Kamyar Zeinalipour in two versions: a one-page resume for industry and the full academic CV, each online and as a PDF.", main);
}

resume(); full(); choose();

// List the three pages in the sitemap once.
const smPath = path.join(ROOT, "sitemap.xml");
let sm = fs.readFileSync(smPath, "utf8");
for (const f of ["cv.html", "resume.html", "cv-full.html"]) {
  if (!sm.includes(`${SITE}/${f}<`)) sm = sm.replace("</urlset>",
    `  <url><loc>${SITE}/${f}</loc><lastmod>${now.toISOString().slice(0, 10)}</lastmod><priority>0.7</priority></url>\n</urlset>`);
}
fs.writeFileSync(smPath, sm);
console.log("built cv.html, resume.html, cv-full.html");
