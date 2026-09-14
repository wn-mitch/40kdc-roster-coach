import assert from "node:assert/strict";
import test from "node:test";
import { addEvidence, addEvent, assembleMetaPicture } from "../src/meta.js";
import type { WorkspaceState } from "../src/schema.js";

const initial: WorkspaceState = {
  schemaVersion: 1,
  createdAt: "2026-09-14T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z",
  events: [],
  evidence: [],
};

function record(id: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id,
    stream: "direct_scouting",
    claim: "A local participant is practicing a vehicle-heavy roster for a teams event.",
    originalText: "Local alias is practicing vehicle spam for teams.",
    source: { kind: "user_report", locator: "conversation:fixture" },
    eventRef: "sample-rtt",
    subjectRef: "local-alias-01",
    attendanceStatus: "unknown",
    rosterCommitment: "practicing",
    eventApplicability: "teams_context",
    sourceConfidence: "high",
    interpretationConfidence: "high",
    scenarioTags: ["vehicle-pressure"],
    ...overrides,
  };
}

test("teams practice stays separate from attendance and submitted rosters", () => {
  let state = addEvent(initial, {
    schemaVersion: 1,
    id: "sample-rtt",
    label: "Synthetic RTT",
    format: "rtt",
    fieldSize: 12,
    rulesCutoff: null,
  });
  state = addEvidence(state, record("scout-1"));
  const picture = assembleMetaPicture(state, "sample-rtt");
  assert.deepEqual(picture.attendance, { unknown: 1 });
  assert.equal(picture.countsByStream.submitted_roster, undefined);
  assert.equal(picture.unscoutedRemainder, 11);
  assert.equal(picture.scenarios[0]?.localEvidenceCount, 1);
});

test("a retelling marked duplicate is not independent corroboration", () => {
  let state = addEvent(initial, {
    schemaVersion: 1,
    id: "sample-rtt",
    label: "Synthetic RTT",
    format: "rtt",
    fieldSize: null,
    rulesCutoff: null,
  });
  state = addEvidence(state, record("result-1", {
    stream: "local_event_history",
    eventApplicability: "this_event",
  }));
  state = addEvidence(state, record("retelling-1", {
    source: { kind: "user_report", locator: "conversation:retelling" },
    duplicateOf: "result-1",
  }));
  const picture = assembleMetaPicture(state, "sample-rtt");
  assert.equal(picture.evidenceCount, 1);
  assert.equal(picture.duplicateCount, 1);
  assert.equal(picture.scenarios[0]?.evidenceIds.length, 1);
  assert.equal(picture.unscoutedRemainder, null);
});

test("several archetypes for one subject do not create extra entrants", () => {
  let state = addEvent(initial, {
    schemaVersion: 1,
    id: "sample-rtt",
    label: "Synthetic RTT",
    format: "rtt",
    fieldSize: 8,
    rulesCutoff: null,
  });
  state = addEvidence(state, record("option-1", {
    attendanceStatus: "possible",
    rosterCommitment: "considering",
    scenarioTags: ["vehicle-pressure"],
  }));
  state = addEvidence(state, record("option-2", {
    attendanceStatus: "possible",
    rosterCommitment: "considering",
    scenarioTags: ["elite-infantry"],
  }));
  const picture = assembleMetaPicture(state, "sample-rtt");
  assert.equal(picture.observedSubjectCount, 1);
  assert.deepEqual(picture.attendance, { possible: 1 });
  assert.equal(picture.unscoutedRemainder, 7);
});
