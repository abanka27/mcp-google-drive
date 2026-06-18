#!/usr/bin/env node
import "../core/loadenv.js"; // must precede auth.js (reads env at import time)
import { getValidCredentials } from "../auth.js";
import { ArgError, parseArgs } from "../cli/args.js";
import { helpText, resolveCommand, usageText } from "../cli/registry.js";

// Exit quietly when a downstream reader (head, grep, less) closes the pipe.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // Help: bare invocation, or `--help`/`-h` anywhere.
  const helpIndex = argv.findIndex((a) => a === "--help" || a === "-h");
  if (argv.length === 0) {
    process.stdout.write(helpText() + "\n");
    return;
  }
  if (helpIndex >= 0) {
    const path = argv.slice(0, helpIndex).filter((a) => !a.startsWith("-"));
    process.stdout.write((usageText(path) ?? helpText()) + "\n");
    return;
  }

  // Resolve + parse before authenticating, so unknown commands and bad flags
  // fail fast without a network/auth round-trip.
  const resolved = resolveCommand(argv);
  if ("error" in resolved) {
    process.stderr.write(resolved.error + "\n\n" + helpText() + "\n");
    process.exitCode = 2;
    return;
  }
  const parsed = parseArgs(resolved.rest, resolved.command.flags);

  // Auth once per invocation: loads the cached token from disk, refreshes if
  // stale, and prompts interactively only on first run / revoked token.
  await getValidCredentials();
  await resolved.command.run(parsed);
}

main().catch((error) => {
  if (error instanceof ArgError) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
