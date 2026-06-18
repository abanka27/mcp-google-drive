## Overview

This repository provides read access to Google Drive, Docs, and Sheets
through two surfaces that share one implementation:

- a **CLI** (`gdrive`) — the primary surface, built for shell pipelines and AI agents
- an **MCP server** — exposes the same capabilities as Model Context Protocol tools over stdio

Both authenticate with OAuth2 and call into a transport-agnostic `core/`
layer, so the Drive/Docs/Sheets logic lives in exactly one place.

## Components

- `core/` — transport-agnostic domain logic (no MCP or CLI concerns)
  - `drive.ts`: file metadata, search (name + full text), content read/export
  - `docs.ts`: heading outline, section extraction, embedded-image manifest, heading-anchor resolution
  - `write.ts`: create/replace Docs from Markdown (Drive import); local-image stripping
  - `comments.ts`: list comments + reply threads via the Drive comments API
  - `sheets.ts`: range/tab reads via the Sheets values API; CSV/TSV serialization
  - `links.ts`: parse Google URLs / bare IDs into `{ fileId, headingId, docType }`
  - `env.ts`: config home resolution and `.env` loading (stdlib `process.loadEnvFile`)
  - `types.ts`: shared domain types
- `cli/` — the `gdrive` command surface
  - `args.ts`: schema-driven argument parser
  - `registry.ts`: command tree, dispatch, and help
  - `commands/`: one module per noun group (`search`, `meta`, `docs`, `sheets`, `files`)
  - `output.ts`: stdout/stderr helpers (raw content, JSON, binary TTY guard)
- `bin/gdrive.ts` — CLI entrypoint (loads env, resolves command, authenticates, runs)
- `tools/` — MCP tool adapters; thin wrappers that format `core/` results into MCP responses
- `index.ts` — MCP server setup, prompt + tool registration, stdio transport
- `auth.ts` — OAuth2 manager: credential loading, in-memory session cache, refresh

## Data Flow

1. Env is loaded (config home or cwd `.env`) before anything reads `process.env`.
2. The auth manager provides OAuth2 credentials and configures the Google API client.
3. CLI: `bin/gdrive` resolves the command and parses flags, authenticates, then runs.
4. MCP: tool calls are routed via `CallToolRequestSchema` after `ensureAuth`.
5. Both paths call `core/`, which returns plain data; the surface formats it.

## Authentication

- Scopes: `drive` (full read/write) and `spreadsheets`. Write access is
  required by `docs create`/`update`; changing scopes requires re-consent.
- OAuth2 credentials are stored in `.gdrive-server-credentials.json` under the
  config home (`$XDG_CONFIG_HOME/mcp-gdrive`, or `GDRIVE_CREDS_DIR` if set).
- Tokens are refreshed automatically when near expiry; interactive auth runs
  only on first use or when the refresh token is revoked.
- The long-running MCP server keeps an in-memory session cache and a periodic
  refresh timer; the short-lived CLI loads/refreshes from disk per invocation.

## Reads and exports

- Google Docs export to Markdown; Sheets to CSV (full export) or via the
  Sheets values API (ranges, named tabs); Slides to plain text; Drawings to
  PNG bytes. Non-Workspace files are downloaded verbatim (text or binary).
- Section reads slice exported Markdown by heading text and are Docs-only.
- Embedded images in Docs are surfaced as a manifest (object id, short-lived
  `contentUri`, alt text, dimensions); the bytes are not inlined.

## Output

- CLI: content goes to stdout (pipe/redirect-friendly); `--json` gives
  structured output; auxiliary notes go to stderr. Binary is refused on a TTY.
- MCP: JSON by default; set `MCP_GDRIVE_OUTPUT_FORMAT=text` for plain text.

## Writing

- `docs create`/`docs update` import Markdown to a Doc via Drive's native
  converter (CLI only; the MCP surface stays read-only).
- Updates are a full-body replace: they do not preserve embedded images or
  anchored comments. Local/relative image refs are stripped before import
  (Drive's importer 500s on unfetchable sources); public image URLs embed.

## Not implemented

- No `gdrive:///` MCP resources — access content via tools/commands.
- No Sheets writes, and no targeted/in-place Doc edits (full replace only).
