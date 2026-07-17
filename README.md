# Yu Li Personal Homepage

This repository hosts the personal homepage for Yu Li / 李钰 at <https://carp84.github.io>.

The site is authored in Markdown and rendered by a small dependency-free Node build script. You should not hand-edit generated HTML files.

## Edit Content

English pages:

- `index.md`
- `open-source.md`
- `products.md`
- `speaking.md`
- `blog.md`

Chinese pages:

- `zh.md`
- `zh-open-source.md`
- `zh-products.md`
- `zh-speaking.md`
- `zh-blog.md`

Typical edits:

- Add a recent highlight by editing the `## Recent Highlights` or `## 近期动态` list.
- Add a talk by editing `speaking.md` and `zh-speaking.md`.
- Update product or open-source descriptions by editing the corresponding Markdown page.
- Add published blog posts in the private blog repository under `publish/`.

Shared layout generation lives in `scripts/build.mjs`. Shared styling lives in `styles.css`.

## Blog Publishing

Blog drafts can live in a private repository, for example `carp84/carp84-blog`:

```text
draft/
preview/
publish/
assets/
```

Only Markdown files under `publish/` are included in the public blog index and sitemaps. Drafts should remain outside `publish/`.
Public images and downloadable files should live under `assets/`, and posts should reference them with relative paths such as `../assets/my-post/image.png`.

Markdown files under `preview/` are rendered as unlisted private-review pages. They are not linked from the blog index, are not included in sitemaps, and are marked `noindex, nofollow`. A preview post must include `preview_token`:

```markdown
---
title: My Draft Post
date: 2026-07-17
lang: en
slug: my-draft-post
summary: Draft for private review.
preview_token: review-token-123
---
```

The preview URL is:

```text
/_preview/<preview_token>/<slug>.html
```

Preview links are not authenticated. Anyone with the link can read the page. To publish a previewed post, move it from `preview/` to `publish/`; do not copy it. The next full GitHub Pages build removes the old preview URL. The build fails if `preview/` and `publish/` contain the same slug.

Each published post should use front matter:

```markdown
---
title: My Post Title
date: 2026-07-11
lang: en
slug: my-post-title
summary: One short summary for the blog index.
tags: Apache, Lakehouse
---

Post content starts here.
```

For Chinese posts, use `lang: zh-CN`. Published posts are rendered under `/blog/<slug>.html` for English and `/zh-blog/<slug>.html` for Chinese.

The homepage workflow can read a private blog repository when these repository secrets are configured on `carp84.github.io`:

- `BLOG_REPO`: the private repository name, for example `carp84/carp84-blog`
- `BLOG_REPO_TOKEN`: a fine-grained token with read access to the private blog repository contents

The private blog repository can trigger homepage rebuilds by adding the workflow template in `docs/blog-repository-workflow.yml` to its own `.github/workflows/publish.yml`, then configuring this secret in the private blog repository:

- `HOMEPAGE_REPO_TOKEN`: a token allowed to dispatch workflows on `carp84/carp84.github.io`

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
