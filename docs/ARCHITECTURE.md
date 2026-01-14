## Overview

This repository implements an MCP (Model Context Protocol) server that
integrates with Google Drive and exposes tools plus a `gdrive:///` resource
scheme. The server uses OAuth2 for authentication and communicates over stdio
using the MCP SDK.

## Components

- `index.ts`
  - MCP server setup and transport
  - Resource handlers for list/read
  - Tool registry and dispatch
  - Auth initialization and refresh scheduling
- `auth.ts`
  - OAuth2 authentication manager
  - Credential loading, caching, and refresh
- `tools/`
  - `gdrive_search.ts`: Search Google Drive
  - `gdrive_read_file.ts`: Read file contents and optionally extract sections
  - `cache.ts`: In-memory LRU cache with TTL and modifiedTime validation
  - `types.ts`: Tool input and response types

## Data Flow

1. Server starts and initializes MCP handlers.
2. Auth manager provides OAuth2 credentials and configures Google API client.
3. Tool calls are routed via `CallToolRequestSchema`.
4. Resource requests (`gdrive:///`) map to Drive file IDs and reuse the read
   tool to return contents.

## Authentication

- OAuth2 credentials are stored in `.gdrive-server-credentials.json`.
- Tokens are refreshed automatically when near expiry.
- Interactive auth occurs if no valid credentials are available.

## Resources

- The server declares a `gdrive` resource scheme.
- `list` uses `drive.files.list`.
- `read` uses the `gdrive_read_file` tool internally.

## Caching

- File content and heading resolution are cached in memory.
- Cache entries are invalidated on TTL or modifiedTime changes.
- Cache defaults: max size 100, TTL 5 minutes.

## Tool Contracts (Current)

### `gdrive_search`

- Input: `query`, optional `pageToken`, `pageSize`, `format`
- Output: JSON by default (file metadata + `nextPageToken`), or text with `format: "text"`

### `gdrive_read_file`

- Input: `fileId`, optional `url`, optional `sectionHeading`, optional `format`
- Output: JSON by default (file metadata + content), or text with `format: "text"`
  - Google Workspace files are exported to Markdown/CSV/plain text/PNG
  - Other files return text or base64 blobs

## Planned Changes

- Structured tool outputs for better agent interoperability.
- Additional tools for metadata and partial reads.
- Planned Google Sheets tools (read/update), not yet implemented.
