import GhostContentAPI from "@tryghost/content-api";
import type { SiteConfig } from "./config";

export interface GhostPost {
  id: string;
  slug: string;
  title: string;
  html: string;
  excerpt: string;
  feature_image: string | null;
  published_at: string;
  updated_at: string;
  tags: { name: string; slug: string }[];
  authors: { name: string; slug: string }[];
  custom_excerpt: string | null;
}

export interface GhostPage {
  id: string;
  slug: string;
  title: string;
  html: string;
}

export async function fetchPosts(site: SiteConfig): Promise<GhostPost[]> {
  const api = new GhostContentAPI({
    url: site.ghostUrl,
    key: site.ghostApiKey,
    version: "v5.0",
  });

  const options: any = {
    limit: "all",
    include: ["tags", "authors"],
  };

  if (site.tag) {
    options.filter = `tag:${site.tag}`;
  }

  const posts = await api.posts.browse(options);
  return posts as unknown as GhostPost[];
}

export async function fetchPages(site: SiteConfig): Promise<GhostPage[]> {
  const api = new GhostContentAPI({
    url: site.ghostUrl,
    key: site.ghostApiKey,
    version: "v5.0",
  });

  const pages = await api.pages.browse({ limit: "all" });
  return pages as unknown as GhostPage[];
}
