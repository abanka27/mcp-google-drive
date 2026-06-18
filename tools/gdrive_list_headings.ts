import { getFileMetadata } from "../core/drive.js";
import { listHeadings as listDocHeadings } from "../core/docs.js";
import { DOC_MIME, DocHeading, FileMetadata } from "../core/types.js";
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

export async function listHeadings(args: ListHeadingsInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  if (!args.fileId) {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "fileId is required" }, null, 2)
        : "Error: fileId is required";
    return { content: [{ type: "text", text: errorPayload }], isError: true };
  }

  const metadata = await getFileMetadata(args.fileId);
  const response: {
    file: FileMetadata;
    headings: DocHeading[];
    warnings?: string[];
  } = { file: metadata, headings: [] };

  if (metadata.mimeType === DOC_MIME) {
    response.headings = await listDocHeadings(metadata.id, {
      minLevel: args.minLevel,
      maxLevel: args.maxLevel,
    });
  } else {
    response.warnings = [
      "Headings are only available for Google Docs. This file type is not supported yet.",
    ];
  }

  const payload =
    format === "json"
      ? JSON.stringify(response, null, 2)
      : [
          `Headings for ${metadata.name}:`,
          ...response.headings.map((h) => `H${h.level}: ${h.text}`),
        ].join("\n");

  return { content: [{ type: "text", text: payload }], isError: false };
}
