import { getFileMetadata, readFileContent } from "../../core/drive.js";
import { resolveFileRef } from "../../core/links.js";
import { ArgError } from "../args.js";
import { emitBytes, emitText } from "../output.js";
import { Command, CommandGroup } from "../types.js";

const filesRead: Command = {
  summary: "Read raw content of any Drive file (text or binary) to stdout.",
  usage: "gdrive files read <fileId|url>   (redirect binary, e.g. '> out.pdf')",
  flags: {},
  async run({ positionals }) {
    const ref = positionals[0];
    if (!ref) throw new ArgError("Missing <fileId|url>");

    const { fileId } = resolveFileRef(ref);
    const metadata = await getFileMetadata(fileId);
    const content = await readFileContent(metadata);

    if (content.bytes) {
      emitBytes(content.bytes);
    } else {
      emitText(content.text ?? "");
    }
  },
};

export const filesGroup: CommandGroup = {
  summary: "Generic file operations (read).",
  subcommands: { read: filesRead },
};
