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

function parseDocsUrl(url: string): { fileId: string | null; headingId: string | null } {
  const docPattern = /\/document\/d\/([a-zA-Z0-9_-]+)/;
  const idPattern = /[?&]id=([a-zA-Z0-9_-]+)/;
  const headingMatch = url.match(/#heading=([a-zA-Z0-9_.]+)/);

  const docMatch = url.match(docPattern);
  const idMatch = url.match(idPattern);

  return {
    fileId: docMatch?.[1] || idMatch?.[1] || null,
    headingId: headingMatch?.[1] || null,
  };
}

export async function parseLink(args: ParseLinkInput): Promise<InternalToolResponse> {
  const format = getOutputFormat();
  const { fileId, headingId } = parseDocsUrl(args.url);

  if (!fileId) {
    const errorPayload =
      format === "json"
        ? JSON.stringify({ error: "Unsupported or invalid Docs URL", url: args.url }, null, 2)
        : `Error: Unsupported or invalid Docs URL: ${args.url}`;

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

  const payload =
    format === "json"
      ? JSON.stringify(
          {
            url: args.url,
            fileId,
            headingId,
            docType: "document",
          },
          null,
          2,
        )
      : `fileId=${fileId}\nheadingId=${headingId ?? ""}\ndocType=document`;

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
