import { google, docs_v1 } from "googleapis";
import { DocHeading, DocImage } from "./types.js";

const docs = google.docs("v1");

/** Extract the visible text of a paragraph element. */
function paragraphText(para: docs_v1.Schema$Paragraph | undefined): string {
  let text = "";
  for (const elem of para?.elements ?? []) {
    if (elem.textRun?.content) {
      text += elem.textRun.content;
    }
  }
  return text.trim();
}

/**
 * Fetch a Google Doc once and derive headings + embedded image manifest.
 * Both `listHeadings` and `getInlineImages` call through here so a command
 * needing both only pays for a single API round-trip.
 */
export async function getDocStructure(
  documentId: string,
): Promise<{ headings: DocHeading[]; images: DocImage[] }> {
  const doc = await docs.documents.get({ documentId });
  const content = doc.data.body?.content ?? [];

  const headings: DocHeading[] = [];
  for (const element of content) {
    const para = element.paragraph;
    const namedStyle = para?.paragraphStyle?.namedStyleType;
    const headingId = para?.paragraphStyle?.headingId;
    if (!namedStyle || !namedStyle.startsWith("HEADING_") || !headingId) {
      continue;
    }
    const text = paragraphText(para);
    if (!text) {
      continue;
    }
    const level = Number.parseInt(namedStyle.replace("HEADING_", ""), 10);
    headings.push({ id: headingId, text, level: Number.isFinite(level) ? level : 0 });
  }

  const images: DocImage[] = [];
  for (const [objectId, obj] of Object.entries(doc.data.inlineObjects ?? {})) {
    const embedded = obj.inlineObjectProperties?.embeddedObject;
    if (!embedded) {
      continue;
    }
    const size = embedded.size;
    images.push({
      objectId,
      contentUri: embedded.imageProperties?.contentUri ?? null,
      altText: embedded.title || embedded.description || null,
      mimeType: null, // Docs API does not expose the image MIME directly
      widthPt: size?.width?.magnitude ?? null,
      heightPt: size?.height?.magnitude ?? null,
    });
  }

  return { headings, images };
}

export async function listHeadings(
  documentId: string,
  opts: { minLevel?: number; maxLevel?: number } = {},
): Promise<DocHeading[]> {
  const { headings } = await getDocStructure(documentId);
  return headings.filter((h) => {
    if (opts.minLevel !== undefined && h.level < opts.minLevel) return false;
    if (opts.maxLevel !== undefined && h.level > opts.maxLevel) return false;
    return true;
  });
}

/** Resolve a heading anchor id (from a #heading=... URL) to its heading text. */
export async function resolveHeadingText(
  documentId: string,
  headingId: string,
): Promise<string | null> {
  const { headings } = await getDocStructure(documentId);
  return headings.find((h) => h.id === headingId)?.text ?? null;
}

/**
 * Slice a section out of exported Markdown by heading text. Returns the
 * section (heading line through the next heading of equal-or-higher level)
 * plus the full list of headings for error/fallback display.
 */
export function extractSection(
  markdown: string,
  headingText: string,
): { section: string | null; headings: string[] } {
  const lines = markdown.split("\n");
  const headings: string[] = [];
  const sectionContent: string[] = [];
  let inSection = false;
  let sectionLevel = 0;

  // Markdown export escapes characters (e.g. "2. Context" -> "2\. Context")
  // and bolds headings, neither of which appear in Docs-API heading text.
  // Normalize both sides before comparing.
  const normalize = (s: string) => s.replace(/\*\*/g, "").replace(/\\/g, "").trim();
  const cleanSearch = normalize(headingText).toLowerCase();

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cleanText = normalize(headingMatch[2]);
      headings.push(`${"  ".repeat(level - 1)}- ${cleanText}`);

      if (inSection) {
        if (level <= sectionLevel) {
          break;
        }
      } else if (
        cleanText.toLowerCase() === cleanSearch ||
        cleanText.toLowerCase().includes(cleanSearch)
      ) {
        inSection = true;
        sectionLevel = level;
        sectionContent.push(line);
        continue;
      }
    }
    if (inSection) {
      sectionContent.push(line);
    }
  }

  return {
    section: sectionContent.length > 0 ? sectionContent.join("\n").trim() : null,
    headings,
  };
}
