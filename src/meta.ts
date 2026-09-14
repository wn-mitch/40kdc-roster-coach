import {
  evidenceRecordSchema,
  eventContextSchema,
  type EvidenceRecord,
  type EventContext,
  type WorkspaceState,
} from "./schema.js";

export interface ScenarioSignal {
  tag: string;
  evidenceIds: string[];
  distinctSubjects: number;
  localEvidenceCount: number;
  globalEvidenceCount: number;
}

export interface MetaPicture {
  schemaVersion: 1;
  event: EventContext;
  evidenceCount: number;
  duplicateCount: number;
  countsByStream: Record<string, number>;
  observedSubjectCount: number;
  unscoutedRemainder: number | null;
  attendance: Record<string, number>;
  scenarios: ScenarioSignal[];
  claimsByStream: Record<string, { id: string; claim: string }[]>;
  limitations: string[];
}

export function addEvent(state: WorkspaceState, input: unknown): WorkspaceState {
  const event = eventContextSchema.parse(input);
  if (state.events.some((candidate) => candidate.id === event.id)) {
    throw new Error(`Event ${event.id} already exists`);
  }
  return { ...state, events: [...state.events, event] };
}

export function addEvidence(state: WorkspaceState, input: unknown): WorkspaceState {
  const record = evidenceRecordSchema.parse(input);
  if (state.evidence.some((candidate) => candidate.id === record.id)) {
    throw new Error(`Evidence ${record.id} already exists`);
  }
  if (record.duplicateOf === record.id) {
    throw new Error("Evidence cannot duplicate itself");
  }
  if (record.duplicateOf && !state.evidence.some((candidate) => candidate.id === record.duplicateOf)) {
    throw new Error(`Duplicate target ${record.duplicateOf} does not exist`);
  }
  return { ...state, evidence: [...state.evidence, record] };
}

export function assembleMetaPicture(state: WorkspaceState, eventId: string): MetaPicture {
  const event = state.events.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error(`Event ${eventId} does not exist`);

  const relevant = state.evidence.filter(
    (record) => record.eventRef === eventId || record.eventApplicability === "general",
  );
  const active = relevant.filter((record) => !record.duplicateOf);
  const subjects = new Set(active.flatMap((record) => record.subjectRef ? [record.subjectRef] : []));
  const attendanceBySubject = new Map<string, Set<string>>();
  const attendance: Record<string, number> = {};
  const countsByStream: Record<string, number> = {};
  const claimsByStream: Record<string, { id: string; claim: string }[]> = {};

  for (const record of active) {
    countsByStream[record.stream] = (countsByStream[record.stream] ?? 0) + 1;
    (claimsByStream[record.stream] ??= []).push({ id: record.id, claim: record.claim });
    if (record.subjectRef) {
      const statuses = attendanceBySubject.get(record.subjectRef);
      if (statuses) statuses.add(record.attendanceStatus);
      else attendanceBySubject.set(record.subjectRef, new Set([record.attendanceStatus]));
    }
  }
  for (const statuses of attendanceBySubject.values()) {
    const key = statuses.size === 1 ? [...statuses][0]! : "conflicting";
    attendance[key] = (attendance[key] ?? 0) + 1;
  }

  const scenarioMap = new Map<string, EvidenceRecord[]>();
  for (const record of active) {
    for (const tag of record.scenarioTags) {
      const bucket = scenarioMap.get(tag);
      if (bucket) bucket.push(record);
      else scenarioMap.set(tag, [record]);
    }
  }
  const scenarios = [...scenarioMap.entries()]
    .map(([tag, records]) => ({
      tag,
      evidenceIds: records.map((record) => record.id),
      distinctSubjects: new Set(records.flatMap((record) => record.subjectRef ? [record.subjectRef] : [])).size,
      localEvidenceCount: records.filter(isLocalEvidence).length,
      globalEvidenceCount: records.filter((record) => !isLocalEvidence(record)).length,
    }))
    .sort((left, right) => right.localEvidenceCount - left.localEvidenceCount || left.tag.localeCompare(right.tag));

  const limitations: string[] = [];
  if (event.fieldSize === null) limitations.push("Event field size is unknown; local frequency denominators are unavailable.");
  if (!active.some((record) => record.stream === "registration")) limitations.push("No registration evidence is recorded.");
  if (!active.some((record) => record.stream === "submitted_roster")) limitations.push("No submitted-roster evidence is recorded.");
  if (!active.some((record) => record.source.kind === "listhammer")) limitations.push("No Listhammer evidence is recorded for this picture.");
  if (active.some((record) => record.sample?.selectionBias)) limitations.push("Retrieved-list samples retain their recorded selection bias and are not treated as the whole field.");

  return {
    schemaVersion: 1,
    event,
    evidenceCount: active.length,
    duplicateCount: relevant.length - active.length,
    countsByStream,
    observedSubjectCount: subjects.size,
    unscoutedRemainder: event.fieldSize === null ? null : Math.max(0, event.fieldSize - subjects.size),
    attendance,
    scenarios,
    claimsByStream,
    limitations,
  };
}

function isLocalEvidence(record: EvidenceRecord): boolean {
  return record.stream !== "global_results" && record.stream !== "comparable_list";
}
