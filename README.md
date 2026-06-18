# Google Drive CLI & MCP server

Read access to Google Drive, Docs, and Sheets through two surfaces that share
one implementation: a **`gdrive` CLI** (the primary surface, built for shell
pipelines and AI agents) and an **MCP server** (stdio). Both authenticate with
OAuth2 and call into a transport-agnostic `core/` layer.

Requires **Node.js >= 24**.

This project includes code originally developed by Anthropic, PBC, licensed under the MIT License from [this repo](https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive), and additional work from [isaacphi/mcp-gdrive](https://github.com/isaacphi/mcp-gdrive).

## CLI

Build (`npm run build`), then invoke `node dist/bin/gdrive.js <command>`. For a
bare `gdrive` command, symlink `dist/bin/gdrive.js` into any directory on your
PATH. Every command accepts a Drive file ID or a Google URL.

```
gdrive search <query> [--type docs|sheets] [--page-size N] [--page-token TOKEN]
gdrive meta   <fileId|url>
gdrive docs read     <fileId|url> [--section "Heading"] [--json] [--no-images]
gdrive docs headings <fileId|url> [--min N] [--max N]
gdrive docs comments <fileId|url> [--include-resolved]
gdrive docs create   --name "Title" [--from FILE]    (or pipe markdown on stdin)
gdrive docs update   <fileId|url> [--from FILE]       (or pipe markdown on stdin)
gdrive sheets read   <fileId|url> [--range A1:B10] [--csv|--tsv|--json]
gdrive files read    <fileId|url>
```

`docs create`/`update` import Markdown via Drive's native converter. Updates
are a **full-body replace**: text and structure (headings, lists, tables,
links) convert, but it does **not** preserve embedded images or anchored
comments. Local image references (`![](./x.png)`) are stripped before import
(they make Drive's importer fail); public image URLs are kept and embedded.

Content is written to **stdout** so you can pipe or redirect it; structured
output is available via `--json`, and auxiliary notes (e.g. the embedded-image
manifest) go to stderr. Binary content is refused on an interactive terminal —
redirect it (`gdrive files read <id> > out.pdf`). Run any command with
`--help` for its flags.

Examples:

```bash
gdrive docs read <id> > prd.md                  # whole doc as Markdown
gdrive docs read <id> --section "2. Context"    # just one section
gdrive sheets read <id> --range "'Sheet2'!A1:C9" --tsv
gdrive search "quarterly" --type docs
```

## MCP Components

### Tools

- **gdrive_search**

  - **Description**: Search for files in Google Drive.
  - **Input**:
    - `query` (string): Search query.
    - `pageToken` (string, optional): Token for the next page of results.
    - `pageSize` (number, optional): Number of results per page (max 100).
  - **Output**: Returns structured JSON with file metadata by default. Set `MCP_GDRIVE_OUTPUT_FORMAT=text` to return a plain text list.

- **gdrive_read_file**

  - **Description**: Convenience tool to read contents of a file from Google Drive (legacy behavior preserved).
  - **Input**:
    - `fileId` (string): ID of the file to read.
    - `url` (string, optional): Google Docs/Drive URL with heading anchor (for section extraction).
    - `sectionHeading` (string, optional): Heading text to extract a section.
  - **Output**: Returns structured JSON with file metadata and content by default, or plain text with `MCP_GDRIVE_OUTPUT_FORMAT=text`.

- **gdrive_parse_link**

  - **Description**: Parse a Google Docs URL and extract identifiers.
  - **Input**:
    - `url` (string): Google Docs URL to parse.
  - **Output**: Returns `fileId`, optional `headingId`, and `docType`.

- **gdrive_get_metadata**

  - **Description**: Fetch file metadata and optional headings for Google Docs.
  - **Input**:
    - `fileId` (string): ID of the file to inspect.
    - `includeHeadings` (boolean, optional): Include headings when file is a Google Doc.
  - **Output**: Returns file metadata, optional `docType`, and optional headings list.

- **gdrive_list_headings**

  - **Description**: List headings for a Google Doc.
  - **Input**:
    - `fileId` (string): ID of the Google Doc to inspect.
    - `minLevel` (number, optional): Minimum heading level to include (e.g., `2` for H2+).
    - `maxLevel` (number, optional): Maximum heading level to include (e.g., `3` for up to H3).
  - **Output**: Returns a headings list (with levels) and file metadata.

- **gdrive_read_content**

  - **Description**: Read content explicitly by mode (`full` or `section`).
  - **Input**:
    - `fileId` (string): ID of the file to read.
    - `mode` (string, optional): `full` (default) or `section`.
    - `sectionHeading` (string, optional): Required when `mode="section"`.
  - **Output**: Returns file metadata and content, or a specific section when requested.

- **gdrive_download**

  - **Description**: Download content to a local file, returning byte offsets for local paging.
  - **Input**:
    - `fileId` (string): ID of the file to read.
    - `mode` (string, optional): `full` (default) or `section`.
    - `sectionHeading` (string, optional): Required when `mode="section"`.
    - `destinationPath` (string, optional): Output path or directory for the download.
    - `chunkSizeBytes` (number, optional): Chunk size for offsets in bytes.
  - **Output**: Returns file metadata, download path, and byte offsets for local paging.

### Download directory

The default download directory can be configured via `GDRIVE_DOWNLOAD_DIR`. If not set, downloads go to:

```
~/.mcp-gdrive/downloads
```

### Output format

Tool output format is configured globally via environment variable:

```
MCP_GDRIVE_OUTPUT_FORMAT=json   # default
MCP_GDRIVE_OUTPUT_FORMAT=text
```

### Agent Workflow (Docs Link)

1. **Parse** the link with `gdrive_parse_link` to get `fileId` and `headingId`.
2. **List headings** with `gdrive_list_headings` (use `gdrive_get_metadata` for file metadata).
3. **Read** with `gdrive_read_content` using `mode="section"` per heading (avoid full reads for large docs).

### Prompts

The server exposes prompt templates to guide agents through common workflows:

- `outline_doc` (args: `url`, optional `minLevel`, `maxLevel`)
- `read_section_by_heading` (args: `url`, `sectionHeading`)

### Sheets

The MCP server reads spreadsheets as CSV via the generic read tools. For
range- and tab-aware reads (the Sheets values API), use the CLI's
`gdrive sheets read`. Write operations (creating/updating Docs or Sheets) are
not implemented on either surface.

### Resources

The server does not currently expose any `gdrive:///` resources. Access Drive
content via tools.

## Setup

Three steps, ~3 minutes. You never edit a `.env` — credentials are read from
the file you download from Google.

### 1. Install

```bash
git clone https://github.com/abanka27/mcp-google-drive.git
cd mcp-google-drive
npm install        # builds automatically (requires Node >= 24)
```

### 2. Get Google credentials (one-time, ~2 min)

Each person needs their own OAuth client — credentials can't be shared. Click
through these exact pages:

1. **Create or pick a project:** https://console.cloud.google.com/projectcreate
2. **Enable three APIs** — click *Enable* on each:
   - Drive — https://console.cloud.google.com/apis/library/drive.googleapis.com
   - Docs — https://console.cloud.google.com/apis/library/docs.googleapis.com
   - Sheets — https://console.cloud.google.com/apis/library/sheets.googleapis.com
3. **OAuth consent screen:** https://console.cloud.google.com/apis/credentials/consent
   Pick **Internal** if your account offers it. (An **External** app in
   "Testing" expires logins every 7 days — add yourself as a test user, or
   publish it.)
4. **Create credentials → OAuth client ID**, application type **Desktop app**:
   https://console.cloud.google.com/apis/credentials/oauthclient
5. **Download the JSON.** That single file is all you need.

### 3. Run setup

```bash
npm run setup
```

This finds the file you just downloaded (in the current directory or
`~/Downloads`), stores it, opens your browser to sign in once, and links
`gdrive` onto your PATH. If it can't find the file, pass the path explicitly:

```bash
node dist/bin/gdrive.js setup ~/Downloads/client_secret_XXXX.json
```

Done — try it:

```bash
gdrive search "" --page-size 3
```

Credentials and the saved token live in `~/.config/mcp-gdrive`
(`$XDG_CONFIG_HOME/mcp-gdrive`), or set `GDRIVE_CREDS_DIR` to override. The
browser prompt only appears on first run; after that the token refreshes
silently.

## Use with an AI agent (Claude Code skill)

This repo ships a skill at `.claude/skills/gdrive/` that teaches an agent the
commands and when to reach for them. It loads automatically when you run Claude
Code inside this repo. To use it from any directory, copy it into your user
skills:

```bash
cp -r .claude/skills/gdrive ~/.claude/skills/gdrive
```

Then ask your agent to read, search, or update Google Docs/Sheets and it will
drive `gdrive` for you.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
