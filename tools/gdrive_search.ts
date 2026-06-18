import { searchFiles } from "../core/drive.js";
import { GDriveSearchInput, InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";

export const schema = {
  name: "gdrive_search",
  description: "Search Drive files to find candidate fileIds (not in-doc search).",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      pageToken: {
        type: "string",
        description: "Token for the next page of results",
        optional: true,
      },
      pageSize: {
        type: "number",
        description: "Number of results per page (max 100)",
        optional: true,
      },
    },
    required: ["query"],
  },
} as const;

export async function search(args: GDriveSearchInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const { files, nextPageToken } = await searchFiles({
    query: args.query ?? "",
    pageToken: args.pageToken,
    pageSize: args.pageSize,
  });

  if (format === "text") {
    const fileList = files.map((f) => `${f.id} ${f.name} (${f.mimeType})`).join("\n");
    let response = `Found ${files.length} files:\n${fileList}`;
    if (nextPageToken) {
      response += `\n\nMore results available. Use pageToken: ${nextPageToken}`;
    }
    return { content: [{ type: "text", text: response }], isError: false };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ files, nextPageToken }, null, 2) }],
    isError: false,
  };
}
