import { getFileMetadata } from "../core/drive.js";
import { listHeadings } from "../core/docs.js";
import { DOC_MIME, DocHeading, FileMetadata } from "../core/types.js";
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

export async function getMetadata(args: GetMetadataInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  if (!args.fileId) {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "fileId is required" }, null, 2)
        : "Error: fileId is required";
    return { content: [{ type: "text", text: errorPayload }], isError: true };
  }

  const metadata = await getFileMetadata(args.fileId);
  const includeHeadings = args.includeHeadings ?? true;

  const response: {
    file: FileMetadata;
    docType?: string;
    headings?: DocHeading[];
    warnings?: string[];
  } = { file: metadata };

  if (metadata.mimeType === DOC_MIME) {
    response.docType = "document";
    if (includeHeadings) {
      response.headings = await listHeadings(metadata.id);
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

  return { content: [{ type: "text", text: payload }], isError: false };
}
