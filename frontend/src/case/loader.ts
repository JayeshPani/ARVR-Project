import type { CaseManifest } from "./types";

export class ManifestLoadError extends Error {}

/**
 * Fetches and shallow-validates a case manifest. Fails clearly rather than
 * rendering a partially-broken viewer (plan section C).
 */
export async function loadCaseManifest(caseId: string): Promise<CaseManifest> {
  const url = `/cases/${caseId}/manifest.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ManifestLoadError(`Could not load case manifest at ${url}: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ManifestLoadError(`Expected JSON at ${url} but got content-type "${contentType}" (likely a missing file).`);
  }

  const manifest = (await response.json()) as CaseManifest;
  assertRequiredFields(manifest, url);
  return manifest;
}

function assertRequiredFields(manifest: Partial<CaseManifest>, url: string): asserts manifest is CaseManifest {
  const required: (keyof CaseManifest)[] = [
    "schemaVersion",
    "caseId",
    "displayName",
    "provenance",
    "geometry",
    "regions",
    "mriPreviews",
    "scenarios",
    "limitations",
  ];
  const missing = required.filter((key) => manifest[key] === undefined);
  if (missing.length > 0) {
    throw new ManifestLoadError(`Manifest at ${url} is missing required field(s): ${missing.join(", ")}`);
  }
}
