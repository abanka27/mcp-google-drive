export type OutputFormat = "json" | "text";

export function getOutputFormat(): OutputFormat {
  const raw = process.env.MCP_GDRIVE_OUTPUT_FORMAT?.toLowerCase();
  if (raw === "text") {
    return "text";
  }
  return "json";
}
