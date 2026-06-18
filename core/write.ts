import { google } from "googleapis";
import { Readable } from "node:stream";
import { DOC_MIME } from "./types.js";

const drive = google.drive("v3");

export interface CreatedDoc {
  id: string;
  name: string;
  url: string;
}

function docUrl(id: string): string {
  return `https://docs.google.com/document/d/${id}/edit`;
}

/**
 * Create a new Google Doc from Markdown via Drive's native Markdown import.
 * Text and structure (headings, lists, tables, links) convert; embedded
 * images are not carried over (see countMarkdownImages / caller warnings).
 */
export async function createDocFromMarkdown(name: string, markdown: string): Promise<CreatedDoc> {
  const res = await drive.files.create({
    requestBody: { name, mimeType: DOC_MIME },
    media: { mimeType: "text/markdown", body: Readable.from([markdown]) },
    fields: "id,name",
    supportsAllDrives: true,
  });
  const id = res.data.id!;
  return { id, name: res.data.name || name, url: docUrl(id) };
}

/**
 * Replace an existing Google Doc's entire content from Markdown. This is a
 * full-body overwrite: it does not preserve anchored comments or embedded
 * images. The file ID and URL are unchanged.
 */
export async function updateDocFromMarkdown(fileId: string, markdown: string): Promise<CreatedDoc> {
  const res = await drive.files.update({
    fileId,
    media: { mimeType: "text/markdown", body: Readable.from([markdown]) },
    fields: "id,name",
    supportsAllDrives: true,
  });
  return { id: fileId, name: res.data.name || fileId, url: docUrl(fileId) };
}

/**
 * Remove Markdown image references whose source is not an http(s) URL.
 *
 * Drive's Markdown importer returns a 500 when it cannot fetch an image
 * source (e.g. a local/relative path like `./diagram.png`), so these must be
 * stripped before import. Public image URLs are kept — Drive fetches and
 * embeds them. Returns the cleaned Markdown plus counts for warnings.
 */
export function stripLocalImages(markdown: string): {
  markdown: string;
  stripped: number;
  kept: number;
} {
  let stripped = 0;
  let kept = 0;
  const cleaned = markdown.replace(/!\[[^\]]*\]\(([^)]*)\)/g, (match, src: string) => {
    if (/^https?:\/\//i.test(src.trim())) {
      kept += 1;
      return match;
    }
    stripped += 1;
    return "";
  });
  return { markdown: cleaned, stripped, kept };
}
