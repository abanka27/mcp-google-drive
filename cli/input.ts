import fs from "node:fs";
import { ArgError } from "./args.js";

/** Read all of stdin as a UTF-8 string. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Resolve Markdown input from a `--from FILE` flag or, absent that, piped
 * stdin. Errors if neither is available (e.g. run interactively with no file).
 */
export async function readMarkdownInput(from?: string): Promise<string> {
  if (from) {
    return fs.readFileSync(from, "utf-8");
  }
  if (process.stdin.isTTY) {
    throw new ArgError("provide markdown via --from FILE or pipe it on stdin");
  }
  return readStdin();
}
