# Yu Li Personal Homepage

This repository hosts the personal homepage for Yu Li / 李钰 at <https://carp84.github.io>.

The site is authored in Markdown and rendered by a small dependency-free Node build script. You should not hand-edit generated HTML files.

## Edit Content

English pages:

- `index.md`
- `open-source.md`
- `products.md`
- `speaking.md`

Chinese pages:

- `zh.md`
- `zh-open-source.md`
- `zh-products.md`
- `zh-speaking.md`

Typical edits:

- Add a recent highlight by editing the `## Recent Highlights` or `## 近期动态` list.
- Add a talk by editing `speaking.md` and `zh-speaking.md`.
- Update product or open-source descriptions by editing the corresponding Markdown page.

Shared layout generation lives in `scripts/build.mjs`. Shared styling lives in `styles.css`.

## Publish

After editing Markdown:

```bash
git add .
git commit -m "Update homepage content"
git push origin main
```

GitHub Pages builds and publishes the site automatically through `.github/workflows/pages.yml`.

The repository Pages source should be configured as **GitHub Actions**.

## Local Preview Build

Local build is optional for content edits, but useful for checking larger changes:

```bash
node scripts/build.mjs
```

The generated site is written to `_site/`. The GitHub Actions workflow runs the same build command on every push to `main`.
