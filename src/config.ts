import { readFileSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import { resolve } from "path";

export type SortOrder = "asc" | "desc";

export interface SiteConfig {
  title: string;
  subpath: string;
  tag?: string;
  ghostUrl: string;
  ghostApiKey: string;
  updateFrequency: string; // e.g. "10s", "10m", "1h"
  sortOrder: SortOrder;
  copyright?: string;
  hostname?: string;
}

export interface AppConfig {
  outputDir: string;
  sites: SiteConfig[];
}

function parseFrequency(freq: string): number {
  const match = freq.match(/^(\d+)(s|m|h)$/);
  if (!match) {
    throw new Error(
      `Invalid frequency format "${freq}". Use e.g. "10s", "10m", "1h".`
    );
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown unit "${unit}"`);
  }
}

export function parseFrequencyMs(freq: string): number {
  return parseFrequency(freq);
}

export function loadConfig(configPath?: string): AppConfig {
  let raw: string;

  const envConfig = process.env.TWSSG_CONFIG;
  if (envConfig) {
    raw = Buffer.from(envConfig, "base64").toString("utf-8");
  } else {
    const resolvedPath = resolve(configPath ?? "config.yaml");
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }
    raw = readFileSync(resolvedPath, "utf-8");
  }

  const parsed: any = parseYaml(raw);

  if (!parsed.sites || !Array.isArray(parsed.sites)) {
    throw new Error("Config must have a 'sites' array.");
  }

  const config: AppConfig = {
    outputDir: parsed.outputDir ?? "./dist",
    sites: parsed.sites.map((s: any, i: number) => {
      if (!s.title) throw new Error(`Site #${i + 1} missing 'title'`);
      if (!s.subpath) throw new Error(`Site #${i + 1} missing 'subpath'`);
      if (!s.ghostUrl) throw new Error(`Site #${i + 1} missing 'ghostUrl'`);
      if (!s.ghostApiKey)
        throw new Error(`Site #${i + 1} missing 'ghostApiKey'`);
      return {
        title: s.title,
        subpath: s.subpath.replace(/^\//, "").replace(/\/$/, ""),
        tag: s.tag ?? undefined,
        ghostUrl: s.ghostUrl,
        ghostApiKey: s.ghostApiKey,
        updateFrequency: s.updateFrequency ?? "10m",
        sortOrder: s.sortOrder === "asc" ? "asc" : "desc",
        copyright: s.copyright ?? undefined,
        hostname: s.hostname ?? undefined,
      };
    }),
  };

  // Validate frequencies
  for (const site of config.sites) {
    parseFrequency(site.updateFrequency);
  }

  return config;
}
