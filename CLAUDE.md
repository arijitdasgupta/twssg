# CLAUDE.md

## Project

twssg — Ghost Content API → static Eleventy sites, served from subpaths.

## Runtime

Bun (not Node.js). Use `bun run`, `bun install`, `bun test`.

## Commands

- `bun run start` — production mode: build all sites, keep rebuilding on schedule, metrics on :9091
- `bun run dev` — dev server with SSE hot reload on :3000
- `bun run src/list-tags.ts` — list all Ghost tags per configured site
- `bun run src/check-tags.ts` — find posts missing a specific tag

## Architecture

- Eleventy v3 used purely via programmatic API — no `.eleventy.js` on disk
- SCSS compiled in builder via `sass.compile()`, CSS written directly to output dir
- `.twssg-work/<subpath>/` is scratch space, wiped each build
- `dist/<subpath>/` is final output
- Theme in `theme/` is shared across all sites
- `config.yaml` has real credentials — gitignored. `config.example.yaml` is committed.

## Key patterns

- SCSS uses `@use` modules (not deprecated `@import`), variables in `_variables.scss`
- Fonts: Baskervville (Google Fonts) for headings, Georgia for body text
- `$font-heading` for titles, `$font-serif` for body, `$font-sans` for UI elements
- JSON structured logging (Loki-compatible) via `src/log.ts`
- Hand-rolled Prometheus metrics via `src/metrics.ts`
- Graceful shutdown with build draining via `src/lifecycle.ts`
- Images get `loading="lazy"` injected via string replace on Ghost HTML
- Homepage has two separate nav components: desktop (sticky sidebar) and mobile (hamburger overlay)

## Config fields (per site)

`title`, `subpath`, `ghostUrl`, `ghostApiKey` (required)
`tag`, `updateFrequency`, `sortOrder`, `copyright`, `hostname` (optional)

## Testing

Run `bun run build` after changes to verify. No test suite yet.
Dev server: `bun run dev` watches theme/ and config for live reload.

## Style

- Newspaper aesthetic: narrow column (32rem), twin columns at ≥960px
- Desktop nav sidebar at ≥1280px, main widens to 64rem + 16rem nav
- No external logging/metrics libraries — keep it lightweight
