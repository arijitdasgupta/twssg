import { watch } from "chokidar";
import { readFileSync, existsSync, statSync } from "fs";
import { join, resolve, extname } from "path";
import type { AppConfig } from "./config";
import { loadConfig } from "./config";
import { buildAllSites } from "./builder";
import { log } from "./log";
import { serializeMetrics } from "./metrics";
import { onShutdown } from "./lifecycle";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
};

const RELOAD_SCRIPT = `
(function() {
  const es = new EventSource("/_dev/events");
  es.onmessage = function() { location.reload(); };
  es.onerror = function() { setTimeout(() => location.reload(), 2000); };
})();
`;

export async function startDevServer(
  appConfig: AppConfig,
  port: number = 3000,
  configPath: string = "config.yaml"
): Promise<void> {
  const outputDir = resolve(appConfig.outputDir);
  let clients: ReadableStreamDefaultController[] = [];
  let currentConfig = appConfig;
  function notifyClients() {
    for (const controller of clients) {
      try {
        controller.enqueue("data: reload\n\n");
      } catch {
        // client disconnected
      }
    }
  }

  // Initial build
  await buildAllSites(currentConfig, true);

  // Watch theme directory for changes and rebuild
  const themeWatcher = watch(resolve("theme"), {
    ignoreInitial: true,
  });

  themeWatcher.on("all", async (_event, _path) => {
    log.info("Theme changed, rebuilding", { component: "dev" });
    await buildAllSites(currentConfig, true);
    notifyClients();
  });

  // Watch config for changes — re-parse and rebuild
  const configWatcher = watch(resolve(configPath), {
    ignoreInitial: true,
  });

  configWatcher.on("change", async () => {
    log.info("Config changed, reloading", { component: "dev" });
    try {
      currentConfig = loadConfig(configPath);
      await buildAllSites(currentConfig, true);
      notifyClients();
    } catch (err: any) {
      log.error("Invalid config", { component: "dev", error: err.message });
    }
  });

  let rebuilding = false;

  const server = Bun.serve({
    port,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      let pathname = url.pathname;

      // Prometheus metrics
      if (pathname === "/metrics") {
        return new Response(serializeMetrics(), {
          headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
        });
      }

      // Rebuild trigger
      if (pathname === "/rebuild" && req.method === "POST") {
        if (rebuilding) {
          return new Response(JSON.stringify({ status: "already_running" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
        rebuilding = true;
        try {
          log.info("Rebuild triggered via HTTP", { component: "dev" });
          await buildAllSites(currentConfig, true);
          notifyClients();
          return new Response(JSON.stringify({ status: "ok" }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ status: "error", error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        } finally {
          rebuilding = false;
        }
      }

      // SSE endpoint for hot reload
      if (pathname === "/_dev/events") {
        const stream = new ReadableStream({
          start(controller) {
            clients.push(controller);
          },
          cancel(controller) {
            clients = clients.filter((c) => c !== controller);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Reload script
      if (pathname.endsWith("/_dev/reload.js")) {
        return new Response(RELOAD_SCRIPT, {
          headers: { "Content-Type": "application/javascript" },
        });
      }

      // Serve static files from output directory
      if (pathname.endsWith("/")) {
        pathname += "index.html";
      }

      const filePath = join(outputDir, pathname);

      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        return Response.redirect(`${pathname}/`, 301);
      }

      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const ext = extname(filePath);
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        const content = readFileSync(filePath);
        return new Response(content, {
          headers: { "Content-Type": contentType },
        });
      }

      // Try with .html extension
      const htmlPath = filePath + ".html";
      if (existsSync(htmlPath)) {
        const content = readFileSync(htmlPath);
        return new Response(content, {
          headers: { "Content-Type": "text/html" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  onShutdown(() => {
    log.info("Stopping dev server", { component: "dev" });
    themeWatcher.close();
    configWatcher.close();
    server.stop();
  });

  log.info("Dev server started", {
    component: "dev",
    port,
    sites: currentConfig.sites.map((s) => ({ title: s.title, url: `http://localhost:${port}/${s.subpath}/` })),
  });
}
