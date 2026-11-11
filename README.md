# kamyarzeinalipour.github.io

Personal site: research, publications, teaching, updates, and a playable crossword.

Static HTML, CSS and JavaScript with no build step and no dependencies. `.nojekyll`
tells GitHub Pages to serve the files as they are.

```
index.html          home: selected work, latest updates, recent papers
research.html       five research lines, each with an interactive figure
publications.html   all papers, filterable, with a papers-per-year chart
teaching.html       teaching and supervision
updates.html        news, most recent first
about.html          bio and path
crossword.html      a playable crossword built from the research vocabulary
assets/data.js      ALL content: papers, releases, projects, news, teaching, figures
assets/app.js       renders the content into whichever page is open
assets/figures.js   the interactive figures on the research page
assets/style.css    tokens, light and dark themes, layout
```

## Adding things

Everything lives in `assets/data.js`, and each entry shows up on every page it belongs on.

- **A paper:** add it to `PAPERS`. It appears on Publications, in the chart, and in
  "Recent papers" on the home page. Add `code:` and `hf:` for the repository and model
  collection.
- **News:** add it to `UPDATES` with a sortable `when` (`"2026-11"`). It appears on Updates
  and in "Latest" on the home page. Give it `ref:` (the start of a paper title) and it links to
  that paper on the Publications page.
- **Announcing a paper or project in one step:** give its `PAPERS` or `BUILT` entry a
  `news: { when, date, text }` field. It is added to Updates automatically.
- **Teaching:** add to `TEACHING`.

Run it locally with `python3 -m http.server 8000` and open `http://localhost:8000`.
