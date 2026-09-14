import { z } from "zod";

export const confidenceSchema = z.enum(["low", "medium", "high", "unknown"]);
export const evidenceStreamSchema = z.enum([
  "global_results",
  "comparable_list",
  "local_event_history",
  "registration",
  "submitted_roster",
  "direct_scouting",
  "personal_match_report",
]);
export const evidenceSourceKindSchema = z.enum([
  "listhammer",
  "bcp",
  "user_report",
  "saved_extract",
  "other",
]);
export const attendanceStatusSchema = z.enum([
  "confirmed",
  "probable",
  "possible",
  "unknown",
  "not_attending",
]);
export const rosterCommitmentSchema = z.enum([
  "submitted",
  "committed",
  "considering",
  "practicing",
  "historical",
  "unknown",
]);
export const eventApplicabilitySchema = z.enum([
  "this_event",
  "related_event",
  "teams_context",
  "general",
  "unknown",
]);

export const sourceSchema = z.object({
  kind: evidenceSourceKindSchema,
  locator: z.string().min(1),
  retrievedAt: z.iso.datetime().optional(),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  coverageNote: z.string().min(1).optional(),
});

export const sampleSchema = z.object({
  population: z.string().min(1),
  denominator: z.number().int().nonnegative().nullable(),
  selectionBias: z.string().min(1),
});

export const evidenceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  stream: evidenceStreamSchema,
  claim: z.string().min(1),
  originalText: z.string().min(1),
  source: sourceSchema,
  observedAt: z.iso.datetime().optional(),
  eventRef: z.string().min(1).optional(),
  subjectRef: z.string().min(1).optional(),
  factionId: z.string().min(1).optional(),
  attendanceStatus: attendanceStatusSchema.default("unknown"),
  rosterCommitment: rosterCommitmentSchema.default("unknown"),
  eventApplicability: eventApplicabilitySchema.default("unknown"),
  sourceConfidence: confidenceSchema.default("unknown"),
  interpretationConfidence: confidenceSchema.default("unknown"),
  scenarioTags: z.array(z.string().min(1)).default([]),
  duplicateOf: z.string().min(1).optional(),
  sample: sampleSchema.optional(),
});

export const eventContextSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  label: z.string().min(1),
  format: z.enum(["rtt", "gt", "major", "teams", "other", "unknown"]),
  fieldSize: z.number().int().positive().nullable(),
  rulesCutoff: z.string().min(1).nullable(),
});

export const workspaceStateSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  events: z.array(eventContextSchema),
  evidence: z.array(evidenceRecordSchema),
});

export const abilitySourceSchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  edition: z.string().min(1).optional(),
}).passthrough();

export const abilityEvidenceSchema = z.object({
  ability_id: z.string().min(1),
  name: z.string().min(1),
  faction_id: z.string().min(1),
  unit_ids: z.array(z.string()),
  ability_type: z.string().min(1),
  game_version: z.object({ edition: z.string().min(1), dataslate: z.string().min(1) }),
  source: abilitySourceSchema,
  raw_text: z.string().min(1),
}).passthrough();

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type EventContext = z.infer<typeof eventContextSchema>;
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;
export type AbilityEvidence = z.infer<typeof abilityEvidenceSchema>;
