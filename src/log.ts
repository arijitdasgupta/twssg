type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry): void {
  const stream = entry.level === "error" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + "\n");
}

function now(): string {
  return new Date().toISOString();
}

export const log = {
  debug(msg: string, labels?: Record<string, unknown>) {
    emit({ ts: now(), level: "debug", msg, ...labels });
  },
  info(msg: string, labels?: Record<string, unknown>) {
    emit({ ts: now(), level: "info", msg, ...labels });
  },
  warn(msg: string, labels?: Record<string, unknown>) {
    emit({ ts: now(), level: "warn", msg, ...labels });
  },
  error(msg: string, labels?: Record<string, unknown>) {
    emit({ ts: now(), level: "error", msg, ...labels });
  },
};
