import { google } from "googleapis";
import { cache, headingsKey } from "./cache.js";
import { InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";

export const schema = {
  name: "gdrive_get_metadata",
  description:
    "Fetch file metadata; optionally include headings. For outlines, prefer gdrive_list_headings.",
  inputSchema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "ID of the file to inspect",
      },
      includeHeadings: {
        type: "boolean",
        description: "Include headings when file is a Google Doc",
        optional: true,
      },
    },
    required: ["fileId"],
  },
} as const;

type GetMetadataInput = {
  fileId?: string;
  includeHeadings?: boolean;
};

const drive = google.drive("v3");
const docs = google.docs("v1");

type DocHeading = {
  id: string;
  text: string;
  level: number;
};

async function listDocHeadings(documentId: string): Promise<DocHeading[]> {
  const doc = await docs.documents.get({ documentId });
  const content = doc.data.body?.content || [];
  const headings: DocHeading[] = [];

  for (const element of content) {
    const para = element.paragraph;
    const namedStyle = para?.paragraphStyle?.namedStyleType;
    const headingId = para?.paragraphStyle?.headingId;
    if (!namedStyle || !namedStyle.startsWith("HEADING_") || !headingId) {
      continue;
    }

    let text = "";
    if (para?.elements) {
      for (const elem of para.elements) {
        if (elem.textRun?.content) {
          text += elem.textRun.content;
        }
      }
    }
    const cleanText = text.trim();
    if (!cleanText) {
      continue;
    }

    const level = Number.parseInt(namedStyle.replace("HEADING_", ""), 10);
    headings.push({
      id: headingId,
      text: cleanText,
      level: Number.isFinite(level) ? level : 0,
    });
  }

  return headings;
}

export async function getMetadata(args: GetMetadataInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const fileId = args.fileId;
  const includeHeadings = args.includeHeadings ?? true;

  if (!fileId) {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "fileId is required" }, null, 2)
        : "Error: fileId is required";

    return {
      content: [
        {
          type: "text",
          text: errorPayload,
        },
      ],
      isError: true,
    };
  }

  const file = await drive.files.get({
    fileId,
    fields: "mimeType,name,modifiedTime,size",
    supportsAllDrives: true,
  });

  const mimeType = file.data.mimeType || "application/octet-stream";
  const metadata = {
    id: fileId,
    name: file.data.name || fileId,
    mimeType,
    modifiedTime: file.data.modifiedTime || new Date().toISOString(),
    size: file.data.size ? Number(file.data.size) : undefined,
  };

  const response: {
    file: typeof metadata;
    docType?: string;
    headings?: DocHeading[];
    warnings?: string[];
  } = {
    file: metadata,
  };

  if (mimeType === "application/vnd.google-apps.document") {
    response.docType = "document";
    if (includeHeadings) {
      const cacheKey = headingsKey(fileId);
      const cached = cache.getIfFresh(cacheKey, metadata.modifiedTime);
      if (cached) {
        response.headings = JSON.parse(cached) as DocHeading[];
      } else {
        const headings = await listDocHeadings(fileId);
        response.headings = headings;
        cache.set(cacheKey, JSON.stringify(headings), metadata.modifiedTime);
      }
    }
  } else if (includeHeadings) {
    response.warnings = [
      "Headings are only available for Google Docs. This file type is not supported yet.",
    ];
  }

  const payload =
    format === "json"
      ? JSON.stringify(response, null, 2)
      : [
          `id=${metadata.id}`,
          `name=${metadata.name}`,
          `mimeType=${metadata.mimeType}`,
          `modifiedTime=${metadata.modifiedTime}`,
          metadata.size ? `size=${metadata.size}` : null,
        ]
          .filter(Boolean)
          .join("\n");

  return {
    content: [
      {
        type: "text",
        text: payload,
      },
    ],
    isError: false,
  };
}
