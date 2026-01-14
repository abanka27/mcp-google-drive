import { google, docs_v1 } from "googleapis";
import { GDriveReadFileInput, InternalToolResponse } from "./types.js";
import { cache, contentKey, headingKey } from "./cache.js";

export const schema = {
  name: "gdrive_read_file",
  description: "Read contents of a file from Google Drive. Can optionally extract a specific section by heading text.",
  inputSchema: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "ID of the file to read",
      },
      url: {
        type: "string",
        description: "Optional: Full Google Docs URL with heading anchor (e.g., https://docs.google.com/document/d/FILE_ID/edit#heading=h.xyz). Used to extract heading anchors for section extraction.",
      },
      sectionHeading: {
        type: "string",
        description: "Optional: Heading text to extract a specific section (e.g., '3.1 APIs'). Returns content from this heading until the next heading of same or higher level.",
      },
    },
    required: ["fileId"],
  },
} as const;

const drive = google.drive("v3");
const docs = google.docs("v1");

interface FileContent {
  uri?: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

interface FileMetadata {
  name: string;
  mimeType: string;
  modifiedTime: string;
}

/**
 * Extract file ID and heading ID from various Google Docs/Drive URL formats
 */
function parseGoogleDocsUrl(url: string): { fileId: string | null; headingId: string | null } {
  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  let fileId: string | null = null;
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      fileId = match[1];
      break;
    }
  }

  // Extract heading ID from anchor (e.g., #heading=h.iakbyeqm8krw)
  const headingMatch = url.match(/#heading=([a-zA-Z0-9_.]+)/);
  const headingId = headingMatch ? headingMatch[1] : null;

  return { fileId, headingId };
}

/**
 * Get file metadata (lightweight API call for cache validation)
 */
async function getFileMetadata(fileId: string): Promise<FileMetadata> {
  const file = await drive.files.get({
    fileId,
    fields: "mimeType,name,modifiedTime",
    supportsAllDrives: true,
  });
  
  return {
    name: file.data.name || fileId,
    mimeType: file.data.mimeType || "application/octet-stream",
    modifiedTime: file.data.modifiedTime || new Date().toISOString(),
  };
}

/**
 * Use Google Docs API to find heading text by heading ID
 * Results are cached and invalidated when file changes
 */
async function findHeadingTextById(
  documentId: string, 
  headingId: string,
  modifiedTime: string
): Promise<string | null> {
  // Check cache first
  const cacheKey = headingKey(documentId, headingId);
  const cached = cache.getIfFresh(cacheKey, modifiedTime);
  if (cached) {
    console.error(`[Cache] Heading hit: ${headingId}`);
    return cached;
  }

  try {
    console.error(`[Cache] Heading miss: ${headingId} - fetching from API`);
    const doc = await docs.documents.get({ documentId });
    const content = doc.data.body?.content || [];

    for (const element of content) {
      if (element.paragraph) {
        const para = element.paragraph;
        const namedStyle = para.paragraphStyle?.namedStyleType;
        
        // Check if this is a heading with matching ID
        if (namedStyle?.startsWith("HEADING_") && para.paragraphStyle?.headingId === headingId) {
          // Extract heading text
          let text = "";
          if (para.elements) {
            for (const elem of para.elements) {
              if (elem.textRun?.content) {
                text += elem.textRun.content;
              }
            }
          }
          const headingText = text.trim();
          
          // Cache the result
          cache.set(cacheKey, headingText, modifiedTime);
          
          return headingText;
        }
      }
    }
    return null;
  } catch (error) {
    // If Docs API fails, return null and fall back to other methods
    return null;
  }
}

/**
 * Extract a section from markdown content based on heading text
 */
function extractSection(content: string, headingText: string): { section: string | null; headings: string[] } {
  const lines = content.split('\n');
  const headings: string[] = [];
  let inSection = false;
  let sectionLevel = 0;
  let sectionContent: string[] = [];
  
  // Clean the search text
  const cleanSearch = headingText.replace(/\*\*/g, '').trim().toLowerCase();

  for (const line of lines) {
    // Check if this is a heading line (markdown format: # Heading)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const cleanText = text.replace(/\*\*/g, '').trim();
      
      // Track all headings for listing
      headings.push(`${'  '.repeat(level - 1)}- ${cleanText}`);
      
      if (inSection) {
        // If we hit a heading of same or higher level, stop
        if (level <= sectionLevel) {
          break;
        }
      } else {
        // Check if this is the heading we're looking for
        if (cleanText.toLowerCase() === cleanSearch ||
            cleanText.toLowerCase().includes(cleanSearch)) {
          inSection = true;
          sectionLevel = level;
          sectionContent.push(line);
          continue;
        }
      }
    }
    
    if (inSection) {
      sectionContent.push(line);
    }
  }
  
  return {
    section: sectionContent.length > 0 ? sectionContent.join('\n').trim() : null,
    headings,
  };
}

export async function readFile(
  args: GDriveReadFileInput,
): Promise<InternalToolResponse> {
  // fileId is required
  const fileId = args.fileId;
  
  if (!fileId) {
    return {
      content: [
        {
          type: "text",
          text: "Error: fileId is required",
        },
      ],
      isError: true,
    };
  }

  // Extract heading ID from URL if provided, and validate consistency
  let headingIdFromUrl: string | null = null;
  if (args.url) {
    const parsed = parseGoogleDocsUrl(args.url);
    headingIdFromUrl = parsed.headingId;
    
    // Validate that URL's fileId matches the provided fileId
    if (parsed.fileId && parsed.fileId !== fileId) {
      return {
        content: [
          {
            type: "text",
            text: `Error: fileId mismatch. Provided fileId "${fileId}" does not match URL's fileId "${parsed.fileId}"`,
          },
        ],
        isError: true,
      };
    }
  }

  // Get file metadata first (needed for cache validation)
  const metadata = await getFileMetadata(fileId);

  // Determine section heading to extract
  // Priority: URL heading anchor > explicit sectionHeading parameter
  let sectionHeading: string | undefined;
  
  // Priority 1: If URL has heading anchor, resolve and use it
  if (headingIdFromUrl) {
    const resolvedHeading = await findHeadingTextById(fileId, headingIdFromUrl, metadata.modifiedTime);
    if (resolvedHeading) {
      sectionHeading = resolvedHeading;
    }
  }
  
  // Priority 2: Fall back to explicit sectionHeading if no URL heading found
  if (!sectionHeading && args.sectionHeading) {
    sectionHeading = args.sectionHeading;
  }

  const result = await readGoogleDriveFile(fileId, metadata);
  
  // If section heading is requested (either explicit or from URL), extract just that section
  if (sectionHeading && result.contents.text) {
    const { section, headings } = extractSection(result.contents.text, sectionHeading);
    
    if (section) {
      return {
        content: [
          {
            type: "text",
            text: `Section "${sectionHeading}" from ${result.name}:\n\n${section}`,
          },
        ],
        isError: false,
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Section "${sectionHeading}" not found in ${result.name}.\n\nAvailable headings:\n${headings.join('\n')}`,
          },
        ],
        isError: false,
      };
    }
  }
  
  return {
    content: [
      {
        type: "text",
        text: `Contents of ${result.name}:\n\n${result.contents.text || result.contents.blob}`,
      },
    ],
    isError: false,
  };
}

async function readGoogleDriveFile(
  fileId: string,
  metadata: FileMetadata,
): Promise<{ name: string; contents: FileContent }> {
  // Check cache first
  const cacheKey = contentKey(fileId);
  const cached = cache.getIfFresh(cacheKey, metadata.modifiedTime);
  if (cached) {
    console.error(`[Cache] Content hit: ${fileId}`);
    return JSON.parse(cached);
  }
  
  console.error(`[Cache] Content miss: ${fileId} - fetching from API`);

  // For Google Docs/Sheets/etc we need to export
  if (metadata.mimeType.startsWith("application/vnd.google-apps")) {
    let exportMimeType: string;
    switch (metadata.mimeType) {
      case "application/vnd.google-apps.document":
        exportMimeType = "text/markdown";
        break;
      case "application/vnd.google-apps.spreadsheet":
        exportMimeType = "text/csv";
        break;
      case "application/vnd.google-apps.presentation":
        exportMimeType = "text/plain";
        break;
      case "application/vnd.google-apps.drawing":
        exportMimeType = "image/png";
        break;
      default:
        exportMimeType = "text/plain";
    }

    const res = await drive.files.export(
      { fileId, mimeType: exportMimeType },
      { responseType: "text" },
    );

    const result = {
      name: metadata.name,
      contents: {
        mimeType: exportMimeType,
        text: res.data as string,
      },
    };
    
    // Cache the result
    cache.set(cacheKey, JSON.stringify(result), metadata.modifiedTime);
    
    return result;
  }

  // For regular files download content
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  const isText =
    metadata.mimeType.startsWith("text/") || metadata.mimeType === "application/json";
  const content = Buffer.from(res.data as ArrayBuffer);

  const result = {
    name: metadata.name,
    contents: {
      mimeType: metadata.mimeType,
      ...(isText
        ? { text: content.toString("utf-8") }
        : { blob: content.toString("base64") }),
    },
  };
  
  // Cache the result
  cache.set(cacheKey, JSON.stringify(result), metadata.modifiedTime);
  
  return result;
}
