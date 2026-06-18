import { google } from "googleapis";
import {
  DOC_MIME,
  DRAWING_MIME,
  FileContent,
  FileMetadata,
  SHEET_MIME,
  SLIDES_MIME,
} from "./types.js";

const drive = google.drive("v3");

/** Fetch lightweight file metadata (also used for cache/freshness checks). */
export async function getFileMetadata(fileId: string): Promise<FileMetadata> {
  const file = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,modifiedTime,size",
    supportsAllDrives: true,
  });
  return {
    id: file.data.id || fileId,
    name: file.data.name || fileId,
    mimeType: file.data.mimeType || "application/octet-stream",
    modifiedTime: file.data.modifiedTime || new Date().toISOString(),
    size: file.data.size ? Number(file.data.size) : undefined,
  };
}

/**
 * Map a Google Workspace MIME type to the export format we read it as.
 * Returns null for non-Workspace files (which are downloaded directly).
 */
function exportTypeFor(mimeType: string): string | null {
  switch (mimeType) {
    case DOC_MIME:
      return "text/markdown";
    case SHEET_MIME:
      return "text/csv";
    case SLIDES_MIME:
      return "text/plain";
    case DRAWING_MIME:
      return "image/png";
    default:
      return mimeType.startsWith("application/vnd.google-apps.") ? "text/plain" : null;
  }
}

function isTextExport(exportMime: string): boolean {
  return (
    exportMime.startsWith("text/") ||
    exportMime === "application/json"
  );
}

/**
 * Read a file's content. Workspace files are exported (Docs->Markdown,
 * Sheets->CSV, Slides->text, Drawings->PNG); other files are downloaded
 * verbatim. Binary results (PNG, PDFs, images) come back as `bytes`; text
 * results as `text`.
 */
export async function readFileContent(metadata: FileMetadata): Promise<FileContent> {
  const exportMime = exportTypeFor(metadata.mimeType);

  if (exportMime) {
    if (isTextExport(exportMime)) {
      const res = await drive.files.export(
        { fileId: metadata.id, mimeType: exportMime },
        { responseType: "text" },
      );
      return { mimeType: exportMime, text: res.data as string };
    }
    // Binary export (e.g. Drawing -> PNG): must read as bytes, not text,
    // or the image is corrupted by UTF-8 decoding.
    const res = await drive.files.export(
      { fileId: metadata.id, mimeType: exportMime },
      { responseType: "arraybuffer" },
    );
    return { mimeType: exportMime, bytes: Buffer.from(res.data as ArrayBuffer) };
  }

  // Non-Workspace file: download bytes directly.
  const res = await drive.files.get(
    { fileId: metadata.id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  const bytes = Buffer.from(res.data as ArrayBuffer);
  const isText =
    metadata.mimeType.startsWith("text/") || metadata.mimeType === "application/json";
  return isText
    ? { mimeType: metadata.mimeType, text: bytes.toString("utf-8") }
    : { mimeType: metadata.mimeType, bytes };
}

export interface SearchOptions {
  query: string;
  pageToken?: string;
  pageSize?: number;
  /** Restrict results to a Workspace type. */
  type?: "docs" | "sheets";
}

export interface SearchResult {
  files: FileMetadata[];
  nextPageToken: string | null;
}

/** Search Drive by file name / full text, optionally filtered by type. */
export async function searchFiles(opts: SearchOptions): Promise<SearchResult> {
  const userQuery = opts.query.trim();
  const clauses: string[] = ["trashed = false"];

  if (userQuery) {
    const escaped = userQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    clauses.push(`(name contains '${escaped}' or fullText contains '${escaped}')`);
  }
  if (opts.type === "docs") {
    clauses.push(`mimeType = '${DOC_MIME}'`);
  } else if (opts.type === "sheets") {
    clauses.push(`mimeType = '${SHEET_MIME}'`);
  }

  const res = await drive.files.list({
    q: clauses.join(" and "),
    pageSize: opts.pageSize && opts.pageSize > 0 ? Math.min(opts.pageSize, 100) : 10,
    pageToken: opts.pageToken,
    orderBy: "modifiedTime desc",
    fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
  });

  const files: FileMetadata[] = (res.data.files || []).map((f) => ({
    id: f.id || "",
    name: f.name || "",
    mimeType: f.mimeType || "application/octet-stream",
    modifiedTime: f.modifiedTime || "",
    size: f.size ? Number(f.size) : undefined,
  }));

  return { files, nextPageToken: res.data.nextPageToken || null };
}
