/**
 * Minimal, schema-driven argument parser. Each command declares its flags
 * (and their types) so parsing is unambiguous — no guessing whether a token
 * after `--flag` is a value or the next flag.
 */

export type FlagType = "string" | "number" | "boolean";

export type FlagSpec = Record<string, { type: FlagType; description: string }>;

export interface Parsed {
  positionals: string[];
  flags: Record<string, string | number | boolean>;
}

export class ArgError extends Error {}

/** Parse argv tokens for a command against its flag spec. */
export function parseArgs(tokens: string[], spec: FlagSpec): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string | number | boolean> = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const body = token.slice(2);
    const eq = body.indexOf("=");
    const name = eq >= 0 ? body.slice(0, eq) : body;
    const inlineValue = eq >= 0 ? body.slice(eq + 1) : undefined;

    const def = spec[name];
    if (!def) {
      throw new ArgError(`Unknown flag: --${name}`);
    }

    if (def.type === "boolean") {
      if (inlineValue !== undefined) {
        throw new ArgError(`Flag --${name} does not take a value`);
      }
      flags[name] = true;
      continue;
    }

    let raw = inlineValue;
    if (raw === undefined) {
      const next = tokens[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new ArgError(`Flag --${name} requires a value`);
      }
      raw = next;
      i += 1;
    }

    if (def.type === "number") {
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        throw new ArgError(`Flag --${name} expects a number, got: ${raw}`);
      }
      flags[name] = num;
    } else {
      flags[name] = raw;
    }
  }

  return { positionals, flags };
}
