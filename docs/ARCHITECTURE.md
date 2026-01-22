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
  - `gdrive_parse_link.ts`: Parse Google Docs links
  - `gdrive_get_metadata.ts`: Fetch metadata and headings
  - `gdrive_list_headings.ts`: List headings for Google Docs
  - `gdrive_read_content.ts`: Read content explicitly by mode
  - `gdrive_download.ts`: Download content to a local file with byte offsets
  - `cache.ts`: In-memory LRU cache with TTL and modifiedTime validation
  - `types.ts`: Tool input and response types

## Data Flow

1. Server starts and initializes MCP handlers.
2. Auth manager provides OAuth2 credentials and configures Google API client.
3. Tool calls are routed via `CallToolRequestSchema`.

## Authentication

- OAuth2 credentials are stored in `.gdrive-server-credentials.json`.
- Tokens are refreshed automatically when near expiry.
- Interactive auth occurs if no valid credentials are available.

## Caching

- File content and heading resolution are cached in memory.
- Cache entries are invalidated on TTL or modifiedTime changes.
- Cache defaults: max size 100, TTL 5 minutes.

## Tool Contracts (Current)

### `gdrive_search`

- Input: `query`, optional `pageToken`, `pageSize`
- Output: JSON by default (file metadata + `nextPageToken`), or text with `MCP_GDRIVE_OUTPUT_FORMAT=text`

### `gdrive_read_file`

- Input: `fileId`, optional `url`, optional `sectionHeading`
- Output: JSON by default (file metadata + content), or text with `MCP_GDRIVE_OUTPUT_FORMAT=text`
  - Google Workspace files are exported to Markdown/CSV/plain text/PNG
  - Other files return text or base64 blobs

### `gdrive_parse_link`

- Input: `url`
- Output: JSON with `fileId`, optional `headingId`, and `docType`

### `gdrive_get_metadata`

- Input: `fileId`, optional `includeHeadings`
- Output: JSON with file metadata and optional headings list

### `gdrive_list_headings`

- Input: `fileId`, optional `minLevel`, optional `maxLevel`
- Output: JSON with file metadata and headings list

### `gdrive_read_content`

- Input: `fileId`, optional `mode`, optional `sectionHeading`
- Output: JSON with file metadata and content, or section content when requested

### `gdrive_download`

- Input: `fileId`, optional `mode`, optional `sectionHeading`, optional `destinationPath`, optional `chunkSizeBytes`
- Output: JSON with file metadata, download path, and byte offsets for local paging

## Download locations

- Default download directory: `~/.mcp-gdrive/downloads` (configurable via `GDRIVE_DOWNLOAD_DIR`).
- If `destinationPath` is a directory (or ends with a path separator), the file name is derived from the Drive file.
- Missing directories are created automatically.

## Output format

- Tool output defaults to JSON.
- Set `MCP_GDRIVE_OUTPUT_FORMAT=text` to return plain text responses.

## Planned Changes

- Structured tool outputs for better agent interoperability.
- Additional tools for metadata and partial reads.
- Planned Google Sheets tools (read/update), not yet implemented.
