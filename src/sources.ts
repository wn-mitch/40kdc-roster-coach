import { createHash } from "node:crypto";
import { writeWorkspaceArtifact } from "./workspace.js";

const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;

export interface PageCapture {
  schemaVersion: 1;
  source: "listhammer";
  url: string;
  retrievedAt: string;
  contentHash: string;
  bytes: number;
  title: string | null;
  artifactPath: string;
  manifestPath: string;
}

export function assertListhammerUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== "https:" || !["listhammer.info", "www.listhammer.info"].includes(url.hostname)) {
    throw new Error("Listhammer capture requires an https://listhammer.info URL");
  }
  url.hash = "";
  return url;
}

export async function captureListhammerPage(
  input: string,
  workspaceRoot?: string,
  fetcher: typeof fetch = fetch,
): Promise<PageCapture> {
  let url = assertListhammerUrl(input);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetcher(url, {
      redirect: "manual",
      headers: { "user-agent": "40kdc-roster-coach/0.1 (+local evidence capture)" },
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location) throw new Error(`Listhammer redirect ${response.status} omitted Location`);
    url = assertListhammerUrl(new URL(location, url).toString());
  }
  if (!response || !response.ok) throw new Error(`Listhammer request failed with HTTP ${response?.status ?? "unknown"}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CAPTURE_BYTES) throw new Error("Listhammer response exceeds 5 MiB capture limit");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_CAPTURE_BYTES) throw new Error("Listhammer response exceeds 5 MiB capture limit");
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? null);
  const artifactPath = await writeWorkspaceArtifact(`sources/listhammer-${digest}.html`, html, workspaceRoot);
  const capture = {
    schemaVersion: 1 as const,
    source: "listhammer" as const,
    url: url.toString(),
    retrievedAt: new Date().toISOString(),
    contentHash: `sha256:${digest}`,
    bytes: bytes.byteLength,
    title,
    artifactPath,
  };
  const manifestPath = await writeWorkspaceArtifact(
    `sources/listhammer-${digest}.json`,
    `${JSON.stringify(capture, null, 2)}\n`,
    workspaceRoot,
  );
  return { ...capture, manifestPath };
}

function decodeEntities(value: string | null): string | null {
  return value?.replaceAll("&amp;", "&").replaceAll("&quot;", "\"").replaceAll("&#39;", "'") ?? null;
}
