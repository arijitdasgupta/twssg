interface HistogramBucket {
  le: string;
  count: number;
}

interface Metric {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
}

interface LabelSet {
  [key: string]: string;
}

function labelStr(labels: LabelSet): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}

const HISTOGRAM_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

class Counter {
  private values = new Map<string, number>();
  constructor(
    public name: string,
    public help: string
  ) {}

  inc(labels: LabelSet = {}, value: number = 1) {
    const key = labelStr(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  serialize(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    for (const [labels, value] of this.values) {
      lines.push(`${this.name}${labels} ${value}`);
    }
    return lines.join("\n");
  }
}

class Gauge {
  private values = new Map<string, number>();
  constructor(
    public name: string,
    public help: string
  ) {}

  set(labels: LabelSet, value: number) {
    this.values.set(labelStr(labels), value);
  }

  serialize(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
    ];
    for (const [labels, value] of this.values) {
      lines.push(`${this.name}${labels} ${value}`);
    }
    return lines.join("\n");
  }
}

class Histogram {
  private observations = new Map<
    string,
    { buckets: number[]; sum: number; count: number }
  >();

  constructor(
    public name: string,
    public help: string,
    public buckets: number[] = HISTOGRAM_BUCKETS
  ) {}

  observe(labels: LabelSet, value: number) {
    const key = labelStr(labels);
    let data = this.observations.get(key);
    if (!data) {
      data = { buckets: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.observations.set(key, data);
    }
    data.sum += value;
    data.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        data.buckets[i] += 1;
      }
    }
  }

  serialize(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const [labelsStr, data] of this.observations) {
      const baseLabels = labelsStr.slice(1, -1);
      for (let i = 0; i < this.buckets.length; i++) {
        const bucketLabels = baseLabels
          ? `{${baseLabels},le="${this.buckets[i]}"}`
          : `{le="${this.buckets[i]}"}`;
        lines.push(`${this.name}_bucket${bucketLabels} ${data.buckets[i]}`);
      }
      const infLabels = baseLabels
        ? `{${baseLabels},le="+Inf"}`
        : `{le="+Inf"}`;
      lines.push(`${this.name}_bucket${infLabels} ${data.count}`);
      lines.push(`${this.name}_sum${labelsStr} ${data.sum}`);
      lines.push(`${this.name}_count${labelsStr} ${data.count}`);
    }
    return lines.join("\n");
  }
}

export const metrics = {
  buildDuration: new Histogram(
    "twssg_build_duration_seconds",
    "Time to build a site in seconds"
  ),
  fetchDuration: new Histogram(
    "twssg_fetch_duration_seconds",
    "Time to fetch posts from Ghost in seconds"
  ),
  buildTotal: new Counter(
    "twssg_builds_total",
    "Total number of builds"
  ),
  buildErrors: new Counter(
    "twssg_build_errors_total",
    "Total number of build errors"
  ),
  fetchErrors: new Counter(
    "twssg_fetch_errors_total",
    "Total number of Ghost fetch errors"
  ),
  postsCount: new Gauge(
    "twssg_posts_count",
    "Number of posts fetched per site"
  ),
  lastBuildTimestamp: new Gauge(
    "twssg_last_build_timestamp_seconds",
    "Unix timestamp of last successful build"
  ),
};

export function serializeMetrics(): string {
  return [
    metrics.buildDuration.serialize(),
    metrics.fetchDuration.serialize(),
    metrics.buildTotal.serialize(),
    metrics.buildErrors.serialize(),
    metrics.fetchErrors.serialize(),
    metrics.postsCount.serialize(),
    metrics.lastBuildTimestamp.serialize(),
  ].join("\n\n") + "\n";
}

export function startMetricsServer(port: number = 9091, onRebuild?: () => Promise<void>): void {
  let rebuilding = false;
  Bun.serve({
    port,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/metrics") {
        return new Response(serializeMetrics(), {
          headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
        });
      }
      if (url.pathname === "/rebuild" && req.method === "POST" && onRebuild) {
        if (rebuilding) {
          return new Response(JSON.stringify({ status: "already_running" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
        rebuilding = true;
        try {
          await onRebuild();
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
      return new Response("Not Found", { status: 404 });
    },
  });
}
