import { searchCommand } from "./commands/search.js";
import { metaCommand } from "./commands/meta.js";
import { docsGroup } from "./commands/docs.js";
import { sheetsGroup } from "./commands/sheets.js";
import { filesGroup } from "./commands/files.js";
import { setupCommand } from "./commands/setup.js";
import { Command, CommandNode, isCommand } from "./types.js";

export const registry: Record<string, CommandNode> = {
  setup: setupCommand,
  search: searchCommand,
  meta: metaCommand,
  docs: docsGroup,
  sheets: sheetsGroup,
  files: filesGroup,
};

/** Walk the command tree by leading tokens; return the matched leaf + the rest. */
export function resolveCommand(
  tokens: string[],
): { command: Command; rest: string[]; path: string[] } | { error: string } {
  let node: CommandNode | undefined;
  let map: Record<string, CommandNode> = registry;
  const path: string[] = [];
  let i = 0;

  for (; i < tokens.length; i += 1) {
    node = map[tokens[i]];
    if (!node) {
      return { error: `Unknown command: ${[...path, tokens[i]].join(" ")}` };
    }
    path.push(tokens[i]);
    if (isCommand(node)) {
      return { command: node, rest: tokens.slice(i + 1), path };
    }
    map = node.subcommands;
  }

  return { error: `"${path.join(" ")}" needs a subcommand: ${Object.keys(map).join(", ")}` };
}

/** Top-level help: the full command tree with one-line summaries. */
export function helpText(): string {
  const lines: string[] = ["gdrive — Google Drive/Docs/Sheets CLI", "", "Commands:"];
  for (const [name, node] of Object.entries(registry)) {
    if (isCommand(node)) {
      lines.push(`  ${name.padEnd(16)} ${node.summary}`);
    } else {
      for (const [sub, subNode] of Object.entries(node.subcommands)) {
        if (isCommand(subNode)) {
          lines.push(`  ${`${name} ${sub}`.padEnd(16)} ${subNode.summary}`);
        }
      }
    }
  }
  lines.push("", "Run a command with --help for its usage.");
  return lines.join("\n");
}

/** Usage string for a specific command path, including its flags. */
export function usageText(tokens: string[]): string | null {
  const resolved = resolveCommand(tokens);
  if ("error" in resolved) return null;
  const { command } = resolved;
  const lines = [command.summary, "", `Usage: ${command.usage}`];
  const flagNames = Object.keys(command.flags);
  if (flagNames.length > 0) {
    lines.push("", "Flags:");
    for (const [flag, def] of Object.entries(command.flags)) {
      lines.push(`  --${flag.padEnd(14)} ${def.description}`);
    }
  }
  return lines.join("\n");
}
