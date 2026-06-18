import { getFileMetadata, readFileContent } from "../core/drive.js";
import { extractSection } from "../core/docs.js";
import { DOC_MIME, FileContent } from "../core/types.js";
import { InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";

export const schema = {
  name: "gdrive_read_content",
  description:
    "Read Google Doc content by mode. Prefer mode=section with gdrive_list_headings to avoid large reads.",
  inputSchema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "ID of the file to read",
      },
      mode: {
        type: "string",
        description: 'Read mode: "full" or "section"',
        optional: true,
      },
      sectionHeading: {
        type: "string",
        description: "Heading text to extract a section (required when mode=section)",
        optional: true,
      },
    },
    required: ["fileId"],
  },
} as const;

type ReadContentInput = {
  fileId?: string;
  mode?: "full" | "section";
  sectionHeading?: string;
};

/** Convert core FileContent into the MCP wire shape (binary -> base64 blob). */
export function toWireContent(content: FileContent): { mimeType: string; text?: string; blob?: string } {
  if (content.text !== undefined) {
    return { mimeType: content.mimeType, text: content.text };
  }
  return { mimeType: content.mimeType, blob: content.bytes?.toString("base64") };
}

export async function readContent(args: ReadContentInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const fileId = args.fileId;
  const mode = args.mode ?? "full";

  const err = (message: string): InternalToolResponse => ({
    content: [
      {
        type: "text",
        text: format === "json" ? JSON.stringify({ error: message }, null, 2) : `Error: ${message}`,
      },
    ],
    isError: true,
  });

  if (!fileId) return err("fileId is required");
  if (mode === "section" && !args.sectionHeading) {
    return err("sectionHeading is required when mode=section");
  }

  const metadata = await getFileMetadata(fileId);
  const content = await readFileContent(metadata);
  const file = {
    id: metadata.id,
    name: metadata.name,
    mimeType: metadata.mimeType,
    modifiedTime: metadata.modifiedTime,
  };

  if (mode === "section") {
    if (content.text === undefined) return err("Section reads require text content");
    if (metadata.mimeType !== DOC_MIME) {
      return err(`Section reads are only supported for Google Docs (mimeType=${metadata.mimeType})`);
    }

    const { section, headings } = extractSection(content.text, args.sectionHeading!);
    if (!section) {
      const payload =
        format === "json"
          ? JSON.stringify(
              { file, section: { requestedHeading: args.sectionHeading, found: false, availableHeadings: headings } },
              null,
              2,
            )
          : `Section "${args.sectionHeading}" not found in ${metadata.name}.\n\nAvailable headings:\n${headings.join("\n")}`;
      return { content: [{ type: "text", text: payload }], isError: false };
    }

    const payload =
      format === "json"
        ? JSON.stringify(
            { file, content: toWireContent(content), section: { requestedHeading: args.sectionHeading, found: true, content: section } },
            null,
            2,
          )
        : `Section "${args.sectionHeading}" from ${metadata.name}:\n\n${section}`;
    return { content: [{ type: "text", text: payload }], isError: false };
  }

  const hint =
    "Hint: For large docs, call gdrive_list_headings first and then gdrive_read_content with mode=section.";
  const wire = toWireContent(content);
  const payload =
    format === "json"
      ? JSON.stringify({ file, content: wire, hint }, null, 2)
      : `Contents of ${metadata.name}:\n\n${wire.text ?? wire.blob}\n\n${hint}`;

  return { content: [{ type: "text", text: payload }], isError: false };
}
