import { getFileMetadata } from "../../core/drive.js";
import { resolveFileRef } from "../../core/links.js";
import { ArgError } from "../args.js";
import { emitJson } from "../output.js";
import { Command } from "../types.js";

export const metaCommand: Command = {
  summary: "Show metadata for any Drive file.",
  usage: "gdrive meta <fileId|url>",
  flags: {},
  async run({ positionals }) {
    const ref = positionals[0];
    if (!ref) {
      throw new ArgError("Missing <fileId|url>");
    }
    const { fileId } = resolveFileRef(ref);
    const metadata = await getFileMetadata(fileId);
    emitJson(metadata);
  },
};
