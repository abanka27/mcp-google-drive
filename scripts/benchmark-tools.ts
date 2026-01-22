import "dotenv/config";
import { performance } from "node:perf_hooks";
import { getValidCredentials } from "../auth.js";
import { search } from "../tools/gdrive_search.js";
import { readFile } from "../tools/gdrive_read_file.js";

type RunResult = {
  label: string;
  durationMs: number;
  responseBytes: number;
};

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function summarize(label: string, durations: number[], sizes: number[]) {
  const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return {
    label,
    runs: durations.length,
    avgMs: Math.round(avg * 100) / 100,
    p95Ms: Math.round(percentile(durations, 95) * 100) / 100,
    minMs: Math.round(Math.min(...durations) * 100) / 100,
    maxMs: Math.round(Math.max(...durations) * 100) / 100,
    avgBytes: Math.round(sizes.reduce((sum, value) => sum + value, 0) / sizes.length),
  };
}

async function runOnce(label: string, fn: () => Promise<string>): Promise<RunResult> {
  const start = performance.now();
  const output = await fn();
  const end = performance.now();

  return {
    label,
    durationMs: Math.round((end - start) * 100) / 100,
    responseBytes: byteLength(output),
  };
}

async function runSearch(query: string, format: "json" | "text"): Promise<string> {
  process.env.MCP_GDRIVE_OUTPUT_FORMAT = format;
  const result = await search({ query, pageSize: 10 });
  return result.content[0]?.text || "";
}

async function runReadFile(
  fileId: string,
  format: "json" | "text",
  sectionHeading?: string,
): Promise<string> {
  process.env.MCP_GDRIVE_OUTPUT_FORMAT = format;
  const result = await readFile({ fileId, sectionHeading });
  return result.content[0]?.text || "";
}

async function main() {
  const query = process.env.BENCH_QUERY || "report";
  const fileId = process.env.BENCH_FILE_ID;
  const runs = Number.parseInt(process.env.BENCH_RUNS || "5", 10);
  const warmups = Number.parseInt(process.env.BENCH_WARMUPS || "2", 10);
  const sectionHeading = process.env.BENCH_SECTION_HEADING;

  if (!fileId) {
    console.error("Missing BENCH_FILE_ID env var");
    process.exit(1);
  }
  if (!Number.isFinite(runs) || runs < 1) {
    console.error("BENCH_RUNS must be a positive integer");
    process.exit(1);
  }
  if (!Number.isFinite(warmups) || warmups < 0) {
    console.error("BENCH_WARMUPS must be a non-negative integer");
    process.exit(1);
  }

  await getValidCredentials();

  const series = [
    { label: "search:text", fn: () => runSearch(query, "text") },
    { label: "search:json", fn: () => runSearch(query, "json") },
    {
      label: "read:text",
      fn: () => runReadFile(fileId, "text", sectionHeading),
    },
    {
      label: "read:json",
      fn: () => runReadFile(fileId, "json", sectionHeading),
    },
  ];

  const summaries = [];
  for (const { label, fn } of series) {
    for (let i = 0; i < warmups; i += 1) {
      await fn();
    }
    const durations: number[] = [];
    const sizes: number[] = [];
    for (let i = 0; i < runs; i += 1) {
      const result = await runOnce(label, fn);
      durations.push(result.durationMs);
      sizes.push(result.responseBytes);
    }
    summaries.push(summarize(label, durations, sizes));
  }

  console.table(summaries);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
