# twssg

[![Build and Deploy](https://github.com/arijitdasgupta/twssg/actions/workflows/deploy.yaml/badge.svg)](https://github.com/arijitdasgupta/twssg/actions/workflows/deploy.yaml)

## Totally Wasteful Static Site Generator

### [Nginx](https://nginx.org/) included

[Sample website](https://driftlog.arijitdg.net/nordkapp2025/)

Every other tech savvy person wants to do _Gitops_, and CI/CD and whatnot, but I don't want to "commit" a post while camping somewhere in Scandinavia, cooking soup next to a fjord, smoking a cigarette after riding my bike for six hours. But I do want to write for my friends and family to let them know how sore my legs are. Hence I don't mind the waste of running an entire process just to build a static site every now and then, neither should you maybe.

### Uses [eleventy](https://www.11ty.dev/)

Pulls stuff from Ghost Content API (for now), and builds static files to serve. 95% vibe coded. No custom theming support, yet. You need a [Ghost](https://github.com/TryGhost/Ghost) installation. Ghost is amazing, you should definitely consider it as your blogging backend (and frontend).

Most of the deployments config, such as docker compose and kubernetes manifests, works with my own infrastructure. You would have to adapt it for your needs, or ask Claude, why bother doing it yourself. If anyone asks, I would be happy to write clear instructions on how to deploy and run for a more production-ish setting. But currently I am the only user of this, AFAIK.

Btw, I have added a little section for my rationale behind the design.

### Why did I write it?

I didn't want to modify Ghost themes for custom blog rendering, because people who maintains Ghost themes are far more skilled at that than I am, but sometimes I want a different view of my blog.

### What was I thinking?

Reliance on code editor, CI/CD & a whole set of configuration for blogging takes away the fun of blogging. And don't get me started on editing YAML frontmatter on my tiny phone. I want to just write, compute is cheap and it's not like I want to _code_ to publish a blog post. Gitops is great, but it's for nerds! Am I am a nerd? I sure am, but I will do anything to hide that from my fellow cyclists.

### Important bits

- There's always a subpath in the generated static site. Root level builds aren't supported (yet).
- Best not to use rewrite rules to change the path, all static sites are baked such that it's living right under the base path. Like `example.com/<subpath>`.
- Adds lazy loading of images with the [lazy tag](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Lazy_loading), modifies the HTML coming from Ghost.
- Has the ability to filter out posts by Ghost tags, currently single tag matching is supported.
- No theming support (yet).
- If you are going to use this in CI, don't; use [eleventy](https://github.com/11ty/eleventy) directly.
- No content / media server support.
- Can generate multiple blogs with a single run.
- If you are pairing it with Nginx or Traefik, you can serve multiple blogs on different subpaths and on different hostnames. If you need, ask me how. Or, Claude.
- You can mount `/app/dist` to mount the static sites externally, but that's not how I intended to use it. I plan to use it as part of combo with a file server such as NGINX. The builder runs once on startup and exposes a `/rebuild` HTTP endpoint for on-demand rebuilds (triggered by a Kubernetes CronJob or any HTTP client).

### Contributions?

Want dependabot updates, custom theme support, pushing files to multiple datacenters, S3 support, other CMS backend support? Please create a PR. If you don't, I'll do it, eventually. So far Claude have been the biggest contributor.

### Setup

```bash
bun install
cp config.example.yaml config.yaml
# Edit config.yaml with your Ghost instance details
```

### Configuration

```yaml
outputDir: "./dist"

sites:
  - title: "My Blog"
    subpath: "blog"                      # served at /blog/
    ghostUrl: "https://ghost.example.com"
    ghostApiKey: "abc123..."
    sortOrder: "desc"                    # "desc" (newest first) or "asc" (oldest first)
    copyright: "2025 Your Name"          # optional, shown in footer as © 2025 Your Name

  - title: "Tech Articles"
    subpath: "tech"
    tag: "tech"                          # filter to posts with this tag
    ghostUrl: "https://ghost.example.com"
    ghostApiKey: "abc123..."
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `title` | yes | — | Site title shown in header |
| `subpath` | yes | — | URL prefix and output directory name |
| `ghostUrl` | yes | — | Ghost instance URL |
| `ghostApiKey` | yes | — | Ghost Content API key |
| `tag` | no | all posts | Filter posts by Ghost tag |
| `sortOrder` | no | `desc` | Post sort order by publish date |
| `copyright` | no | hidden | Footer copyright notice |
| `hostname` | no | — | Nginx vhost server name for production |

Configuration can be provided in two ways:

- **File** (default) — `config.yaml` on disk, or pass `--config <path>`
- **Environment variable** — set `TWSSG_CONFIG` to the base64-encoded YAML. Takes priority over file.

```bash
# Kubernetes: create secret from config.yaml
kubectl -n websites create secret generic twssg-config \
  --from-literal=config="$(base64 < config.yaml)"
```

### Usage

### Start (production)

```bash
bun run start
```

Builds all sites once, then stays alive serving Prometheus metrics on `:9091` and a `POST /rebuild` endpoint for on-demand rebuilds. Pair with NGINX to serve `dist/`.

In Kubernetes, a CronJob triggers rebuilds on schedule:

```yaml
# Example: rebuild every 20 minutes
schedule: "*/20 * * * *"
command: ["curl", "-sf", "-X", "POST", "http://twssg.apps.svc.cluster.local:9091/rebuild"]
```

### Dev mode (hot reload)

```bash
bun run dev
# custom port
bun run src/cli.ts dev --port 4000
```

Watches theme files and config for changes, rebuilds automatically on any change.

### List tags

```bash
bun run src/list-tags.ts
```

Lists all Ghost tags and their post counts for each configured site. Useful for finding the right tag slug to use in `config.yaml`.

### Docker

```bash
# Static build + NGINX
docker compose up web

# With cron runner
docker compose up

# Build image only
docker build -t twssg .
docker run -p 8080:80 twssg
```

### Getting a Ghost Content API key

1. In your Ghost admin panel, go to **Settings → Integrations**.
2. Click **Add custom integration** and give it a name (e.g. "twssg").
3. Ghost will generate a **Content API Key** — copy it.
4. The **API URL** is your Ghost instance URL (e.g. `https://ghost.example.com`).
5. Use the Content API Key as `ghostApiKey` and the URL as `ghostUrl` in your `config.yaml`.

The Content API key is read-only and only exposes published content — it cannot modify your site.

### Afterthoughts

- Wanted to call the project Ghostpress, but it was too late and too specific.
- Might add a [micro.pub](https://micropub.spec.indieweb.org/) endpoint.
