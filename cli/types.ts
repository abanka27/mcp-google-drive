import { FlagSpec, Parsed } from "./args.js";

/** A runnable leaf command. */
export interface Command {
  summary: string;
  usage: string;
  flags: FlagSpec;
  /** Set false to skip the entrypoint's pre-run authentication (e.g. setup). */
  needsAuth?: boolean;
  run(parsed: Parsed): Promise<void>;
}

/** A command tree node: either a runnable command or a group of subcommands. */
export type CommandNode = Command | CommandGroup;

export interface CommandGroup {
  summary: string;
  subcommands: Record<string, CommandNode>;
}

export function isCommand(node: CommandNode): node is Command {
  return typeof (node as Command).run === "function";
}
