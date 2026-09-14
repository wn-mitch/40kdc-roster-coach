import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { initWorkspace, writeWorkspaceArtifact } from "../src/workspace.js";

test("workspace initializes private state and blocks path traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "roster-coach-workspace-"));
  const state = await initWorkspace(root);
  assert.equal(state.schemaVersion, 1);
  assert.equal(JSON.parse(await readFile(join(root, "state.json"), "utf8")).schemaVersion, 1);
  await assert.rejects(writeWorkspaceArtifact("../escape.json", "{}", root), /cannot contain/);
});
