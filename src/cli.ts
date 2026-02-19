#!/usr/bin/env bun
import { Command } from "commander";
import { loadConfig } from "./config";
import { runCron } from "./scheduler";
import { startDevServer } from "./dev-server";
import { installSignalHandlers } from "./lifecycle";

installSignalHandlers();

const program = new Command();

program
  .name("twssg")
  .description("Ghost → Static Site Generator using Eleventy")
  .version("0.1.0");

program
  .command("start")
  .description("Build all sites and keep rebuilding on schedule")
  .option("-c, --config <path>", "Path to config file", "config.yaml")
  .option("-m, --metrics-port <number>", "Prometheus metrics port", "9091")
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    await runCron(config, parseInt(opts.metricsPort, 10));
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
