---
name: gdrive
description: Read and write Google Drive, Docs, and Sheets from the terminal via the `gdrive` CLI. Use when the user wants to search Drive, read a Google Doc or Sheet, pull a doc's outline/sections/comments, or create/update a Google Doc from Markdown. Covers Google Docs, Google Sheets, Drive files, and doc comments.
---

# Google Drive CLI (`gdrive`)

`gdrive` reads and writes Google Drive/Docs/Sheets from the shell. Every command
takes a Drive **file ID or a Google URL**. Content goes to **stdout** (pipe or
redirect it); pass `--json` for structured output.

**Token-saving rule:** never paste a large doc inline. Redirect to a file and
read it with pagination:

```bash
gdrive docs read <id|url> > /tmp/doc.md      # then Read /tmp/doc.md with offset/limit
gdrive docs read <id|url> --section "Heading" # or just one section
gdrive docs headings <id|url>                 # list sections first
```

## Is it set up?

If `gdrive` is "command not found" or a command fails with an auth error, it
isn't configured yet. Tell the user to run, inside the `mcp-google-drive` repo:

```bash
npm run setup       # builds, places Google credentials, signs in, links gdrive onto PATH
```

`npm run setup` prints exact next steps (with links) if Google credentials are
missing — it's a ~2-minute one-time GCP step. Do not try to work around setup.

## Commands

```
gdrive search <query> [--type docs|sheets] [--page-size N]   # find files -> JSON
gdrive meta <id|url>                                         # file metadata
gdrive docs read <id|url> [--section "H"] [--json] [--no-images]
gdrive docs headings <id|url> [--min N] [--max N]            # outline
gdrive docs comments <id|url> [--include-resolved]           # comments + replies
gdrive docs create --name "Title" [--from FILE]              # new Doc from Markdown (stdin ok)
gdrive docs update <id|url> [--from FILE]                    # full-replace Doc from Markdown
gdrive sheets read <id|url> [--range "'Tab'!A1:D"] [--csv|--tsv|--json]
gdrive files read <id|url>                                   # raw bytes/text
```

## Patterns

- **Find then read:** `gdrive search "spec" --type docs`, take the `id`, then
  `gdrive docs read <id> > /tmp/spec.md`.
- **Sheet data into tools:** `gdrive sheets read <id> --range "'Sheet1'!A:D" --csv | ...`.
- **Review feedback:** `gdrive docs comments <id>` (author, quoted text, replies).
- **Write a doc:** author Markdown locally, then
  `gdrive docs create --name "Notes" --from notes.md` (prints the new URL), or
  `echo "# Hi" | gdrive docs update <id>` to replace an existing doc's body.

## Caveats

- `docs update` is a **full-body replace** — it does not preserve embedded
  images or anchored comments. Local image refs (`![](./x.png)`) are stripped
  before import (public image URLs are kept). For targeted edits, fetch a fresh
  copy and edit manually.
- Binary files are refused on an interactive terminal — redirect them.
