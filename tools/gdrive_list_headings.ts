import { google } from "googleapis";
import { cache, headingsKey } from "./cache.js";
import { InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";

export const schema = {
  name: "gdrive_list_headings",
  description:
    "List headings for a Google Doc. Use this to build an outline before reading sections.",
  inputSchema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "ID of the Google Doc to inspect",
      },
      minLevel: {
        type: "number",
        description: "Minimum heading level to include (e.g., 2 for H2+)",
        optional: true,
      },
      maxLevel: {
        type: "number",
        description: "Maximum heading level to include (e.g., 3 for up to H3)",
        optional: true,
      },
    },
    required: ["fileId"],
  },
} as const;

type ListHeadingsInput = {
  fileId?: string;
  minLevel?: number;
  maxLevel?: number;
};

type DocHeading = {
  id: string;
  text: string;
  level: number;
};

const drive = google.drive("v3");
const docs = google.docs("v1");

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

export async function listHeadings(args: ListHeadingsInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const fileId = args.fileId;
  const minLevel = args.minLevel;
  const maxLevel = args.maxLevel;

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
    fields: "mimeType,name,modifiedTime",
    supportsAllDrives: true,
  });

  const metadata = {
    id: fileId,
    name: file.data.name || fileId,
    mimeType: file.data.mimeType || "application/octet-stream",
    modifiedTime: file.data.modifiedTime || new Date().toISOString(),
  };

  const response: {
    file: typeof metadata;
    headings?: DocHeading[];
    warnings?: string[];
  } = {
    file: metadata,
  };

  if (metadata.mimeType === "application/vnd.google-apps.document") {
    const cacheKey = headingsKey(fileId);
    const cached = cache.getIfFresh(cacheKey, metadata.modifiedTime);
    if (cached) {
      response.headings = JSON.parse(cached) as DocHeading[];
    } else {
      const headings = await listDocHeadings(fileId);
      response.headings = headings;
      cache.set(cacheKey, JSON.stringify(headings), metadata.modifiedTime);
    }
  } else {
    response.warnings = [
      "Headings are only available for Google Docs. This file type is not supported yet.",
    ];
    response.headings = [];
  }

  if (response.headings) {
    response.headings = response.headings.filter((heading) => {
      if (minLevel !== undefined && heading.level < minLevel) {
        return false;
      }
      if (maxLevel !== undefined && heading.level > maxLevel) {
        return false;
      }
      return true;
    });
  }

  const payload =
    format === "json"
      ? JSON.stringify(response, null, 2)
      : [
          `Headings for ${metadata.name}:`,
          ...(response.headings?.map((heading) => `H${heading.level}: ${heading.text}`) || []),
        ].join("\n");

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
