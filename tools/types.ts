// Define base types for our tool system
export interface Tool<T> {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: readonly string[];
  };
  handler: (args: T) => Promise<InternalToolResponse>;
}

// Our internal tool response format
export interface InternalToolResponse {
  content: {
    type: string;
    text: string;
  }[];
  isError: boolean;
}

// Input types for each tool
export interface GDriveSearchInput {
  query: string;
  pageToken?: string;
  pageSize?: number;
}

export interface GDriveReadFileInput {
  fileId?: string;
  url?: string;
  sectionHeading?: string;
}

export interface GDriveParseLinkInput {
  url: string;
}

export interface GDriveGetMetadataInput {
  fileId?: string;
  includeHeadings?: boolean;
}

export interface GDriveListHeadingsInput {
  fileId?: string;
  minLevel?: number;
  maxLevel?: number;
}

export interface GDriveReadContentInput {
  fileId?: string;
  mode?: "full" | "section";
  sectionHeading?: string;
}

export interface GDriveDownloadInput {
  fileId?: string;
  mode?: "full" | "section";
  sectionHeading?: string;
  destinationPath?: string;
  chunkSizeBytes?: number;
}
