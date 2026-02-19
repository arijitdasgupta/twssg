#!/usr/bin/env bun
import GhostContentAPI from "@tryghost/content-api";
import { loadConfig } from "./config";

const configPath = process.argv[2] || "config.yaml";
const config = loadConfig(configPath);

for (const site of config.sites) {
  const api = new GhostContentAPI({
    url: site.ghostUrl,
    key: site.ghostApiKey,
    version: "v5.0",
  });

  const tags = await api.tags.browse({ limit: "all", include: "count.posts" });

  console.log(`\n${site.title} (${site.ghostUrl})`);
  console.log("─".repeat(40));

  if (!tags.length) {
    console.log("  (no tags)");
    continue;
  }

  for (const tag of tags) {
    const count = (tag as any).count?.posts ?? "?";
    console.log(`  ${tag.name} [${tag.slug}] — ${count} posts`);
  }
}
