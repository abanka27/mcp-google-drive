/**
 * Parsing of Google Docs/Drive URLs into identifiers.
 *
 * This is the single source of truth for URL parsing, shared by the CLI and
 * the MCP tools. It supersedes the two divergent parsers that previously lived
 * in gdrive_read_file.ts (broad) and gdrive_parse_link.ts (docs-only).
 */

export type DocType = "document" | "spreadsheet" | "presentation" | "file" | "unknown";

export interface ParsedLink {
  fileId: string;
  headingId: string | null;
  docType: DocType;
}

const ID_PATTERNS: Array<{ pattern: RegExp; docType: DocType }> = [
  { pattern: /\/document\/d\/([a-zA-Z0-9_-]+)/, docType: "document" },
  { pattern: /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/, docType: "spreadsheet" },
  { pattern: /\/presentation\/d\/([a-zA-Z0-9_-]+)/, docType: "presentation" },
  { pattern: /\/file\/d\/([a-zA-Z0-9_-]+)/, docType: "file" },
  { pattern: /[?&]id=([a-zA-Z0-9_-]+)/, docType: "unknown" },
];

/** Bare Drive file IDs are alphanumeric with - and _, and reasonably long. */
const BARE_ID = /^[a-zA-Z0-9_-]{20,}$/;

/**
 * Parse a Google URL into a fileId (+ optional heading anchor and inferred
 * docType). Returns null if no file ID can be extracted.
 */
export function parseLink(url: string): ParsedLink | null {
  for (const { pattern, docType } of ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      const headingMatch = url.match(/#heading=([a-zA-Z0-9_.]+)/);
      return { fileId: match[1], headingId: headingMatch?.[1] ?? null, docType };
    }
  }
  return null;
}

/**
 * Accept either a raw file ID or a URL and return the file ID (+ heading
 * anchor). Used by commands that take an `<id|url>` positional argument.
 */
export function resolveFileRef(idOrUrl: string): { fileId: string; headingId: string | null } {
  const trimmed = idOrUrl.trim();
  const parsed = parseLink(trimmed);
  if (parsed) {
    return { fileId: parsed.fileId, headingId: parsed.headingId };
  }
  if (BARE_ID.test(trimmed)) {
    return { fileId: trimmed, headingId: null };
  }
  throw new Error(`Not a recognizable Drive file ID or URL: ${idOrUrl}`);
}
