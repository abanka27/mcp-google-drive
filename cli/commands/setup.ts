import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as readline from "node:readline/promises";
import { google } from "googleapis";
import { getValidCredentials } from "../../auth.js";
import { configHome } from "../../core/env.js";
import { Command } from "../types.js";

const GCP_INSTRUCTIONS = `
Google credentials not found. One-time GCP setup (~2 minutes):

  1. Create or pick a project:
       https://console.cloud.google.com/projectcreate
  2. Enable the three APIs (click "Enable" on each):
       Drive   https://console.cloud.google.com/apis/library/drive.googleapis.com
       Docs    https://console.cloud.google.com/apis/library/docs.googleapis.com
       Sheets  https://console.cloud.google.com/apis/library/sheets.googleapis.com
  3. Configure the OAuth consent screen — pick "Internal" if your account
     offers it (avoids a 7-day login expiry):
       https://console.cloud.google.com/apis/credentials/consent
  4. Create credentials -> OAuth client ID, application type "Desktop app":
       https://console.cloud.google.com/apis/credentials/oauthclient
  5. Download the JSON, then re-run:
       gdrive setup ~/Downloads/client_secret_XXXX.json
`;

const interactive = (): boolean => Boolean(process.stdin.isTTY);

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

/** Existing OAuth-client-keyfile candidates in cwd and ~/Downloads. */
function findKeyfiles(): string[] {
  const found: string[] = [];
  for (const dir of [process.cwd(), path.join(os.homedir(), "Downloads")]) {
    const named = path.join(dir, "gcp-oauth.keys.json");
    if (fs.existsSync(named)) found.push(named);
    try {
      for (const f of fs.readdirSync(dir)) {
        if (/^client_secret.*\.json$/.test(f)) found.push(path.join(dir, f));
      }
    } catch {
      // dir unreadable; skip
    }
  }
  return [...new Set(found)];
}

function assertKeyfile(file: string): void {
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!(parsed.installed || parsed.web)?.client_id) {
    throw new Error(`${file} is not an OAuth client keyfile (no client_id found).`);
  }
}

/** Resolve which keyfile to use: explicit arg, else confirm/choose a find. */
async function resolveKeyfile(explicit: string | undefined): Promise<string | null> {
  if (explicit) {
    const p = path.resolve(expandHome(explicit));
    if (!fs.existsSync(p)) throw new Error(`No such file: ${p}`);
    return p;
  }

  const candidates = findKeyfiles();
  if (candidates.length === 0) return null;

  if (!interactive()) {
    if (candidates.length === 1) {
      process.stderr.write(`Using ${candidates[0]}\n`);
      return candidates[0];
    }
    throw new Error(
      `Multiple credential files found; pass one explicitly:\n  ${candidates.join("\n  ")}`,
    );
  }

  if (candidates.length === 1) {
    const ans = await prompt(`Found ${candidates[0]}\nUse it? [Y/n, or type a path]: `);
    if (ans === "" || /^y(es)?$/i.test(ans)) return candidates[0];
    if (/^n(o)?$/i.test(ans)) return null;
    return path.resolve(expandHome(ans));
  }

  process.stderr.write("Found multiple credential files:\n");
  candidates.forEach((c, i) => process.stderr.write(`  [${i + 1}] ${c}\n`));
  const ans = await prompt("Pick a number, or type a path: ");
  const n = Number(ans);
  if (Number.isInteger(n) && n >= 1 && n <= candidates.length) return candidates[n - 1];
  return path.resolve(expandHome(ans));
}

const onPath = (): boolean =>
  (process.env.PATH || "")
    .split(path.delimiter)
    .some((d) => d && fs.existsSync(path.join(d, "gdrive")));

/** Create (or refresh) the gdrive symlink in `dir`. */
function linkInto(dir: string, binPath: string): void {
  const resolved = path.resolve(expandHome(dir));
  try {
    fs.mkdirSync(resolved, { recursive: true });
    const link = path.join(resolved, "gdrive");
    if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
    fs.symlinkSync(binPath, link);
    process.stdout.write(`✓ linked 'gdrive' -> ${link}\n`);
    const dirOnPath = (process.env.PATH || "").split(path.delimiter).includes(resolved);
    if (!dirOnPath) {
      process.stderr.write(`note: ${resolved} is not on your PATH — add it to use 'gdrive' directly.\n`);
    }
  } catch (e) {
    process.stderr.write(
      `could not link into ${resolved}: ${(e as Error).message}\n` +
        `  ln -s "${binPath}" "${path.join(resolved, "gdrive")}"\n`,
    );
  }
}

async function setUpPath(linkDir: string | undefined, noLink: boolean, binPath: string): Promise<void> {
  if (onPath()) {
    process.stdout.write("✓ 'gdrive' is already on your PATH\n");
    return;
  }
  if (noLink) return;

  if (linkDir) {
    linkInto(linkDir, binPath);
    return;
  }
  if (!interactive()) {
    process.stdout.write(
      `To run 'gdrive' anywhere, symlink it into a PATH directory:\n  ln -s "${binPath}" ~/.local/bin/gdrive\n`,
    );
    return;
  }

  const def = path.join(os.homedir(), ".local", "bin");
  const ans = await prompt(`Link 'gdrive' onto your PATH? [Enter = ${def}, 'n' = skip, or type a dir]: `);
  if (/^(n|no|skip)$/i.test(ans)) {
    process.stdout.write(`Skipped. Later:  ln -s "${binPath}" <dir-on-your-PATH>/gdrive\n`);
    return;
  }
  linkInto(ans === "" ? def : ans, binPath);
}

const setupCommand: Command = {
  summary: "One-time setup: place credentials, sign in, and link onto PATH.",
  usage: "gdrive setup [path/to/keyfile.json] [--link-dir DIR] [--no-link]",
  flags: {
    "link-dir": { type: "string", description: "Directory to symlink `gdrive` into (skips the prompt)" },
    "no-link": { type: "boolean", description: "Do not add `gdrive` to PATH" },
  },
  needsAuth: false, // handles its own authentication
  async run({ positionals, flags }) {
    const home = configHome();
    fs.mkdirSync(home, { recursive: true });
    const dest = path.join(home, "gcp-oauth.keys.json");

    // 1. Credentials keyfile.
    if (fs.existsSync(dest)) {
      process.stdout.write(`✓ credentials found at ${dest}\n`);
    } else {
      const chosen = await resolveKeyfile(positionals[0]);
      if (!chosen) {
        process.stderr.write(GCP_INSTRUCTIONS);
        process.exitCode = 1;
        return;
      }
      assertKeyfile(chosen);
      fs.copyFileSync(chosen, dest);
      fs.chmodSync(dest, 0o600);
      process.stdout.write(`✓ credentials placed at ${dest}\n`);
    }

    // 2. Authenticate (opens a browser on first run; reuses a saved token otherwise).
    process.stdout.write("Signing in to Google (a browser opens on first run)...\n");
    await getValidCredentials();
    try {
      const about = await google.drive("v3").about.get({ fields: "user/emailAddress" });
      process.stdout.write(`✓ signed in as ${about.data.user?.emailAddress ?? "your account"}\n`);
    } catch {
      process.stdout.write("✓ signed in\n");
    }

    // 3. Put `gdrive` on PATH (asks where, unless already linked or opted out).
    const binPath = fs.realpathSync(process.argv[1]);
    await setUpPath(flags["link-dir"] as string | undefined, Boolean(flags["no-link"]), binPath);

    process.stdout.write('\n✓ Setup complete. Try:  gdrive search ""\n');
  },
};

export { setupCommand };
