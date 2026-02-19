import { parseFrequencyMs, loadConfig, type AppConfig } from "./config";
import { buildSite, buildAllSites } from "./builder";
import { log } from "./log";
import { startMetricsServer } from "./metrics";
import { onShutdown } from "./lifecycle";

export async function runCron(appConfig: AppConfig, metricsPort: number = 9091): Promise<void> {
  log.info("Starting cron scheduler");

  startMetricsServer(metricsPort);
  log.info("Metrics server started", { port: metricsPort, endpoint: `/metrics` });

  await buildAllSites(appConfig);

  const timers: ReturnType<typeof setInterval>[] = [];

  for (const site of appConfig.sites) {
    const intervalMs = parseFrequencyMs(site.updateFrequency);
    log.info("Scheduling site refresh", { site: site.title, frequency: site.updateFrequency, intervalMs });

    const timer = setInterval(async () => {
      log.info("Cron updating site", { site: site.title });
      try {
        await buildSite(site, appConfig);
      } catch (err: any) {
        log.error("Cron update failed", { site: site.title, error: err.message });
      }
    }, intervalMs);
    timers.push(timer);
  }

  onShutdown(() => {
    log.info("Clearing cron timers", { count: timers.length });
    for (const timer of timers) {
      clearInterval(timer);
    }
  });

  log.info("Cron scheduler running");
}
