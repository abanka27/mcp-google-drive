# Google Drive server

This MCP server integrates with Google Drive to allow listing, reading, and searching files.

This project includes code originally developed by Anthropic, PBC, licensed under the MIT License from [this repo](https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive), and additional work from [isaacphi/mcp-gdrive](https://github.com/isaacphi/mcp-gdrive).

## Components

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

### Planned Tools (Not Yet Implemented Here)

- **gsheets_read**

  - **Description**: Read data from a Google Spreadsheet with flexible options for ranges and formatting.
  - **Input**:
    - `spreadsheetId` (string): The ID of the spreadsheet to read.
    - `ranges` (array of strings, optional): Optional array of A1 notation ranges (e.g., `['Sheet1!A1:B10']`). If not provided, reads the entire sheet.
    - `sheetId` (number, optional): Specific sheet ID to read. If not provided with ranges, reads the first sheet.
  - **Output**: Returns the specified data from the spreadsheet.

- **gsheets_update_cell**
  - **Description**: Update a cell value in a Google Spreadsheet.
  - **Input**:
    - `fileId` (string): ID of the spreadsheet.
    - `range` (string): Cell range in A1 notation (e.g., `'Sheet1!A1'`).
    - `value` (string): New cell value.
  - **Output**: Confirms the updated value in the specified cell.

### Resources

The server does not currently expose any `gdrive:///` resources. Access Drive
content via tools.

## Getting started

1. [Create a new Google Cloud project](https://console.cloud.google.com/projectcreate)
2. [Enable the Google Drive API](https://console.cloud.google.com/workspace-api/products)
3. [Configure an OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) ("internal" is fine for testing)
4. Add OAuth scopes `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/spreadsheets`
5. In order to allow interaction with sheets and docs you will also need to enable the [Google Sheets API](https://console.cloud.google.com/apis/api/sheets.googleapis.com/) and [Google Docs API](https://console.cloud.google.com/marketplace/product/google/docs.googleapis.com) in your workspaces Enabled API and Services section.
6. [Create an OAuth Client ID](https://console.cloud.google.com/apis/credentials/oauthclient) for application type "Desktop App"
7. Download the JSON file of your client's OAuth keys
8. Rename the key file to `gcp-oauth.keys.json` and place into the path you specify with `GDRIVE_CREDS_DIR` (i.e. `/Users/username/.config/mcp-gdrive`)
9. Note your OAuth Client ID and Client Secret. They must be provided as environment variables along with your configuration directory.
10. You will also need to setup a .env file within the project with the following fields. You can find the Client ID and Client Secret in the Credentials section of the Google Cloud Console.

```
GDRIVE_CREDS_DIR=/path/to/config/directory
CLIENT_ID=<CLIENT_ID>
CLIENT_SECRET=<CLIENT_SECRET>
MCP_GDRIVE_OUTPUT_FORMAT=json
```

Make sure to build the server with either `npm run build` or `npm run watch`.

### Authentication

Starting the server (`node ./dist/index.js`) triggers the authentication step if no valid credentials are present

You will be prompted to authenticate with your browser. You must authenticate with an account in the same organization as your Google Cloud project.

Your OAuth token is saved in the directory specified by the `GDRIVE_CREDS_DIR` environment variable.

![Authentication Prompt](https://i.imgur.com/TbyV6Yq.png)

### Usage with Desktop App

To integrate this server with the desktop app, add the following to your app's server configuration:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@abanka27/mcp-google-drive"],
      "env": {
        "CLIENT_ID": "<CLIENT_ID>",
        "CLIENT_SECRET": "<CLIENT_SECRET>",
        "GDRIVE_CREDS_DIR": "/path/to/config/directory",
        "MCP_GDRIVE_OUTPUT_FORMAT": "json"
      }
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
