import fs from "node:fs";
import path from "node:path";

/**
 * Load a .env file into process.env using Node's built-in parser
 * (process.loadEnvFile, stable since Node 22). Silently no-ops when the file
 * is absent, matching the previous `dotenv/config` behavior without the
 * external dependency.
 */
export function loadEnv(file = ".env"): void {
  const resolved = path.resolve(file);
  if (fs.existsSync(resolved)) {
    process.loadEnvFile(resolved);
  }
}
