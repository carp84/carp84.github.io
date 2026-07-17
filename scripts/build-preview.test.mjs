import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const buildScript = path.join(root, "scripts", "build.mjs");

function writePost(dir, file, frontMatter, body) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), `---\n${frontMatter.trim()}\n---\n\n${body.trim()}\n`);
}

function runBuild(env) {
  execFileSync(process.execPath, [buildScript], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });
}

test("preview posts render at private URLs without entering public indexes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "carp84-preview-"));
  const publishDir = path.join(tmp, "publish");
  const previewDir = path.join(tmp, "preview");
  const assetsDir = path.join(tmp, "assets");

  writePost(publishDir, "published.md", `
title: Published Post
date: 2026-07-01
lang: en
slug: published-post
summary: Public post.
tags: Test
`, "# Published Post\n\nPublic body.");

  writePost(previewDir, "draft.md", `
title: Draft Preview
date: 2026-07-17
lang: en
slug: draft-preview
summary: Private review draft.
tags: Draft
preview_token: review-token-123
`, "# Draft Preview\n\nPreview body.");

  runBuild({
    BLOG_SOURCE_DIR: publishDir,
    BLOG_PREVIEW_DIR: previewDir,
    BLOG_ASSETS_DIR: assetsDir,
  });

  const previewHtmlPath = path.join(root, "_site", "_preview", "review-token-123", "draft-preview.html");
  assert.equal(fs.existsSync(previewHtmlPath), true);
  const previewHtml = fs.readFileSync(previewHtmlPath, "utf8");
  assert.match(previewHtml, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(previewHtml, /Draft Preview/);

  const blogIndex = fs.readFileSync(path.join(root, "_site", "blog.html"), "utf8");
  assert.match(blogIndex, /Published Post/);
  assert.doesNotMatch(blogIndex, /Draft Preview/);

  const sitemap = fs.readFileSync(path.join(root, "_site", "sitemap.xml"), "utf8");
  assert.match(sitemap, /\/blog\/published-post\.html/);
  assert.doesNotMatch(sitemap, /_preview/);
  assert.doesNotMatch(sitemap, /draft-preview/);
});

test("published and preview posts cannot share a slug", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "carp84-preview-conflict-"));
  const publishDir = path.join(tmp, "publish");
  const previewDir = path.join(tmp, "preview");
  const assetsDir = path.join(tmp, "assets");

  const sharedFrontMatter = `
title: Shared Slug
date: 2026-07-17
lang: en
slug: shared-slug
summary: Shared summary.
`;
  writePost(publishDir, "shared.md", sharedFrontMatter, "Published body.");
  writePost(previewDir, "shared.md", `${sharedFrontMatter}\npreview_token: token`, "Preview body.");

  assert.throws(() => runBuild({
    BLOG_SOURCE_DIR: publishDir,
    BLOG_PREVIEW_DIR: previewDir,
    BLOG_ASSETS_DIR: assetsDir,
  }), /Preview post "shared-slug" has the same slug as a published post/);
});
