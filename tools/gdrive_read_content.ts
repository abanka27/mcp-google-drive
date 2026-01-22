import { InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";
import { extractSection, getFileMetadata, readGoogleDriveFile } from "./gdrive_read_file.js";

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

export async function readContent(args: ReadContentInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const fileId = args.fileId;
  const mode = args.mode ?? "full";

  if (!fileId) {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "fileId is required" }, null, 2)
        : "Error: fileId is required";
    return {
      content: [{ type: "text", text: errorPayload }],
      isError: true,
    };
  }

  if (mode === "section" && !args.sectionHeading) {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "sectionHeading is required when mode=section" }, null, 2)
        : "Error: sectionHeading is required when mode=section";
    return {
      content: [{ type: "text", text: errorPayload }],
      isError: true,
    };
  }

  const metadata = await getFileMetadata(fileId);
  const result = await readGoogleDriveFile(fileId, metadata);

  if (mode === "section") {
    if (!result.contents.text) {
      const errorPayload =
        format === "json"
          ? JSON.stringify({ error: "Section reads require text content" }, null, 2)
          : "Error: Section reads require text content";
      return {
        content: [{ type: "text", text: errorPayload }],
        isError: true,
      };
    }

    if (metadata.mimeType !== "application/vnd.google-apps.document") {
      const errorPayload =
        format === "json"
          ? JSON.stringify(
              {
                error: "Section reads are only supported for Google Docs",
                mimeType: metadata.mimeType,
              },
              null,
              2,
            )
          : `Error: Section reads are only supported for Google Docs (mimeType=${metadata.mimeType})`;
      return {
        content: [{ type: "text", text: errorPayload }],
        isError: true,
      };
    }

    const { section, headings } = extractSection(result.contents.text, args.sectionHeading!);

    if (!section) {
      const payload =
        format === "json"
          ? JSON.stringify(
              {
                file: {
                  id: fileId,
                  name: metadata.name,
                  mimeType: metadata.mimeType,
                  modifiedTime: metadata.modifiedTime,
                },
                section: {
                  requestedHeading: args.sectionHeading,
                  found: false,
                  availableHeadings: headings,
                },
              },
              null,
              2,
            )
          : `Section "${args.sectionHeading}" not found in ${metadata.name}.\n\nAvailable headings:\n${headings.join("\n")}`;

      return {
        content: [{ type: "text", text: payload }],
        isError: false,
      };
    }

    const payload =
      format === "json"
        ? JSON.stringify(
            {
              file: {
                id: fileId,
                name: metadata.name,
                mimeType: metadata.mimeType,
                modifiedTime: metadata.modifiedTime,
              },
              content: result.contents,
              section: {
                requestedHeading: args.sectionHeading,
                found: true,
                content: section,
              },
            },
            null,
            2,
          )
        : `Section "${args.sectionHeading}" from ${metadata.name}:\n\n${section}`;

    return {
      content: [{ type: "text", text: payload }],
      isError: false,
    };
  }

  const hint =
    "Hint: For large docs, call gdrive_list_headings first and then gdrive_read_content with mode=section.";
  const payload =
    format === "json"
      ? JSON.stringify(
          {
            file: {
              id: fileId,
              name: metadata.name,
              mimeType: metadata.mimeType,
              modifiedTime: metadata.modifiedTime,
            },
            content: result.contents,
            hint,
          },
          null,
          2,
        )
      : `Contents of ${metadata.name}:\n\n${result.contents.text || result.contents.blob}\n\n${hint}`;

  return {
    content: [{ type: "text", text: payload }],
    isError: false,
  };
}
