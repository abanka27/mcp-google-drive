import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Fixed config/credentials home for the CLI and server, independent of the
 * current working directory: $XDG_CONFIG_HOME/mcp-gdrive (or ~/.config/...).
 * This is the default location for .env, OAuth keys, and the saved token.
 */
export function configHome(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "mcp-gdrive");
}

/**
 * Load a .env into process.env via Node's built-in parser (stable since
 * Node 22). Prefers a .env in the current directory (developer convenience
 * when run from the repo) and otherwise falls back to the config home, so the
 * `gdrive` CLI works from any directory. No-ops when neither exists; real
 * shell environment variables always take precedence.
 */
export function loadEnv(): void {
  const candidates = [path.resolve(".env"), path.join(configHome(), ".env")];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
  }
}
