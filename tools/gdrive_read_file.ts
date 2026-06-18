import { getFileMetadata, readFileContent } from "../core/drive.js";
import { extractSection, resolveHeadingText } from "../core/docs.js";
import { parseLink } from "../core/links.js";
import { GDriveReadFileInput, InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";
import { toWireContent } from "./gdrive_read_content.js";

export const schema = {
  name: "gdrive_read_file",
  description:
    "Legacy convenience reader. Prefer gdrive_parse_link -> gdrive_list_headings -> gdrive_read_content for large Docs.",
  inputSchema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "ID of the file to read",
      },
      url: {
        type: "string",
        description:
          "Optional: Full Google Docs URL with heading anchor (e.g., https://docs.google.com/document/d/FILE_ID/edit#heading=h.xyz). Used to extract heading anchors for section extraction.",
      },
      sectionHeading: {
        type: "string",
        description:
          "Optional: Heading text to extract a specific section (e.g., '3.1 APIs'). Returns content from this heading until the next heading of same or higher level.",
      },
    },
    required: ["fileId"],
  },
} as const;

export async function readFile(args: GDriveReadFileInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const fileId = args.fileId;

  const err = (payload: object | string): InternalToolResponse => ({
    content: [
      {
        type: "text",
        text:
          format === "json"
            ? JSON.stringify(typeof payload === "string" ? { error: payload } : payload, null, 2)
            : typeof payload === "string"
              ? `Error: ${payload}`
              : JSON.stringify(payload),
      },
    ],
    isError: true,
  });

  if (!fileId) return err("fileId is required");

  // Extract heading anchor from URL if provided, validating fileId consistency.
  let headingIdFromUrl: string | null = null;
  if (args.url) {
    const parsed = parseLink(args.url);
    headingIdFromUrl = parsed?.headingId ?? null;
    if (parsed?.fileId && parsed.fileId !== fileId) {
      return err({ error: "fileId mismatch", fileId, urlFileId: parsed.fileId });
    }
  }

  const metadata = await getFileMetadata(fileId);

  // Section heading priority: URL anchor (resolved to text) > explicit param.
  let sectionHeading: string | undefined;
  if (headingIdFromUrl) {
    sectionHeading = (await resolveHeadingText(fileId, headingIdFromUrl)) ?? undefined;
  }
  if (!sectionHeading && args.sectionHeading) {
    sectionHeading = args.sectionHeading;
  }

  const content = await readFileContent(metadata);
  const wire = toWireContent(content);
  const file = {
    id: metadata.id,
    name: metadata.name,
    mimeType: metadata.mimeType,
    modifiedTime: metadata.modifiedTime,
  };

  if (sectionHeading && content.text !== undefined) {
    const { section, headings } = extractSection(content.text, sectionHeading);
    if (section) {
      const payload =
        format === "json"
          ? JSON.stringify(
              { file, content: wire, section: { requestedHeading: sectionHeading, found: true, content: section } },
              null,
              2,
            )
          : `Section "${sectionHeading}" from ${metadata.name}:\n\n${section}`;
      return { content: [{ type: "text", text: payload }], isError: false };
    }
    const payload =
      format === "json"
        ? JSON.stringify(
            { file, content: wire, section: { requestedHeading: sectionHeading, found: false, availableHeadings: headings } },
            null,
            2,
          )
        : `Section "${sectionHeading}" not found in ${metadata.name}.\n\nAvailable headings:\n${headings.join("\n")}`;
    return { content: [{ type: "text", text: payload }], isError: false };
  }

  const hint =
    "Hint: For large Docs, use gdrive_list_headings and gdrive_read_content with mode=section to avoid full reads.";
  const payload =
    format === "json"
      ? JSON.stringify({ file, content: wire, hint }, null, 2)
      : `Contents of ${metadata.name}:\n\n${wire.text ?? wire.blob}\n\n${hint}`;

  return { content: [{ type: "text", text: payload }], isError: false };
}
