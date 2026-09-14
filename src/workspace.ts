import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { workspaceStateSchema, type WorkspaceState } from "./schema.js";

export const DEFAULT_WORKSPACE = ".roster-coach";
const STATE_FILE = "state.json";

export function workspacePath(root = DEFAULT_WORKSPACE): string {
  return resolve(root);
}

export async function initWorkspace(root = DEFAULT_WORKSPACE): Promise<WorkspaceState> {
  const path = workspacePath(root);
  await mkdir(path, { recursive: true, mode: 0o700 });
  try {
    return await loadWorkspace(path);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }

  const now = new Date().toISOString();
  const state: WorkspaceState = {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    events: [],
    evidence: [],
  };
  await saveWorkspace(state, path);
  return state;
}

export async function loadWorkspace(root = DEFAULT_WORKSPACE): Promise<WorkspaceState> {
  const text = await readFile(resolve(workspacePath(root), STATE_FILE), "utf8");
  return workspaceStateSchema.parse(JSON.parse(text));
}

export async function saveWorkspace(
  state: WorkspaceState,
  root = DEFAULT_WORKSPACE,
): Promise<void> {
  const path = workspacePath(root);
  await mkdir(path, { recursive: true, mode: 0o700 });
  const target = resolve(path, STATE_FILE);
  const next = workspaceStateSchema.parse({ ...state, updatedAt: new Date().toISOString() });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
}

export async function writeWorkspaceArtifact(
  relativePath: string,
  content: string,
  root = DEFAULT_WORKSPACE,
): Promise<string> {
  if (relativePath.startsWith("/") || relativePath.split(/[\\/]/).includes("..")) {
    throw new Error("Workspace artifact path must be relative and cannot contain '..'");
  }
  const base = workspacePath(root);
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}/`)) {
    throw new Error("Workspace artifact path escapes the workspace");
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, content, { mode: 0o600 });
  return target;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
