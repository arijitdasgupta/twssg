import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join, extname, basename } from "path";
import { createHash } from "crypto";
import { log } from "./log";

export interface ImageMap {
  [originalUrl: string]: string; // originalUrl → local relative path
}

function hashUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

function deriveFilename(url: string): string {
  try {
    const parsed = new URL(url);
    const base = basename(parsed.pathname);
    const ext = extname(base);
    if (ext && base.length > 1) {
      const name = base.slice(0, -(ext.length)).slice(0, 40);
      return `${name}-${hashUrl(url)}${ext}`;
    }
  } catch {}
  return `${hashUrl(url)}.jpg`;
}

function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]!;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      urls.push(src);
    }
  }
  return urls;
}

export function collectImageUrls(
  posts: { html?: string; feature_image?: string | null }[]
): string[] {
  const urlSet = new Set<string>();
  for (const post of posts) {
    if (post.feature_image) {
      urlSet.add(post.feature_image);
    }
    if (post.html) {
      for (const url of extractImageUrls(post.html)) {
        urlSet.add(url);
      }
    }
  }
  return Array.from(urlSet);
}

async function downloadOne(
  url: string,
  destPath: string
): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "twssg/1.0" },
      redirect: "follow",
    });
    if (!resp.ok) {
      log.warn("Image download failed", { url, status: resp.status });
      return false;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    writeFileSync(destPath, buf);
    log.info("Image downloaded", { url, bytes: buf.length });
    return true;
  } catch (err: any) {
    log.warn("Image download error", { url, error: err.message });
    return false;
  }
}

export async function downloadImages(
  urls: string[],
  imagesDir: string,
  subpath: string,
  concurrency: number = 6
): Promise<ImageMap> {
  if (urls.length === 0) return {};

  mkdirSync(imagesDir, { recursive: true });

  const imageMap: ImageMap = {};
  const queue = [...urls];

  log.info("Downloading images", { count: urls.length, subpath });

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift()!;
      const filename = deriveFilename(url);
      const destPath = join(imagesDir, filename);
      const localPath = `/${subpath}/images/${filename}`;

      if (existsSync(destPath)) {
        imageMap[url] = localPath;
        continue;
      }

      const ok = await downloadOne(url, destPath);
      if (ok) {
        imageMap[url] = localPath;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);

  const downloaded = Object.keys(imageMap).length;
  log.info("Images downloaded", { total: urls.length, downloaded, subpath });

  return imageMap;
}

export function rewriteHtml(html: string, imageMap: ImageMap): string {
  if (Object.keys(imageMap).length === 0) return html;

  let result = html;
  for (const [originalUrl, localPath] of Object.entries(imageMap)) {
    const escaped = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), localPath);
  }
  return result;
}

export function rewriteFeatureImage(
  featureImage: string | null | undefined,
  imageMap: ImageMap
): string | null {
  if (!featureImage) return null;
  return imageMap[featureImage] ?? featureImage;
}
