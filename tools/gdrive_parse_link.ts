import { parseLink } from "../core/links.js";
import { InternalToolResponse } from "./types.js";
import { getOutputFormat } from "./output.js";

export const schema = {
  name: "gdrive_parse_link",
  description:
    "Parse a Google Docs URL and extract identifiers. Use this first to get a fileId/headingId before listing headings or reading sections.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Google Docs URL to parse",
      },
    },
    required: ["url"],
  },
} as const;

type ParseLinkInput = {
  url: string;
};

export async function parseLink_(args: ParseLinkInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const parsed = parseLink(args.url);

  if (!parsed) {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "Unsupported or invalid Docs URL", url: args.url }, null, 2)
        : `Error: Unsupported or invalid Docs URL: ${args.url}`;
    return { content: [{ type: "text", text: errorPayload }], isError: true };
  }

  const payload =
    format === "json"
      ? JSON.stringify(
          { url: args.url, fileId: parsed.fileId, headingId: parsed.headingId, docType: parsed.docType },
          null,
          2,
        )
      : `fileId=${parsed.fileId}\nheadingId=${parsed.headingId ?? ""}\ndocType=${parsed.docType}`;

  return { content: [{ type: "text", text: payload }], isError: false };
}

export { parseLink_ as parseLink };
