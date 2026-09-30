/**
 * Mirrors case-schema/case-manifest.schema.json. Keep both in sync by hand —
 * the schema is the validated contract, this is the typed view of it in the app.
 */

export interface CaseManifest {
  schemaVersion: "1.0.0";
  caseId: string;
  displayName: string;
  provenance: Provenance;
  geometry: Geometry;
  regions: Region[];
  anatomicalContext?: AnatomicalContext;
  mriPreviews: MriPreview[];
  scenarios: Scenario[];
  limitations: Limitations;
}

export interface Provenance {
  datasetName: string;
  datasetVersion: string;
  sourceUrl: string;
  sourceCaseId: string;
  licence: string;
  /** e.g. "dataset-supplied expert annotation" or "manual demonstration contour — not expert-validated" */
  maskOrigin: string;
  redistributable?: boolean;
  checksums: Record<string, string>;
}

export interface Geometry {
  originalAffine: number[][];
  units: "mm";
  orientation: string;
  /** Display-only transform. Never use this when reporting a volume. */
  displayTransform: number[][];
}

export interface Region {
  id: string;
  label: string;
  meshPath: string;
  color: string;
  volumeMl: number;
  /** True for regions that are subsets of another (e.g. enhancing tumour within whole tumour). */
  isNested: boolean;
  nestedWithin?: string | null;
  available?: boolean;
}

export interface AnatomicalContext {
  meshPath: string;
  isPatientSpecific: boolean;
  label: string;
}

export type MriPlane = "axial" | "coronal" | "sagittal";

export interface MriPreview {
  plane: MriPlane;
  slicePosition: number;
  imagePath: string;
  overlayPath?: string | null;
}

export type ScenarioId =
  | "baseline"
  | "illustrative-expansion"
  | "resection"
  | "localised-reduction"
  | "global-reduction";

export interface ScenarioFrame {
  step: 0 | 1 | 2 | 3 | 4;
  meshPaths: Record<string, string>;
  volumesMl: Record<string, number>;
}

export interface Scenario {
  id: ScenarioId;
  method: string;
  /** Required plain-language caveat shown alongside the scenario — see plan section E. */
  explanation: string;
  parameters: Record<string, unknown>;
  frames: [ScenarioFrame, ScenarioFrame, ScenarioFrame, ScenarioFrame, ScenarioFrame];
}

export interface Limitations {
  missingAnatomy: string[];
  annotationStatus: string;
  simulationCaveats: string[];
}
