import assert from "node:assert/strict";
import test from "node:test";
import { describeMechanicsContext, exportRosterPayload, importAndCheckRoster, resolveUnits, runDamageProjection } from "../src/mechanics.js";

test("mechanics context records the pinned dependency", () => {
  const context = describeMechanicsContext();
  assert.equal(context.packageVersion, "1.4.3");
  assert.match(context.contentIdentity, /embedded/);
  assert.ok(context.facilities.includes("expected_value_damage"));
});

test("faction-scoped lookup resolves the Nightbringer", () => {
  const matches = resolveUnits("Nightbringer", "necrons");
  assert.equal(matches.length, 1);
  assert.match(matches[0]!.name, /Nightbringer/i);
  assert.equal(matches[0]!.factionId, "necrons");
});

test("damage projection preserves expected-value labels and stages", () => {
  const weapon = resolveUnits("Lokhust Heavy Destroyers", "necrons")[0]?.weaponIds[0];
  assert.ok(weapon, "fixture attacker must expose a weapon");
  const result = runDamageProjection({
    schemaVersion: 1,
    attacker: { weaponId: weapon, profileIndex: 0, modelsFiring: 1 },
    target: { unitId: "ctan-shard-of-the-nightbringer", factionId: "necrons", profileIndex: 0, modelCount: 1 },
    buffs: [],
    context: {},
    effectCoverage: [
      { reference: "weapon-profile", side: "attacker", treatment: "modeled", note: "Intrinsic profile and keywords use the public engine." },
      { reference: "target-abilities", side: "target", treatment: "unresolved", note: "Synthetic test does not model target ability prose." },
    ],
  });
  assert.equal(result.results.stages[0]?.name, "attacks");
  assert.match(result.labels.modelsKilled, /not expected casualties/);
  assert.equal(result.coverage.status, "declared_with_omissions");
});

test("the same effect cannot be supplied as automatic and manual buffs", () => {
  const weapon = resolveUnits("Lokhust Heavy Destroyers", "necrons")[0]?.weaponIds[0];
  assert.ok(weapon);
  assert.throws(() => runDamageProjection({
    schemaVersion: 1,
    attacker: { weaponId: weapon, profileIndex: 0, modelsFiring: 1 },
    target: { unitId: "ctan-shard-of-the-nightbringer", factionId: "necrons", profileIndex: 0 },
    buffs: [
      { effectReference: "shared-effect", representation: "automatic", buff: {} },
      { effectReference: "shared-effect", representation: "manual", buff: {} },
    ],
    context: {},
    effectCoverage: [
      { reference: "shared-effect", side: "attacker", treatment: "modeled", note: "Synthetic duplicate representation." },
    ],
  }), /more than one buff/);
});

test("unresolved roster input cannot receive a clean legality certification", () => {
  const roster = {
    name: "Synthetic unresolved roster",
    source: { format: "roster-json", generated_by: null },
    faction_id: "necrons",
    detachments: [],
    battle_size: "strike-force",
    force_disposition: null,
    points: { declared_limit: 2000, detachment_cap: 3, total_reported: 0, total_computed: 0 },
    units: [{
      ref: { id: null, raw_name: "Synthetic Unknown Unit", resolved: false, candidates: [] },
      model_count: 1,
      points: null,
      is_warlord: false,
      enhancement: null,
      enhancement_points: null,
      wargear: [],
      leader_attachment: null,
    }],
    game_version: { edition: "11th", dataslate: "synthetic" },
    diagnostics: {
      resolved_units: 0,
      unresolved_units: 1,
      resolved_weapons: 0,
      unresolved_weapons: 0,
      warnings: [{ code: "unit-unresolved", message: "Synthetic unit is unresolved.", raw_name: "Synthetic Unknown Unit" }],
    },
  };
  const report = importAndCheckRoster(roster, "synthetic-fixture.json");
  assert.equal(report.checks.resolution.status, "unknown");
  assert.equal(report.checks.modeledLegality.status, "unknown");
  const exported = JSON.parse(exportRosterPayload(report, "roster-json"));
  assert.equal(exported.units[0].ref.resolved, false);
});
