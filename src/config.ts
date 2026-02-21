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
  sortOrder: SortOrder;
  copyright?: string;
  hostname?: string;
}

export interface AppConfig {
  outputDir: string;
  sites: SiteConfig[];
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
        sortOrder: s.sortOrder === "asc" ? "asc" : "desc",
        copyright: s.copyright ?? undefined,
        hostname: s.hostname ?? undefined,
      };
    }),
  };

  return config;
}
