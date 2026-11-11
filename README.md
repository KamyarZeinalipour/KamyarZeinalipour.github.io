# kamyarzeinalipour.github.io

My personal site: papers, released code and models, and a crossword built from the
research vocabulary.

Static HTML, CSS and JavaScript with no build step and no dependencies. `.nojekyll`
tells GitHub Pages to serve the files as they are.

```
index.html        structure and prose
assets/style.css  tokens, light and dark themes, layout
assets/app.js     crossword, publication filter, chart
assets/data.js    publications, releases, puzzle entries
```

To change the publication list, edit `assets/data.js`. Nothing else needs touching.

Run it locally with `python3 -m http.server 8000` and open `http://localhost:8000`.
