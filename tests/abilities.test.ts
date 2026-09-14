import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { lookupAbility } from "../src/abilities.js";

test("ability lookup exposes source and target version conflict", async () => {
  const root = await mkdtemp(join(tmpdir(), "roster-coach-abilities-"));
  await writeFile(join(root, "synthetic-faction.json"), JSON.stringify([{
    ability_id: "synthetic-effect",
    name: "Synthetic Effect",
    faction_id: "synthetic-faction",
    unit_ids: ["synthetic-unit"],
    ability_type: "unit",
    game_version: { edition: "11th", dataslate: "fixture-a" },
    source: { kind: "fixture", ref: "fixture.json", edition: "10e" },
    raw_text: "Synthetic redistributable fixture text.",
  }]));

  const result = await lookupAbility({
    repositoryRoot: root,
    repositoryCommit: "fixture-commit",
    factionId: "synthetic-faction",
    abilityId: "synthetic-effect",
    expectedEdition: "11th",
    expectedDataslate: "fixture-b",
  });
  assert.equal(result.applicability, "conflicting_version");
  assert.match(result.diagnostics.join(" "), /Source edition 10e differs/);
  assert.match(result.contentHash, /^sha256:[a-f0-9]{64}$/);
});
