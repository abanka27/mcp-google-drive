import { searchFiles } from "../../core/drive.js";
import { ArgError } from "../args.js";
import { emitJson } from "../output.js";
import { Command } from "../types.js";

export const searchCommand: Command = {
  summary: "Search Drive for files by name / full text.",
  usage: "gdrive search <query> [--type docs|sheets] [--page-size N] [--page-token TOKEN]",
  flags: {
    type: { type: "string", description: "Restrict to a type: docs | sheets" },
    "page-size": { type: "number", description: "Results per page (max 100)" },
    "page-token": { type: "string", description: "Token for the next page" },
  },
  async run({ positionals, flags }) {
    const query = positionals.join(" ");
    const type = flags.type as string | undefined;
    if (type && type !== "docs" && type !== "sheets") {
      throw new ArgError(`--type must be 'docs' or 'sheets', got: ${type}`);
    }

    const result = await searchFiles({
      query,
      type: type as "docs" | "sheets" | undefined,
      pageSize: flags["page-size"] as number | undefined,
      pageToken: flags["page-token"] as string | undefined,
    });

    emitJson(result);
  },
};
