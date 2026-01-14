#!/usr/bin/env node
import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import {
  getValidCredentials,
  setupTokenRefresh,
  loadCredentialsQuietly,
} from "./auth.js";
import { tools } from "./tools/index.js";
import { InternalToolResponse } from "./tools/types.js";
import { getFileMetadata, readGoogleDriveFile } from "./tools/gdrive_read_file.js";

const drive = google.drive("v3");

const server = new Server(
  {
    name: "example-servers/gdrive",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {
        schemes: ["gdrive"], // Declare that we handle gdrive:/// URIs
        listable: true, // Support listing available resources
        readable: true, // Support reading resource contents
      },
      tools: {},
    },
  },
);

// Ensure we have valid credentials before making API calls
async function ensureAuth() {
  // getValidCredentials throws if auth fails, so no null check needed
  return await getValidCredentials();
}

async function ensureAuthQuietly() {
  const auth = await loadCredentialsQuietly();
  if (auth) {
    google.options({ auth });
  }
  return auth;
}

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  await ensureAuthQuietly();
  const pageSize = 10;
  const params: any = {
    pageSize,
    fields: "nextPageToken, files(id, name, mimeType)",
  };

  if (request.params?.cursor) {
    params.pageToken = request.params.cursor;
  }

  const res = await drive.files.list(params);
  const files = res.data.files!;

  return {
    resources: files.map((file) => ({
      uri: `gdrive:///${file.id}`,
      mimeType: file.mimeType,
      name: file.name,
    })),
    nextCursor: res.data.nextPageToken,
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  await ensureAuthQuietly();
  const fileId = request.params.uri.replace("gdrive:///", "");
  const metadata = await getFileMetadata(fileId);
  const result = await readGoogleDriveFile(fileId, metadata);
  const content = {
    uri: request.params.uri,
    mimeType: result.contents.mimeType,
    ...(result.contents.text
      ? { text: result.contents.text }
      : { blob: result.contents.blob || "" }),
  };

  return {
    contents: [
      {
        ...content,
      },
    ],
  };
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
