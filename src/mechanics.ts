import { createHash } from "node:crypto";
import {
  checkRoster,
  EXPORT_FORMATS,
  crunch,
  dataset,
  exportRoster,
  importRoster,
  units,
  weapons,
  type Buff,
  type EngineContext,
  type ExportFormat,
  type Roster,
} from "@alpaca-software/40kdc-data";
import { z } from "zod";

export const MECHANICS_PACKAGE = "@alpaca-software/40kdc-data";
export const MECHANICS_VERSION = "1.4.3";
export const PINNED_SOURCE_COMMIT = "02ae224884d1b6a9122b48fb221e20b0200b96d9";
export const PACKAGE_INTEGRITY = "sha512-wvS//Z0X9BlqpHeQwv9/h7BR5KqWDaLKumN19xcHsXA9ZVqVXuH75VcZDjyAgevKGEyBNknIqMDPY3EbIrW1nA==";

const effectTreatmentSchema = z.enum([
  "modeled",
  "manual_modeled",
  "not_applicable",
  "qualitative_only",
  "unsupported",
  "unresolved",
]);

const damageRequestSchema = z.object({
  schemaVersion: z.literal(1),
  attacker: z.object({
    weaponId: z.string().min(1),
    profileIndex: z.number().int().nonnegative(),
    modelsFiring: z.number().int().positive(),
  }),
  target: z.object({
    unitId: z.string().min(1),
    factionId: z.string().min(1).optional(),
    profileIndex: z.number().int().nonnegative(),
    modelCount: z.number().int().positive().optional(),
  }),
  buffs: z.array(z.object({
    effectReference: z.string().min(1),
    representation: z.enum(["automatic", "manual"]),
    buff: z.record(z.string(), z.unknown()),
  })).default([]),
  context: z.record(z.string(), z.unknown()).default({}),
  effectCoverage: z.array(z.object({
    reference: z.string().min(1),
    side: z.enum(["attacker", "target", "shared"]),
    treatment: effectTreatmentSchema,
    note: z.string().min(1),
  })).min(1),
}).superRefine((request, context) => {
  const coverage = new Map(request.effectCoverage.map((entry) => [entry.reference, entry]));
  if (coverage.size !== request.effectCoverage.length) {
    context.addIssue({ code: "custom", path: ["effectCoverage"], message: "Effect coverage references must be unique." });
  }
  const buffReferences = new Set<string>();
  request.buffs.forEach((entry, index) => {
    if (buffReferences.has(entry.effectReference)) {
      context.addIssue({ code: "custom", path: ["buffs", index], message: "An effect cannot be supplied as more than one buff." });
    }
    buffReferences.add(entry.effectReference);
    const treatment = coverage.get(entry.effectReference)?.treatment;
    const expected = entry.representation === "manual" ? "manual_modeled" : "modeled";
    if (treatment !== expected) {
      context.addIssue({
        code: "custom",
        path: ["buffs", index],
        message: `Buff ${entry.effectReference} requires ${expected} coverage.`,
      });
    }
  });
});

export function describeMechanicsContext() {
  const gameVersions = new Set<string>();
  for (const unit of units) {
    gameVersions.add(`${unit.raw.game_version.edition}/${unit.raw.game_version.dataslate}`);
  }
  return {
    schemaVersion: 1,
    dependency: MECHANICS_PACKAGE,
    packageVersion: MECHANICS_VERSION,
    pinnedSourceCommit: PINNED_SOURCE_COMMIT,
    packageIntegrity: PACKAGE_INTEGRITY,
    contentIdentity: `${MECHANICS_PACKAGE}@${MECHANICS_VERSION}:embedded`,
    gameVersions: [...gameVersions].sort(),
    facilities: ["entity_lookup", "roster_import", "pricing", "loadout_checks", "army_checks", "roster_export", "expected_value_damage"],
    limits: [
      "Imported unresolved units are skipped by mechanics checks and prevent full certification.",
      "Expected models killed is damage divided by wounds per model, not an allocation-aware casualty distribution.",
      "Ability prose and event applicability require the separately pinned ability evidence reader.",
    ],
  };
}

export function resolveUnits(query: string, factionId?: string) {
  return units.findAll(query)
    .filter((unit) => !factionId || unit.raw.faction_id === factionId)
    .map((unit) => ({
      id: unit.id,
      name: unit.raw.name,
      factionId: unit.raw.faction_id,
      gameVersion: unit.raw.game_version,
      profileCount: unit.raw.profiles.length,
      weaponIds: unit.weapons.map((weapon) => weapon.id),
      abilityIds: unit.abilities.map((ability) => ability.id),
    }));
}

export function importAndCheckRoster(decoded: unknown, sourceLocator: string) {
  const roster = importRoster(decoded, { dataset });
  const legality = checkRoster(roster, dataset);
  const unresolved = roster.diagnostics.unresolved_units + roster.diagnostics.unresolved_weapons;
  const armyErrors = legality.army.filter((finding) => finding.severity === "error");
  const loadoutErrors = legality.units.flatMap((unit) => unit.violations);
  const status = unresolved > 0
    ? "unknown"
    : armyErrors.length > 0 || loadoutErrors.length > 0
      ? "fail"
      : "pass";
  return {
    schemaVersion: 1,
    source: {
      locator: sourceLocator,
      contentHash: `sha256:${createHash("sha256").update(JSON.stringify(decoded)).digest("hex")}`,
      importedFormat: roster.source.format,
    },
    mechanicsContext: describeMechanicsContext(),
    roster,
    checks: {
      structural: { status: "pass" },
      resolution: {
        status: unresolved === 0 ? "pass" : "unknown",
        unresolvedUnits: roster.diagnostics.unresolved_units,
        unresolvedWeapons: roster.diagnostics.unresolved_weapons,
        diagnostics: roster.diagnostics.warnings,
      },
      modeledLegality: {
        status,
        checkedUnits: legality.units.length,
        loadoutFindings: legality.units,
        armyFindings: legality.army,
      },
      inventoryFeasibility: { status: "unknown", diagnostic: "No collection allocation was supplied." },
      eventReadiness: { status: "unknown", diagnostic: "Event pack, cutoff, and readiness inputs require local review." },
    },
  };
}

export function exportCheckedRoster(roster: Roster, format: ExportFormat): string {
  return exportRoster(roster, format, dataset);
}

export function exportRosterPayload(input: unknown, formatId: string): string {
  const format = EXPORT_FORMATS.find((candidate) => candidate.id === formatId)?.id;
  if (!format) throw new Error(`Unsupported export format ${formatId}`);
  const payload = typeof input === "object" && input !== null && "roster" in input
    ? input.roster
    : input;
  const roster = importRoster(payload, { dataset });
  return exportCheckedRoster(roster, format);
}

export function runDamageProjection(input: unknown) {
  const request = damageRequestSchema.parse(input);
  const weapon = weapons.getAny(request.attacker.weaponId);
  if (!weapon) throw new Error(`Weapon ${request.attacker.weaponId} does not exist`);
  const target = request.target.factionId
    ? units.getInFaction(request.target.unitId, request.target.factionId)
    : units.getAny(request.target.unitId);
  if (!target) throw new Error(`Target unit ${request.target.unitId} does not exist in the selected context`);
  const result = crunch({
    attacker: { weapon: weapon.raw, profileIndex: request.attacker.profileIndex },
    target: {
      unit: target.raw,
      profileIndex: request.target.profileIndex,
      ...(request.target.modelCount === undefined ? {} : { modelCount: request.target.modelCount }),
    },
    modelsFiring: request.attacker.modelsFiring,
    buffs: request.buffs.map((entry) => entry.buff as Buff),
    context: request.context as EngineContext,
  }, dataset);
  return {
    schemaVersion: 1,
    mechanicsContext: describeMechanicsContext(),
    inputs: request,
    results: result,
    labels: {
      damage: "expected post-save damage before or after FNP as named by the engine stage",
      modelsKilled: "damage-equivalent models; not expected casualties or wipe probability",
    },
    coverage: {
      status: request.effectCoverage.some((entry) =>
        ["qualitative_only", "unsupported", "unresolved"].includes(entry.treatment)
      ) ? "declared_with_omissions" : "declared_complete",
      scope: "Caller-declared effects only; absence from this list is not proof of exhaustive rules coverage.",
      effects: request.effectCoverage,
    },
  };
}
