/** Shared domain types for the Drive/Docs/Sheets core. */

export interface FileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: number;
}

/**
 * Content of a Drive file. Text-bearing files (exported Docs, CSV, plain
 * text, JSON) populate `text`; binary files (images, PDFs, Drawings exported
 * to PNG) populate `bytes`. Exactly one is set.
 */
export interface FileContent {
  /** MIME type of the returned content (the export type for Workspace files). */
  mimeType: string;
  text?: string;
  bytes?: Buffer;
}

export interface DocHeading {
  id: string;
  text: string;
  level: number;
}

/**
 * One embedded image found in a Google Doc. `contentUri` is a short-lived
 * (~30 min) authenticated URL; fetch it promptly if the bytes are needed.
 */
export interface DocImage {
  objectId: string;
  contentUri: string | null;
  altText: string | null;
  mimeType: string | null;
  widthPt: number | null;
  heightPt: number | null;
}

export const DOC_MIME = "application/vnd.google-apps.document";
export const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export const SLIDES_MIME = "application/vnd.google-apps.presentation";
export const DRAWING_MIME = "application/vnd.google-apps.drawing";
