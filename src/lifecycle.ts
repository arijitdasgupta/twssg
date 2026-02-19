import { log } from "./log";

type ShutdownHook = () => void | Promise<void>;

let shutdownRequested = false;
let activeBuilds = 0;
let shutdownResolve: (() => void) | null = null;
const hooks: ShutdownHook[] = [];

export function isShuttingDown(): boolean {
  return shutdownRequested;
}

export function buildStart(): void {
  activeBuilds++;
}

export function buildEnd(): void {
  activeBuilds--;
  if (shutdownRequested && activeBuilds === 0 && shutdownResolve) {
    shutdownResolve();
  }
}

export function onShutdown(hook: ShutdownHook): void {
  hooks.push(hook);
}

async function shutdown(signal: string): Promise<void> {
  if (shutdownRequested) return;
  shutdownRequested = true;
  log.info("Shutdown requested, waiting for active builds to finish", { signal, activeBuilds });

  if (activeBuilds > 0) {
    await new Promise<void>((resolve) => {
      shutdownResolve = resolve;
    });
  }

  log.info("Running shutdown hooks", { count: hooks.length });
  for (const hook of hooks) {
    try {
      await hook();
    } catch (err: any) {
      log.error("Shutdown hook failed", { error: err.message });
    }
  }

  log.info("Shutdown complete");
  process.exit(0);
}

export function installSignalHandlers(): void {
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
