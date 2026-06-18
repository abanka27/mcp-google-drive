#!/usr/bin/env node
import { loadEnv } from "./core/env.js";
loadEnv();
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getValidCredentials,
  setupTokenRefresh,
} from "./auth.js";
import { tools } from "./tools/index.js";
import { InternalToolResponse } from "./tools/types.js";

// Prompt templates exposed via ListPrompts.
const prompts = [
  {
    name: "outline_doc",
    description: "Return a structured outline of a Google Doc.",
    arguments: [
      {
        name: "url",
        description: "Google Docs URL to outline",
        required: true,
      },
      {
        name: "minLevel",
        description: "Optional minimum heading level to include (e.g., 2 for H2+)",
        required: false,
      },
      {
        name: "maxLevel",
        description: "Optional maximum heading level to include (e.g., 3 for up to H3)",
        required: false,
      },
    ],
  },
  {
    name: "read_section_by_heading",
    description: "Read a specific section of a Google Doc by heading text.",
    arguments: [
      {
        name: "url",
        description: "Google Docs URL to read from",
        required: true,
      },
      {
        name: "sectionHeading",
        description: "Heading text to read (exact or partial match)",
        required: true,
      },
    ],
  },
] as const;

function requireArg(name: string, args?: Record<string, string>) {
  const value = args?.[name];
  if (!value) {
    throw new Error(`Missing required prompt argument: ${name}`);
  }
  return value;
}

const server = new Server(
  {
    name: "example-servers/gdrive",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {
      },
      prompts: {},
      tools: {},
    },
  },
);

// Ensure we have valid credentials before making API calls
async function ensureAuth() {
  // getValidCredentials throws if auth fails, so no null check needed
  return await getValidCredentials();
}

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts,
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const prompt = prompts.find((item) => item.name === request.params.name);
  if (!prompt) {
    throw new Error(`Prompt not found: ${request.params.name}`);
  }

  const args = request.params.arguments ?? {};

  if (prompt.name === "outline_doc") {
    const url = requireArg("url", args);
    const minLevel = args.minLevel ? `minLevel=${args.minLevel}` : "minLevel=2";
    const maxLevel = args.maxLevel ? `maxLevel=${args.maxLevel}` : "maxLevel=4";
    return {
      description: prompt.description,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Provide a structured outline (headings) for this Google Doc.",
              `URL: ${url}`,
              "",
              "Use this workflow:",
              "1) gdrive_parse_link to get fileId",
              `2) gdrive_list_headings with ${minLevel}, ${maxLevel}`,
              "3) Return the headings grouped by level",
            ].join("\n"),
          },
        },
      ],
    };
  }

  if (prompt.name === "read_section_by_heading") {
    const url = requireArg("url", args);
    const sectionHeading = requireArg("sectionHeading", args);
    return {
      description: prompt.description,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Read a single section from this Google Doc.",
              `URL: ${url}`,
              `Section heading: ${sectionHeading}`,
              "",
              "Use this workflow:",
              "1) gdrive_parse_link to get fileId",
              "2) gdrive_read_content mode=section with sectionHeading",
            ].join("\n"),
          },
        },
      ],
    };
  }

  throw new Error(`Prompt not implemented: ${request.params.name}`);
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  };
});

// Helper function to convert internal tool response to SDK format
function convertToolResponse(response: InternalToolResponse) {
  return {
    _meta: {},
    content: response.content,
    isError: response.isError,
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  await ensureAuth();
  const tool = tools.find((t) => t.name === request.params.name);
  if (!tool) {
    throw new Error("Tool not found");
  }

  const result = await tool.handler(request.params.arguments as any);
  return convertToolResponse(result);
});

async function startServer() {
  try {
    console.error("Starting server");
    
    // Add this line to force authentication at startup
    await ensureAuth(); // This will trigger the auth flow if no valid credentials exist
    
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Set up periodic token refresh that never prompts for auth
    setupTokenRefresh();
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// Start server immediately
startServer().catch(console.error);
