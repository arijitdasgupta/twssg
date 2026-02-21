#!/usr/bin/env bun
import { Command } from "commander";
import { loadConfig } from "./config";
import { buildAllSites } from "./builder";
import { startDevServer } from "./dev-server";
import { startMetricsServer } from "./metrics";
import { installSignalHandlers } from "./lifecycle";
import { log } from "./log";

installSignalHandlers();

const program = new Command();

program
  .name("twssg")
  .description("Ghost → Static Site Generator using Eleventy")
  .version("0.1.0");

program
  .command("start")
  .description("Build all sites, then serve metrics and a /rebuild trigger")
  .option("-c, --config <path>", "Path to config file", "config.yaml")
  .option("-m, --metrics-port <number>", "Prometheus metrics port", "9091")
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    const metricsPort = parseInt(opts.metricsPort, 10);

    startMetricsServer(metricsPort, async () => {
      log.info("Rebuild triggered via HTTP");
      await buildAllSites(config);
    });
    log.info("Metrics server started", { port: metricsPort, endpoints: ["/metrics", "POST /rebuild"] });

    await buildAllSites(config);
    log.info("Initial build complete, waiting for rebuild triggers");
  });

program
  .command("dev")
  .description("Start dev server with hot reload")
  .option("-c, --config <path>", "Path to config file", "config.yaml")
  .option("-p, --port <number>", "Dev server port", "3000")
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    await startDevServer(config, parseInt(opts.port, 10), opts.config);
  });

program.parse();
