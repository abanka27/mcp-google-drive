import { getFileMetadata, readFileContent } from "../../core/drive.js";
import { extractSection, getDocStructure, listHeadings } from "../../core/docs.js";
import { resolveFileRef } from "../../core/links.js";
import { DOC_MIME, DocImage } from "../../core/types.js";
import { ArgError } from "../args.js";
import { emitJson, emitText } from "../output.js";
import { Command, CommandGroup } from "../types.js";

async function assertDoc(fileId: string) {
  const metadata = await getFileMetadata(fileId);
  if (metadata.mimeType !== DOC_MIME) {
    throw new Error(
      `Not a Google Doc (mimeType=${metadata.mimeType}). ` +
        `Use 'gdrive sheets read' for spreadsheets or 'gdrive files read' for other files.`,
    );
  }
  return metadata;
}

function imageNote(images: DocImage[]): void {
  if (images.length > 0) {
    process.stderr.write(
      `note: ${images.length} embedded image(s); re-run with --json for the manifest.\n`,
    );
  }
}

const docsRead: Command = {
  summary: "Read a Google Doc as Markdown (optionally a single section).",
  usage: "gdrive docs read <fileId|url> [--section \"Heading\"] [--json] [--no-images]",
  flags: {
    section: { type: "string", description: "Extract only this section by heading text" },
    json: { type: "boolean", description: "Emit structured JSON instead of raw Markdown" },
    "no-images": { type: "boolean", description: "Skip the embedded-image manifest" },
  },
  async run({ positionals, flags }) {
    const ref = positionals[0];
    if (!ref) throw new ArgError("Missing <fileId|url>");

    const { fileId, headingId } = resolveFileRef(ref);
    const metadata = await assertDoc(fileId);
    const content = await readFileContent(metadata);
    const markdown = content.text ?? "";

    const wantImages = !flags["no-images"];
    let explicitSection = flags.section as string | undefined;

    // One structure fetch covers both the image manifest and URL-anchor resolution.
    let images: DocImage[] = [];
    if (wantImages || (!explicitSection && headingId)) {
      const structure = await getDocStructure(fileId);
      images = structure.images;
      if (!explicitSection && headingId) {
        explicitSection = structure.headings.find((h) => h.id === headingId)?.text;
        if (!explicitSection) {
          // Tabbed-doc URL anchors (#heading=...) often don't match the Docs
          // API headingId, so resolution can fail. Warn rather than silently
          // returning the whole document.
          process.stderr.write(
            `warning: could not resolve heading anchor '${headingId}' ` +
              `(browser anchor ids can differ from API heading ids); reading full doc. ` +
              `Use --section "Heading text" to target a section reliably.\n`,
          );
        }
      }
    }

    const fileInfo = {
      id: metadata.id,
      name: metadata.name,
      mimeType: metadata.mimeType,
      modifiedTime: metadata.modifiedTime,
    };
    const withImages = wantImages ? { images } : {};

    // Section mode.
    if (explicitSection) {
      const { section, headings } = extractSection(markdown, explicitSection);
      if (!section) {
        emitJson({
          file: fileInfo,
          section: { requestedHeading: explicitSection, found: false, availableHeadings: headings },
        });
        return;
      }
      if (flags.json) {
        emitJson({
          file: fileInfo,
          section: { requestedHeading: explicitSection, found: true, content: section },
          ...withImages,
        });
        return;
      }
      emitText(section);
      if (wantImages) imageNote(images);
      return;
    }

    // Full mode.
    if (flags.json) {
      emitJson({ file: fileInfo, content: { mimeType: content.mimeType, text: markdown }, ...withImages });
      return;
    }
    emitText(markdown);
    if (wantImages) imageNote(images);
  },
};

const docsHeadings: Command = {
  summary: "List a Google Doc's headings (outline).",
  usage: "gdrive docs headings <fileId|url> [--min N] [--max N]",
  flags: {
    min: { type: "number", description: "Minimum heading level to include" },
    max: { type: "number", description: "Maximum heading level to include" },
  },
  async run({ positionals, flags }) {
    const ref = positionals[0];
    if (!ref) throw new ArgError("Missing <fileId|url>");

    const { fileId } = resolveFileRef(ref);
    const metadata = await assertDoc(fileId);
    const headings = await listHeadings(fileId, {
      minLevel: flags.min as number | undefined,
      maxLevel: flags.max as number | undefined,
    });

    emitJson({
      file: { id: metadata.id, name: metadata.name, modifiedTime: metadata.modifiedTime },
      headings,
    });
  },
};

export const docsGroup: CommandGroup = {
  summary: "Google Docs operations (read, headings).",
  subcommands: { read: docsRead, headings: docsHeadings },
};
