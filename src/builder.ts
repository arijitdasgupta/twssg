import { mkdirSync, writeFileSync, cpSync, existsSync, rmSync } from "fs";
import { join, resolve } from "path";
import * as sass from "sass";
import Eleventy from "@11ty/eleventy";
import type { SiteConfig, AppConfig } from "./config";
import { fetchPosts } from "./ghost";
import { log } from "./log";
import { metrics } from "./metrics";
import { buildStart, buildEnd, isShuttingDown } from "./lifecycle";

// Inject loading="lazy" into <img> tags so browsers defer offscreen images.
// Ghost HTML is clean and predictable; browsers that don't support the
// attribute simply ignore it and load images normally (~95%+ global support).
function lazyLoadImages(html: string): string {
  return html.replace(/<img /g, '<img loading="lazy" ');
}

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function generateIndexPage(site: SiteConfig): string {
  return `---
layout: index.njk
permalink: /
---
`;
}

function generateRootIndexHtml(sites: SiteConfig[]): string {
  const siteLinks = sites
    .map(
      (site) => `
      <a href="/${site.subpath}/" class="site-link">
        <span class="site-title">${site.title}</span>
      </a>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Travel</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baskervville:ital,wght@0,400..700;1,400..700&display=swap">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: "Georgia", "Times New Roman", "Times", serif;
      background: #faf9f6;
      color: #1a1a1a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    h1 {
      font-family: "Baskervville", "Georgia", "Times New Roman", "Times", serif;
      font-size: 2.5rem;
      font-weight: 400;
      margin-bottom: 3rem;
      text-align: center;
    }
    
    .site-links {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      width: 100%;
      max-width: 32rem;
    }
    
    .site-link {
      display: block;
      padding: 1.5rem 2rem;
      background: #fff;
      border: 1px solid #d4d4d4;
      border-left: 4px solid #8b0000;
      text-decoration: none;
      color: #1a1a1a;
      transition: all 0.2s ease;
    }
    
    .site-link:hover {
      background: #f5f0e8;
      border-left-width: 6px;
      transform: translateX(4px);
    }
    
    .site-link .site-title {
      font-family: "Baskervville", "Georgia", "Times New Roman", "Times", serif;
      font-size: 1.5rem;
      font-weight: 400;
    }
  </style>
</head>
<body>
  <nav class="site-links">
${siteLinks}
  </nav>
</body>
</html>
`;
}


export async function buildSite(
  site: SiteConfig,
  appConfig: AppConfig,
  dev: boolean = false
): Promise<void> {
  if (isShuttingDown()) {
    log.warn("Skipping build, shutdown in progress", { site: site.title });
    return;
  }

  buildStart();
  try {
    await _buildSiteInner(site, appConfig, dev);
  } finally {
    buildEnd();
  }
}

async function _buildSiteInner(
  site: SiteConfig,
  appConfig: AppConfig,
  dev: boolean
): Promise<void> {
  const workDir = join(resolve(".twssg-work"), site.subpath);
  const outputDir = join(resolve(appConfig.outputDir), site.subpath);

  const siteLabels = { site: site.title, subpath: site.subpath };
  const buildStart = performance.now();

  log.info("Fetching posts from Ghost", { site: site.title, subpath: site.subpath });
  const fetchStart = performance.now();
  let posts: any[];
  try {
    posts = await fetchPosts(site);
  } catch (err: any) {
    metrics.fetchErrors.inc(siteLabels);
    log.error("Failed to fetch posts", { site: site.title, error: err.message });
    return;
  }
  const fetchDuration = (performance.now() - fetchStart) / 1000;
  metrics.fetchDuration.observe(siteLabels, fetchDuration);
  metrics.postsCount.set(siteLabels, posts.length);
  log.info("Fetched posts", { site: site.title, count: posts.length, sortOrder: site.sortOrder, fetchSeconds: fetchDuration });

  posts.sort((a, b) => {
    const da = new Date(a.published_at || 0).getTime();
    const db = new Date(b.published_at || 0).getTime();
    return site.sortOrder === "asc" ? da - db : db - da;
  });

  // Clean and prepare work directory
  if (existsSync(workDir)) {
    rmSync(workDir, { recursive: true });
  }
  ensureDir(workDir);

  cpSync(resolve("theme/_includes"), join(workDir, "_includes"), {
    recursive: true,
  });

  ensureDir(join(workDir, "css"));
  ensureDir(join(outputDir, "css"));
  const scssEntry = resolve("theme/scss/style.scss");
  const sassResult = sass.compile(scssEntry, { style: "compressed" });
  writeFileSync(join(workDir, "css", "style.css"), sassResult.css);
  writeFileSync(join(outputDir, "css", "style.css"), sassResult.css);

  writeFileSync(join(workDir, "index.njk"), generateIndexPage(site));
  // Write individual post files
  ensureDir(join(workDir, "posts"));
  for (const post of posts) {
    const frontmatter = {
      layout: "post.njk",
      title: post.title,
      slug: post.slug,
      published_at: post.published_at,
      feature_image: post.feature_image || null,
      excerpt: (post.excerpt || "").replace(/\n/g, " "),
      tags: (post.tags || []).map((t: any) => ({
        name: t.name,
        slug: t.slug,
      })),
      authors: (post.authors || []).map((a: any) => ({
        name: a.name,
        slug: a.slug,
      })),
      permalink: `/posts/${post.slug}/`,
    };

    const fileContent = `---json\n${JSON.stringify(frontmatter, null, 2)}\n---\n${lazyLoadImages(post.html || "")}`;
    writeFileSync(join(workDir, "posts", `${post.slug}.njk`), fileContent);
  }

  // Write posts collection data file for the index
  ensureDir(join(workDir, "_data"));
  const postsData = posts.map((p) => ({
    title: p.title,
    slug: p.slug,
    published_at: p.published_at,
    feature_image: p.feature_image,
    excerpt: p.excerpt,
    html: lazyLoadImages(p.html || ""),
    tags: p.tags,
  }));
  writeFileSync(
    join(workDir, "_data", "posts.json"),
    JSON.stringify(postsData, null, 2)
  );

  log.info("Building with Eleventy", { site: site.title, outputDir });

  const elev = new Eleventy(workDir, outputDir, {
    configPath: null,
    pathPrefix: `/${site.subpath}/`,
    config(eleventyConfig: any) {
      eleventyConfig.setUseGitIgnore(false);
      eleventyConfig.addPassthroughCopy({ css: "css" });

      eleventyConfig.addFilter("dateDisplay", (dateStr: string) => {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      });

      eleventyConfig.addGlobalData("siteTitle", site.title);
      eleventyConfig.addGlobalData("subpath", site.subpath);
      eleventyConfig.addGlobalData("copyright", site.copyright || "");
      eleventyConfig.addGlobalData("dev", dev);
      eleventyConfig.addGlobalData("buildTime", Date.now());
    },
  });

  try {
    await elev.write();
    const buildDuration = (performance.now() - buildStart) / 1000;
    metrics.buildDuration.observe(siteLabels, buildDuration);
    metrics.buildTotal.inc(siteLabels);
    metrics.lastBuildTimestamp.set(siteLabels, Date.now() / 1000);
    log.info("Build complete", { site: site.title, outputDir, buildSeconds: buildDuration });
  } catch (err: any) {
    metrics.buildErrors.inc(siteLabels);
    metrics.buildTotal.inc(siteLabels);
    log.error("Eleventy build failed", { site: site.title, error: err.message });
  }
}

export async function buildAllSites(
  appConfig: AppConfig,
  dev: boolean = false
): Promise<void> {
  log.info("Building all sites", { count: appConfig.sites.length });
  for (const site of appConfig.sites) {
    await buildSite(site, appConfig, dev);
  }

  // Generate root index page with links to all sites
  const rootIndexPath = join(resolve(appConfig.outputDir), "index.html");
  writeFileSync(rootIndexPath, generateRootIndexHtml(appConfig.sites));
  log.info("Generated root index", { path: rootIndexPath });

  log.info("All sites built");
}
