import { readSheet, rowsToDelimited } from "../../core/sheets.js";
import { resolveFileRef } from "../../core/links.js";
import { ArgError } from "../args.js";
import { emitJson, emitText } from "../output.js";
import { Command, CommandGroup } from "../types.js";

const sheetsRead: Command = {
  summary: "Read values from a Google Sheet via the Sheets API.",
  usage: "gdrive sheets read <fileId|url> [--range A1:B10] [--csv|--tsv|--json]",
  flags: {
    range: { type: "string", description: "A1 range, e.g. 'Sheet2!A1:C10' (default: first tab)" },
    csv: { type: "boolean", description: "Output CSV (default)" },
    tsv: { type: "boolean", description: "Output tab-separated values" },
    json: { type: "boolean", description: "Output structured JSON (values + tab list)" },
  },
  async run({ positionals, flags }) {
    const ref = positionals[0];
    if (!ref) throw new ArgError("Missing <fileId|url>");
    if (flags.csv && flags.tsv) throw new ArgError("Choose one of --csv or --tsv");

    const { fileId } = resolveFileRef(ref);
    const result = await readSheet(fileId, flags.range as string | undefined);

    if (flags.json) {
      emitJson(result);
      return;
    }

    const delimiter = flags.tsv ? "\t" : ",";
    emitText(rowsToDelimited(result.values, delimiter as "," | "\t"));

    // Surface other tabs without polluting the piped values.
    if (!flags.range && result.tabs.length > 1) {
      process.stderr.write(`note: read tab '${result.range}'; other tabs: ${result.tabs.join(", ")}\n`);
    }
  },
};

export const sheetsGroup: CommandGroup = {
  summary: "Google Sheets operations (read).",
  subcommands: { read: sheetsRead },
};
