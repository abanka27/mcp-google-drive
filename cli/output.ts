/**
 * Output helpers. Commands write content to stdout (so callers redirect with
 * `>` or pipe through other tools); structured/auxiliary data goes to stderr
 * or behind `--json`. There is deliberately no `--out` flag — shell
 * redirection is the idiomatic way to write a file.
 */

/** Print a JSON value to stdout. */
export function emitJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

/** Print plain text to stdout, ensuring a single trailing newline. */
export function emitText(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

/**
 * Write raw bytes to stdout. Refuses to dump binary onto an interactive
 * terminal (the curl/wget convention) — the caller should redirect or pipe.
 * Returns false if it declined to write.
 */
export function emitBytes(bytes: Buffer): boolean {
  if (process.stdout.isTTY) {
    process.stderr.write(
      "refusing to write binary content to the terminal; redirect to a file " +
        "(e.g. '> out.bin') or pipe it.\n",
    );
    process.exitCode = 2;
    return false;
  }
  process.stdout.write(bytes);
  return true;
}
