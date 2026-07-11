import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "_site");
const pages = [
  "index.md",
  "zh.md",
  "open-source.md",
  "zh-open-source.md",
  "products.md",
  "zh-products.md",
  "speaking.md",
  "zh-speaking.md",
  "blog.md",
  "zh-blog.md",
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return [{}, source];
  }
  const data = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === "true") data[key] = true;
    else if (value === "false") data[key] = false;
    else data[key] = value;
  }
  return [data, match[2]];
}

function inlineMarkdown(text) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)(\{:\.([A-Za-z0-9_-]+)\})?/g, (_m, label, href, _attr, cls) => {
      const classAttr = cls ? ` class="${escapeHtml(cls)}"` : "";
      return `<a${classAttr} href="${escapeHtml(href)}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "post";
}

function splitSections(markdown) {
  const lines = markdown.trim().split("\n");
  const sections = [];
  let current = { heading: null, level: 0, lines: [] };
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      sections.push(current);
      current = { heading: h2[1].trim(), level: 2, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections.filter((section) => section.heading || section.lines.some((line) => line.trim()));
}

function parseClassLine(line) {
  const match = line.trim().match(/^\{:\s*([. A-Za-z0-9_-]+)\}$/);
  if (!match) return [];
  return match[1].split(/\s+/).map((item) => item.replace(/^\./, "")).filter(Boolean);
}

function renderBlocks(lines) {
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const classes = parseClassLine(line);
    if (classes.length) {
      const next = lines[i + 1] || "";
      if (/^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next)) {
        const [listHtml, nextIndex] = renderList(lines, i + 1, classes);
        html.push(listHtml);
        i = nextIndex;
        continue;
      }
      if (/^\|/.test(next)) {
        const [tableHtml, nextIndex] = renderTable(lines, i + 1, classes);
        html.push(tableHtml);
        i = nextIndex;
        continue;
      }
      const [paragraphHtml, nextIndex] = renderParagraph(lines, i + 1, classes);
      html.push(paragraphHtml);
      i = nextIndex;
      continue;
    }

    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const nextClasses = parseClassLine(lines[i + 1] || "");
      const classAttr = nextClasses.length ? ` class="${nextClasses.join(" ")}"` : "";
      html.push(`<h3${classAttr}>${inlineMarkdown(h3[1].trim())}</h3>`);
      i += nextClasses.length ? 2 : 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const nextClasses = parseClassLine(lines[i + 1] || "");
      const heroTitle = nextClasses.includes("hero-title");
      const level = heroTitle ? 2 : heading[1].length;
      const renderedClasses = nextClasses.filter((cls) => cls !== "hero-title");
      const classAttr = renderedClasses.length ? ` class="${renderedClasses.join(" ")}"` : "";
      html.push(`<h${level}${classAttr}>${inlineMarkdown(heading[2].trim())}</h${level}>`);
      i += nextClasses.length ? 2 : 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const [blockquoteHtml, nextIndex] = renderBlockquote(lines, i);
      html.push(blockquoteHtml);
      i = nextIndex;
      continue;
    }

    if (i + 1 < lines.length && /^:\s*/.test(lines[i + 1])) {
      const [dlHtml, nextIndex] = renderDefinitionList(lines, i);
      html.push(dlHtml);
      i = nextIndex;
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const [listHtml, nextIndex] = renderList(lines, i, []);
      html.push(listHtml);
      i = nextIndex;
      continue;
    }

    if (/^\|/.test(line)) {
      const [tableHtml, nextIndex] = renderTable(lines, i, []);
      html.push(tableHtml);
      i = nextIndex;
      continue;
    }

    const [paragraphHtml, nextIndex] = renderParagraph(lines, i, []);
    if (nextIndex === i) {
      throw new Error(`Markdown parser made no progress near line: ${line}`);
    }
    html.push(paragraphHtml);
    i = nextIndex;
  }
  return html.join("\n");
}

function renderBlockquote(lines, start) {
  const parts = [];
  let i = start;
  while (i < lines.length && /^>\s?/.test(lines[i])) {
    parts.push(lines[i].replace(/^>\s?/, "").trim());
    i += 1;
  }
  return [`<blockquote><p>${inlineMarkdown(parts.join("<br>"))}</p></blockquote>`, i];
}

function renderParagraph(lines, start, classes) {
  const parts = [];
  let i = start;
  while (i < lines.length && lines[i].trim() && !/^#{1,3}\s+/.test(lines[i]) && !parseClassLine(lines[i]).length && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !/^\|/.test(lines[i])) {
    parts.push(lines[i].trim());
    i += 1;
  }
  const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
  const nextClasses = parseClassLine(lines[i] || "");
  const allClasses = classes.concat(nextClasses);
  const finalClassAttr = allClasses.length ? ` class="${allClasses.join(" ")}"` : classAttr;
  if (nextClasses.length) i += 1;
  return [`<p${finalClassAttr}>${inlineMarkdown(parts.join(" "))}</p>`, i];
}

function renderDefinitionList(lines, start) {
  const articles = [];
  let i = start;
  while (i + 1 < lines.length && lines[i].trim() && /^:\s*/.test(lines[i + 1])) {
    const term = lines[i].trim();
    const def = lines[i + 1].replace(/^:\s*/, "").trim();
    i += 2;
    let body;
    if (def) {
      body = `<p>${inlineMarkdown(def)}</p>`;
    } else {
      const nested = [];
      while (i < lines.length && (/^\s{2,}\S/.test(lines[i]) || !lines[i].trim())) {
        nested.push(lines[i].replace(/^\s{2}/, ""));
        i += 1;
      }
      body = renderBlocks(nested);
    }
    articles.push(`<article><h3>${inlineMarkdown(term)}</h3><div class="info-body">${body}</div></article>`);
    while (i < lines.length && !lines[i].trim()) i += 1;
  }
  return [`<div class="info-list">\n${articles.join("\n")}\n</div>`, i];
}

function renderList(lines, start, classes) {
  const ordered = /^\d+\.\s+/.test(lines[start]);
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let i = start;
  while (i < lines.length && (/^[-*]\s+/.test(lines[i]) || /^\d+\.\s+/.test(lines[i]))) {
    let item = lines[i].replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    i += 1;
    while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
      item += `\n${lines[i].trim()}`;
      i += 1;
    }
    items.push(`<li>${inlineMarkdown(item).replace(/\n/g, "\n")}</li>`);
  }
  const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
  return [`<${tag}${classAttr}>\n${items.join("\n")}\n</${tag}>`, i];
}

function renderTable(lines, start, classes) {
  const rows = [];
  let i = start;
  while (i < lines.length && /^\|/.test(lines[i])) {
    rows.push(lines[i]);
    i += 1;
  }
  const headers = rows[0].split("|").slice(1, -1).map((cell) => cell.trim());
  const bodyRows = rows.slice(2).map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
  const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
  const table = `<table${classAttr}>
<thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>
<tbody>
${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("\n")}
</tbody>
</table>`;
  return [`<div class="table-wrap">\n${table}\n</div>`, i];
}

function renderMarkdown(markdown, layout) {
  const sections = splitSections(markdown);
  if (layout === "home") {
    const [hero, ...rest] = sections;
    return [
      `<section class="hero section">\n${renderBlocks(hero.lines)}\n</section>`,
      ...rest.map((section) => `<section class="section">\n<h2>${inlineMarkdown(section.heading)}</h2>\n${renderBlocks(section.lines)}\n</section>`),
    ].join("\n");
  }
  return sections.map((section) => {
    if (!section.heading) return `<section class="section">\n${renderBlocks(section.lines)}\n</section>`;
    return `<section class="section">\n<h2>${inlineMarkdown(section.heading)}</h2>\n${renderBlocks(section.lines)}\n</section>`;
  }).join("\n");
}

function renderHeader(page) {
  const zh = page.lang === "zh-CN";
  const brandHref = zh ? "zh.html" : "index.html";
  const brand = zh ? "李钰 | Yu Li" : "Yu Li | 李钰";
  const links = zh
    ? [
        ["about", "zh.html", "关于"],
        ["open-source", "zh-open-source.html", "开源"],
        ["products", "zh-products.html", "产品"],
        ["speaking", "zh-speaking.html", "演讲"],
        ["blog", "zh-blog.html", "博客"],
        [null, page.switch_url || "index.html", "English"],
      ]
    : [
        ["about", "index.html", "About"],
        ["open-source", "open-source.html", "Open Source"],
        ["products", "products.html", "Products"],
        ["speaking", "speaking.html", "Speaking"],
        ["blog", "blog.html", "Blog"],
        [null, page.switch_url || "zh.html", "中文"],
      ];
  return `<header class="site-header">
  <a class="brand" href="${brandHref}">${brand}</a>
  <nav class="nav" aria-label="${zh ? "主导航" : "Primary navigation"}">
    ${links.map(([active, href, label]) => `<a ${active && page.active === active ? 'class="active" ' : ""}href="${href}">${label}</a>`).join("\n    ")}
  </nav>
</header>`;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function summarize(markdown, fallback = "") {
  if (fallback) return fallback;
  const text = markdown
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#") && !parseClassLine(line).length)
    .join(" ");
  return stripHtml(inlineMarkdown(text)).slice(0, 180);
}

function readBlogPosts() {
  const sourceDir = path.resolve(root, process.env.BLOG_SOURCE_DIR || "blog-source/publish");
  if (!fs.existsSync(sourceDir)) return [];
  const files = fs.readdirSync(sourceDir, { recursive: true })
    .filter((file) => file.endsWith(".md") || file.endsWith(".markdown"))
    .sort();
  return files.map((file) => {
    const abs = path.join(sourceDir, file);
    const [frontMatter, markdown] = parseFrontMatter(fs.readFileSync(abs, "utf8"));
    const lang = frontMatter.lang || (file.startsWith("zh/") ? "zh-CN" : "en");
    const zh = lang === "zh-CN";
    const slug = frontMatter.slug || slugify(path.basename(file).replace(/\.(md|markdown)$/, ""));
    const date = frontMatter.date || "";
    const title = frontMatter.title || slug;
    const tags = (frontMatter.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const permalink = frontMatter.permalink || `/${zh ? "zh-blog" : "blog"}/${slug}.html`;
    return {
      ...frontMatter,
      source: file,
      markdown,
      lang,
      zh,
      slug,
      date,
      title,
      tags,
      summary: summarize(markdown, frontMatter.summary),
      permalink,
      canonical: permalink,
      href_en: frontMatter.href_en || (zh ? "/blog.html" : permalink),
      href_zh: frontMatter.href_zh || (zh ? permalink : "/zh-blog.html"),
      href_default: frontMatter.href_default || (zh ? "/blog.html" : permalink),
      active: "blog",
      layout: "post",
      switch_url: zh ? "blog.html" : "zh-blog.html",
    };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
}

function renderBlogList(posts, lang) {
  const zh = lang === "zh-CN";
  const selected = posts.filter((post) => post.zh === zh);
  const fallback = zh && !selected.length ? posts.filter((post) => !post.zh) : [];
  if (!selected.length && !fallback.length) {
    return `<section class="section blog-index">
<h2>${zh ? "即将更新" : "Coming Soon"}</h2>
<p class="note">${zh ? "这里将陆续更新关于开源数据基础设施、Apache 项目和工程实践的文章。" : "Notes on open-source data infrastructure, Apache projects, and engineering practice will appear here."}</p>
</section>`;
  }
  if (fallback.length) {
    return `<section class="section blog-index">
<h2>英文文章</h2>
<p class="note">以下文章暂未提供中文版。</p>
${renderPostCards(fallback)}
</section>`;
  }
  return `<section class="section blog-index">
<h2>${zh ? "最新文章" : "Latest Posts"}</h2>
${renderPostCards(selected)}
</section>`;
}

function renderPostCards(posts) {
  return `<div class="post-list">
${posts.map((post) => `<article class="post-card">
  <div class="post-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time>${post.tags.length ? `<span>${post.tags.map(escapeHtml).join(" · ")}</span>` : ""}</div>
  <h3><a href="${escapeHtml(post.permalink.replace(/^\//, ""))}">${inlineMarkdown(post.title)}</a></h3>
  <p>${escapeHtml(post.summary)}</p>
</article>`).join("\n")}
</div>`;
}

function renderPostPage(post) {
  const body = `<article class="post-page">
  <header class="post-header">
    <p class="eyebrow">${post.zh ? "博客" : "Blog"}</p>
    <h1>${inlineMarkdown(post.title)}</h1>
    <div class="post-meta"><time datetime="${escapeHtml(post.date)}">${escapeHtml(post.date)}</time>${post.tags.length ? `<span>${post.tags.map(escapeHtml).join(" · ")}</span>` : ""}</div>
  </header>
  <section class="markdown-content">
${renderMarkdown(post.markdown, "post")}
  </section>
</article>`;
  return renderPage({
    ...post,
    title: `${post.title} | Yu Li`,
    description: post.summary,
    eyebrow: post.zh ? "博客" : "Blog",
    headline: post.title,
    lead: post.summary,
  }, body);
}

function renderJsonLd(page) {
  if (!page.person_jsonld) return "";
  const zh = page.lang === "zh-CN";
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": "https://carp84.github.io/#yu-li",
    url: "https://carp84.github.io/",
    name: zh ? "李钰" : "Yu Li",
    alternateName: zh ? ["Yu Li", "绝顶", "carp84", "liyu"] : ["李钰", "绝顶", "carp84", "liyu"],
    email: "mailto:liyu@apache.org",
    image: "https://avatars.githubusercontent.com/u/6239804?v=4",
    jobTitle: "EMR Lead",
    worksFor: { "@type": "Organization", name: "Alibaba Cloud" },
    alumniOf: { "@type": "CollegeOrUniversity", name: "Beihang University" },
    memberOf: { "@type": "Organization", name: "The Apache Software Foundation" },
    knowsAbout: ["Apache Flink", "Apache HBase", "Apache Gluten", "Apache Paimon", "Apache Celeborn", "Apache Fluss", "Apache Amoro", "Apache GraphAr", "Milvus", "StarRocks", "Alibaba Cloud EMR", "Distributed computing", "Lakehouse architecture"],
    sameAs: ["https://github.com/carp84", "https://www.linkedin.com/in/carp84", "https://twitter.com/LiyuApache", "https://people.apache.org/phonebook.html?uid=liyu", "https://orcid.org/0000-0003-4355-2764", "https://scholar.google.com/citations?user=oU9DCnoAAAAJ"],
  };
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
}

function renderProfileCard(page) {
  const zh = page.lang === "zh-CN";
  return `<aside class="profile-card">
  <img class="portrait" src="https://avatars.githubusercontent.com/u/6239804?v=4" alt="${zh ? "李钰头像" : "Portrait of Yu Li"}" width="220" height="220">
  ${zh ? `<h1>李钰 <span>Yu Li</span></h1>
  <p class="nickname">绝顶 · carp84</p>
  <p class="role">阿里云 EMR 负责人</p>
  <ul class="quick-facts">
    <li>ASF Member</li>
    <li>16 年 Apache 经历</li>
    <li>分布式计算</li>
    <li>中国北京</li>
  </ul>` : `<h1>Yu Li <span>李钰</span></h1>
  <p class="nickname">绝顶 · carp84</p>
  <p class="role">EMR Lead @ Alibaba Cloud</p>
  <ul class="quick-facts">
    <li>ASF Member</li>
    <li>16 years in Apache</li>
    <li>Distributed computing</li>
    <li>Beijing, China</li>
  </ul>`}
  <div class="links">
    <a href="mailto:liyu@apache.org">Email</a>
    <a href="https://github.com/carp84">GitHub carp84</a>
    <a href="https://people.apache.org/phonebook.html?uid=liyu">Apache liyu</a>
    <a href="https://www.linkedin.com/in/carp84">LinkedIn carp84</a>
    <a href="https://twitter.com/LiyuApache">X @LiyuApache</a>
    <a href="https://scholar.google.com/citations?user=oU9DCnoAAAAJ">Scholar</a>
    <a href="https://orcid.org/0000-0003-4355-2764">ORCID</a>
  </div>
</aside>`;
}

function renderPage(page, body) {
  const zh = page.lang === "zh-CN";
  const main = page.layout === "home"
    ? `<main class="page-shell">\n${renderProfileCard(page)}\n<section class="content">\n${body}\n</section>\n</main>`
    : page.layout === "post"
      ? `<main class="single-page">\n${body}\n</main>`
    : `<main class="single-page">\n<section class="section hero compact">\n<p class="eyebrow">${escapeHtml(page.eyebrow)}</p>\n<h1>${escapeHtml(page.headline)}</h1>\n${page.lead ? `<p class="lead">${escapeHtml(page.lead)}</p>` : ""}\n</section>\n${body}\n</main>`;
  return `<!doctype html>
<html lang="${page.lang || "en"}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(page.description || "")}">
    <title>${escapeHtml(page.title || "")}</title>
    <link rel="canonical" href="https://carp84.github.io${page.canonical}">
    <link rel="alternate" hreflang="en" href="https://carp84.github.io${page.href_en}">
    <link rel="alternate" hreflang="zh-CN" href="https://carp84.github.io${page.href_zh}">
    <link rel="alternate" hreflang="x-default" href="https://carp84.github.io${page.href_default}">
    <link rel="stylesheet" href="styles.css">
    ${renderJsonLd(page)}
  </head>
  <body${zh ? ' class="zh"' : ""}>
    ${renderHeader(page)}
    ${main}
    <footer class="site-footer"><span>© 2026 Yu Li.</span></footer>
  </body>
</html>
`;
}

function outputPathFor(page) {
  if (page.permalink === "/") return path.join(outDir, "index.html");
  return path.join(outDir, page.permalink.replace(/^\//, ""));
}

function absoluteUrl(value) {
  return `https://carp84.github.io${value}`;
}

function generateSitemap(entries) {
  const urls = entries.map((entry) => {
    const lastmod = entry.date || "2026-07-11";
    const priority = entry.priority || (entry.active === "blog" ? "0.7" : "0.8");
    return `  <url>
    <loc>${absoluteUrl(entry.canonical)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
    <changefreq>${entry.changefreq || "monthly"}</changefreq>
    <priority>${priority}</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${absoluteUrl(entry.href_en)}" />
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${absoluteUrl(entry.href_zh)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(entry.href_default)}" />
  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const blogPosts = readBlogPosts();
const sitemapEntries = [];

for (const pageFile of pages) {
  const [page, markdown] = parseFrontMatter(fs.readFileSync(path.join(root, pageFile), "utf8"));
  const extraBody = page.active === "blog" ? `\n${renderBlogList(blogPosts, page.lang)}` : "";
  const body = `${renderMarkdown(markdown, page.layout)}${extraBody}`;
  const html = renderPage(page, body);
  const dest = outputPathFor(page);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
  console.log(`built ${path.relative(root, dest)}`);
  sitemapEntries.push({
    ...page,
    priority: page.permalink === "/" || page.permalink === "/zh.html" ? "1.0" : page.active === "open-source" ? "0.9" : "0.8",
  });
}

for (const post of blogPosts) {
  const dest = outputPathFor(post);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, renderPostPage(post));
  console.log(`built ${path.relative(root, dest)}`);
  sitemapEntries.push({
    ...post,
    priority: "0.6",
    changefreq: "yearly",
  });
}

fs.writeFileSync(path.join(outDir, "sitemap.xml"), generateSitemap(sitemapEntries));

copyDirectory(path.resolve(root, process.env.BLOG_ASSETS_DIR || "blog-source/assets"), path.join(outDir, "assets"));

for (const file of ["styles.css", "robots.txt", "llms.txt"]) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}
