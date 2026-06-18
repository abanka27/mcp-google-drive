import { google } from "googleapis";

const drive = google.drive("v3");

export interface CommentReply {
  author: string | null;
  content: string;
  createdTime: string;
}

export interface DocComment {
  id: string;
  author: string | null;
  content: string;
  /** The document text the comment is anchored to, if any. */
  quotedText: string | null;
  resolved: boolean;
  createdTime: string;
  modifiedTime: string;
  replies: CommentReply[];
}

/**
 * List comments on a Drive file (Docs/Sheets/Slides) via the Drive comments
 * API, including reply threads and the quoted anchor text. Resolved comments
 * are excluded unless requested. Paginates to completion.
 */
export async function listComments(
  fileId: string,
  includeResolved = false,
): Promise<DocComment[]> {
  const fields =
    "nextPageToken,comments(id,author/displayName,content,quotedFileContent/value," +
    "resolved,createdTime,modifiedTime,replies(author/displayName,content,createdTime))";

  const out: DocComment[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.comments.list({
      fileId,
      fields,
      pageSize: 100,
      pageToken,
      includeDeleted: false,
    });
    for (const c of res.data.comments ?? []) {
      if (c.resolved && !includeResolved) {
        continue;
      }
      out.push({
        id: c.id ?? "",
        author: c.author?.displayName ?? null,
        content: c.content ?? "",
        quotedText: c.quotedFileContent?.value ?? null,
        resolved: Boolean(c.resolved),
        createdTime: c.createdTime ?? "",
        modifiedTime: c.modifiedTime ?? "",
        replies: (c.replies ?? []).map((r) => ({
          author: r.author?.displayName ?? null,
          content: r.content ?? "",
          createdTime: r.createdTime ?? "",
        })),
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return out;
}
