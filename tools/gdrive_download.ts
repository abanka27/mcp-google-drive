import fs from "fs/promises";
import os from "os";
import path from "path";
import { InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";
import { extractSection, getFileMetadata, readGoogleDriveFile } from "./gdrive_read_file.js";

const DEFAULT_CHUNK_SIZE_BYTES = 64 * 1024;
const DEFAULT_DOWNLOAD_DIR =
  process.env.GDRIVE_DOWNLOAD_DIR || path.join(os.homedir(), ".mcp-gdrive", "downloads");

export const schema = {
  name: "gdrive_download",
  description:
    "Download content to a local file. Returns the file path and byte offsets so clients can page locally without re-calling Drive.",
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
      destinationPath: {
        type: "string",
        description:
          "Optional output path. If a directory (or ends with a path separator), the file name is derived from the Drive file.",
        optional: true,
      },
      chunkSizeBytes: {
        type: "number",
        description: "Chunk size for offsets in bytes (default 65536)",
        optional: true,
      },
    },
    required: ["fileId"],
  },
} as const;

type DownloadInput = {
  fileId?: string;
  mode?: "full" | "section";
  sectionHeading?: string;
  destinationPath?: string;
  chunkSizeBytes?: number;
};

function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "content";
}

async function resolveOutputPath(
  destinationPath: string | undefined,
  fileName: string,
): Promise<{ outputPath: string; resolvedDir: string }> {
  const baseName = sanitizeFileName(path.basename(fileName, path.extname(fileName)));
  const extension = path.extname(fileName) || ".txt";
  const defaultDir = DEFAULT_DOWNLOAD_DIR;

  if (!destinationPath) {
    await fs.mkdir(defaultDir, { recursive: true });
    return {
      outputPath: path.join(defaultDir, `${baseName}${extension}`),
      resolvedDir: defaultDir,
    };
  }

  const resolved = path.resolve(destinationPath);
  const endsWithSeparator = destinationPath.endsWith(path.sep);
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      await fs.mkdir(resolved, { recursive: true });
      return {
        outputPath: path.join(resolved, `${baseName}${extension}`),
        resolvedDir: resolved,
      };
    }
  } catch {
    // path does not exist; treat as directory if it ends with a separator
    if (endsWithSeparator) {
      await fs.mkdir(resolved, { recursive: true });
      return {
        outputPath: path.join(resolved, `${baseName}${extension}`),
        resolvedDir: resolved,
      };
    }
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  return { outputPath: resolved, resolvedDir: path.dirname(resolved) };
}

export async function downloadContent(args: DownloadInput): Promise<InternalToolResponse> {
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
  const contentMimeType = result.contents.mimeType;
  let contentBuffer: Buffer;
  let isText = false;
  let sectionInfo: { requestedHeading?: string; found: boolean; availableHeadings?: string[] } | undefined;

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

    isText = true;
    contentBuffer = Buffer.from(section, "utf-8");
    sectionInfo = { requestedHeading: args.sectionHeading, found: true };
  } else if (result.contents.text) {
    isText = true;
    contentBuffer = Buffer.from(result.contents.text, "utf-8");
  } else if (result.contents.blob) {
    contentBuffer = Buffer.from(result.contents.blob, "base64");
  } else {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "No content returned for file" }, null, 2)
        : "Error: No content returned for file";
    return {
      content: [{ type: "text", text: errorPayload }],
      isError: true,
    };
  }

  const { outputPath, resolvedDir } = await resolveOutputPath(args.destinationPath, metadata.name);
  await fs.writeFile(outputPath, contentBuffer);
  const { size } = await fs.stat(outputPath);
  const chunkSize = args.chunkSizeBytes && args.chunkSizeBytes > 0 ? args.chunkSizeBytes : DEFAULT_CHUNK_SIZE_BYTES;
  const chunks = [];

  for (let start = 0, index = 0; start < size; start += chunkSize, index += 1) {
    const end = Math.min(start + chunkSize, size);
    chunks.push({ index, start, end });
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
            content: {
              mimeType: contentMimeType,
              encoding: isText ? "utf-8" : "binary",
            },
            download: {
              path: outputPath,
              directory: resolvedDir,
              bytes: size,
            },
            chunks,
            mode,
            ...(sectionInfo ? { section: sectionInfo } : {}),
          },
          null,
          2,
        )
      : `Downloaded content to ${outputPath} (${size} bytes). Read locally in ${chunkSize}-byte chunks.`;

  return {
    content: [{ type: "text", text: payload }],
    isError: false,
  };
}
