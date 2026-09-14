#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { lookupAbility } from "./abilities.js";
import { describeMechanicsContext, exportRosterPayload, importAndCheckRoster, resolveUnits, runDamageProjection } from "./mechanics.js";
import { addEvent, addEvidence, assembleMetaPicture } from "./meta.js";
import { captureListhammerPage } from "./sources.js";
import { DEFAULT_WORKSPACE, initWorkspace, loadWorkspace, saveWorkspace, writeWorkspaceArtifact } from "./workspace.js";

const HELP = `40K Roster Coach deterministic helper

Commands:
  workspace init [--workspace PATH]
  context
  resolve unit QUERY [--faction ID]
  roster import FILE [--workspace PATH]
  roster export REPORT_OR_ROSTER_FILE --format FORMAT
  damage FILE
  ability lookup ABILITY_ID --repo PATH --commit SHA --faction ID [--edition VALUE] [--dataslate VALUE]
  listhammer capture URL [--workspace PATH]
  meta event-add FILE [--workspace PATH]
  meta evidence-add FILE [--workspace PATH]
  meta report EVENT_ID [--workspace PATH]
`;

async function main(argv: string[]): Promise<void> {
  const [domain, action, ...rest] = argv;
  if (!domain || domain === "help" || domain === "--help" || domain === "-h") {
    process.stdout.write(HELP);
    return;
  }
  if (domain === "context") {
    printJson(describeMechanicsContext());
    return;
  }

  const commandArguments = domain === "damage"
    ? [action, ...rest].filter((value): value is string => value !== undefined)
    : rest;
  const parsed = parseArgs({
    args: commandArguments,
    allowPositionals: true,
    options: {
      workspace: { type: "string", default: DEFAULT_WORKSPACE },
      faction: { type: "string" },
      repo: { type: "string" },
      commit: { type: "string" },
      edition: { type: "string" },
      dataslate: { type: "string" },
      format: { type: "string" },
    },
  });
  const workspace = parsed.values.workspace ?? DEFAULT_WORKSPACE;

  if (domain === "workspace" && action === "init") {
    printJson(await initWorkspace(workspace));
    return;
  }
  if (domain === "resolve" && action === "unit") {
    const query = requirePositional(parsed.positionals, 0, "unit query");
    printJson(resolveUnits(query, parsed.values.faction));
    return;
  }
  if (domain === "roster" && action === "import") {
    const inputPath = requirePositional(parsed.positionals, 0, "roster file");
    const sourceText = await readFile(inputPath, "utf8");
    const decoded = decodeInput(sourceText);
    await initWorkspace(workspace);
    const report = importAndCheckRoster(decoded, inputPath);
    const sourceHash = report.source.contentHash.slice("sha256:".length);
    const sourceArtifact = await writeWorkspaceArtifact(
      `rosters/sources/${sourceHash}-${safeBasename(inputPath)}`,
      sourceText,
      workspace,
    );
    const reportArtifact = await writeWorkspaceArtifact(
      `rosters/reports/${sourceHash}.json`,
      `${JSON.stringify({ ...report, source: { ...report.source, artifactPath: sourceArtifact } }, null, 2)}\n`,
      workspace,
    );
    printJson({ ...report, source: { ...report.source, artifactPath: sourceArtifact }, reportArtifact });
    return;
  }
  if (domain === "roster" && action === "export") {
    const inputPath = requirePositional(parsed.positionals, 0, "roster report or canonical roster file");
    const format = requireOption(parsed.values.format, "--format");
    process.stdout.write(exportRosterPayload(await readJsonFile(inputPath), format));
    return;
  }
  if (domain === "damage") {
    const inputPath = requirePositional(parsed.positionals, 0, "damage request file");
    printJson(runDamageProjection(JSON.parse(await readFile(inputPath, "utf8"))));
    return;
  }
  if (domain === "ability" && action === "lookup") {
    const abilityId = requirePositional(parsed.positionals, 0, "ability id");
    const repositoryRoot = requireOption(parsed.values.repo, "--repo");
    const repositoryCommit = requireOption(parsed.values.commit, "--commit");
    const factionId = requireOption(parsed.values.faction, "--faction");
    printJson(await lookupAbility({
      repositoryRoot,
      repositoryCommit,
      factionId,
      abilityId,
      ...(parsed.values.edition ? { expectedEdition: parsed.values.edition } : {}),
      ...(parsed.values.dataslate ? { expectedDataslate: parsed.values.dataslate } : {}),
    }));
    return;
  }
  if (domain === "listhammer" && action === "capture") {
    const url = requirePositional(parsed.positionals, 0, "Listhammer URL");
    await initWorkspace(workspace);
    printJson(await captureListhammerPage(url, workspace));
    return;
  }
  if (domain === "meta" && action === "event-add") {
    const state = await loadWorkspace(workspace);
    const input = await readJsonFile(requirePositional(parsed.positionals, 0, "event JSON file"));
    const next = addEvent(state, input);
    await saveWorkspace(next, workspace);
    printJson(next.events.at(-1));
    return;
  }
  if (domain === "meta" && action === "evidence-add") {
    const state = await loadWorkspace(workspace);
    const input = await readJsonFile(requirePositional(parsed.positionals, 0, "evidence JSON file"));
    const next = addEvidence(state, input);
    await saveWorkspace(next, workspace);
    printJson(next.evidence.at(-1));
    return;
  }
  if (domain === "meta" && action === "report") {
    const state = await loadWorkspace(workspace);
    printJson(assembleMetaPicture(state, requirePositional(parsed.positionals, 0, "event id")));
    return;
  }
  throw new Error(`Unknown command: ${[domain, action].filter(Boolean).join(" ")}\n\n${HELP}`);
}

function requirePositional(values: string[], index: number, label: string): string {
  const value = values[index];
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function requireOption(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing required option ${label}`);
  return value;
}

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function decodeInput(text: string): unknown {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      // A plain-text roster can begin with punctuation. Let upstream adapters diagnose it.
    }
  }
  return text;
}

function safeBasename(path: string): string {
  return basename(path).replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
