import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { abilityEvidenceSchema, type AbilityEvidence } from "./schema.js";

const abilityFileSchema = z.array(z.unknown());

export interface AbilityLookupResult {
  repositoryRoot: string;
  repositoryCommit: string;
  repositoryCommitVerification: "caller_declared";
  recordLocator: string;
  contentHash: string;
  record: AbilityEvidence;
  applicability: "matched" | "conflicting_version" | "unverified";
  diagnostics: string[];
}

export async function lookupAbility(options: {
  repositoryRoot: string;
  repositoryCommit: string;
  factionId: string;
  abilityId: string;
  expectedEdition?: string;
  expectedDataslate?: string;
}): Promise<AbilityLookupResult> {
  if (!/^[a-z0-9-]+$/.test(options.factionId)) throw new Error("Invalid faction id");
  const root = resolve(options.repositoryRoot);
  const path = resolve(root, `${options.factionId}.json`);
  if (!path.startsWith(`${root}/`)) throw new Error("Ability file escapes repository root");
  const entries = abilityFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const matches = entries.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" &&
      entry !== null &&
      "ability_id" in entry &&
      entry.ability_id === options.abilityId,
  );
  if (matches.length === 0) throw new Error(`Ability ${options.abilityId} was not found in ${options.factionId}.json`);
  if (matches.length > 1) throw new Error(`Ability ${options.abilityId} is ambiguous in ${options.factionId}.json`);
  const record = abilityEvidenceSchema.parse(matches[0]);
  const diagnostics: string[] = [];
  diagnostics.push("Repository commit is caller-declared; the selected record content hash is the verified local identity.");
  let applicability: AbilityLookupResult["applicability"] = "unverified";
  if (options.expectedEdition || options.expectedDataslate) {
    const editionMatches = !options.expectedEdition || record.game_version.edition === options.expectedEdition;
    const dataslateMatches = !options.expectedDataslate || record.game_version.dataslate === options.expectedDataslate;
    applicability = editionMatches && dataslateMatches ? "matched" : "conflicting_version";
    if (!editionMatches) diagnostics.push(`Expected edition ${options.expectedEdition}; record declares ${record.game_version.edition}.`);
    if (!dataslateMatches) diagnostics.push(`Expected dataslate ${options.expectedDataslate}; record declares ${record.game_version.dataslate}.`);
  } else {
    diagnostics.push("No expected rules version was supplied; current-event applicability is unverified.");
  }
  if (record.source.edition && record.source.edition !== record.game_version.edition) {
    diagnostics.push(`Source edition ${record.source.edition} differs from target edition ${record.game_version.edition}; carry-forward needs review.`);
  }
  const canonical = JSON.stringify(record);
  return {
    repositoryRoot: root,
    repositoryCommit: options.repositoryCommit,
    repositoryCommitVerification: "caller_declared",
    recordLocator: `${options.factionId}.json#ability_id=${options.abilityId}`,
    contentHash: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
    record,
    applicability,
    diagnostics,
  };
}
