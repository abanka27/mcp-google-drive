import { schema as gdriveSearchSchema, search } from './gdrive_search.js';
import { schema as gdriveReadFileSchema, readFile } from './gdrive_read_file.js';
import { schema as gdriveParseLinkSchema, parseLink } from './gdrive_parse_link.js';
import { schema as gdriveGetMetadataSchema, getMetadata } from './gdrive_get_metadata.js';
import { schema as gdriveListHeadingsSchema, listHeadings } from './gdrive_list_headings.js';
import { schema as gdriveReadContentSchema, readContent } from './gdrive_read_content.js';
import { schema as gdriveDownloadSchema, downloadContent } from './gdrive_download.js';
import {
  Tool,
  GDriveSearchInput,
  GDriveReadFileInput,
  GDriveParseLinkInput,
  GDriveGetMetadataInput,
  GDriveListHeadingsInput,
  GDriveReadContentInput,
  GDriveDownloadInput,
} from './types.js';

export const tools: Array<
  | Tool<GDriveSearchInput>
  | Tool<GDriveReadFileInput>
  | Tool<GDriveParseLinkInput>
  | Tool<GDriveGetMetadataInput>
  | Tool<GDriveListHeadingsInput>
  | Tool<GDriveReadContentInput>
  | Tool<GDriveDownloadInput>
> = [
  {
    ...gdriveSearchSchema,
    handler: search,
  },
  {
    ...gdriveReadFileSchema,
    handler: readFile,
  },
  {
    ...gdriveParseLinkSchema,
    handler: parseLink,
  },
  {
    ...gdriveGetMetadataSchema,
    handler: getMetadata,
  },
  {
    ...gdriveListHeadingsSchema,
    handler: listHeadings,
  },
  {
    ...gdriveReadContentSchema,
    handler: readContent,
  },
  {
    ...gdriveDownloadSchema,
    handler: downloadContent,
  },
];