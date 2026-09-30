# Components
Native buttons, labels, range inputs and checkboxes. No component library.

```
import type { CaseManifest } from "../case/types";

export type ViewName = "overview" | "explore" | "scenarios";

/** Existing page markup; interactions are connected in main.ts. */
export function renderOverview(manifest: CaseManifest): string {
  const { provenance, limitations } = manifest;
  return `
    <section aria-labelledby="overview-heading">
      <h2 id="overview-heading">${escapeHtml(manifest.displayName)}</h2>
      <dl>
        <dt>Dataset</dt><dd>${escapeHtml(provenance.datasetName)} (${escapeHtml(provenance.datasetVersion)})</dd>
        <dt>Source case</dt><dd>${escapeHtml(provenance.sourceCaseId)}</dd>
        <dt>Licence</dt><dd>${escapeHtml(provenance.licence)}</dd>
        <dt>Annotation status</dt><dd>${escapeHtml(provenance.maskOrigin)}</dd>
      </dl>
      <h3>Limitations</h3>
      <p>${escapeHtml(limitations.annotationStatus)}</p>
      <ul>
        ${limitations.missingAnatomy.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </section>
  `;
}

export function renderExplore(manifest: CaseManifest): string {
  return `
    <section aria-labelledby="explore-heading">
      <h2 id="explore-heading">Explore</h2>
      <p>${escapeHtml(manifest.provenance.maskOrigin)}</p>
      <p id="viewer-status" role="status">Loading 3D model…</p>
      <div id="viewer-container" style="width:100%;height:60vh;"></div>
      <button id="reset-view" type="button">Reset view</button>
      <label>Clipping <input id="clipping" type="range" min="-2" max="2" step="0.01" value="2" /></label>
      <p>Drag to rotate; scroll or pinch to zoom. RAS coordinates: superior is up at reset. Volumes are measured from masks.</p>
      <div id="mri-previews">
        ${manifest.mriPreviews
          .map((p) => `<figure data-plane="${p.plane}"><img src="/cases/${manifest.caseId}/${p.overlayPath ?? p.imagePath}" alt="${p.plane} MRI slice with demonstration contour" /><figcaption>${p.plane} · source slice ${p.slicePosition}</figcaption></figure>`)
          .join("")}
      </div>
      <fieldset id="region-controls">
        <legend>Regions</legend>
        ${manifest.regions.filter(r => r.available !== false)
          .map(
            (r) =>
              `<label><input type="checkbox" checked data-region-id="${r.id}" /> ${escapeHtml(r.label)} (${r.volumeMl.toFixed(2)} mL)</label>`,
          )
          .join("")}
      </fieldset>
    </section>
  `;
}

export function renderScenarios(manifest: CaseManifest): string {
  return `
    <section aria-labelledby="scenarios-heading">
      <h2 id="scenarios-heading">Scenarios</h2>
      <p>Educational simulation steps — not acquired follow-up scans.</p>
      <p id="viewer-status" role="status">Loading 3D model…</p>
      <div id="viewer-container" style="width:100%;height:60vh;"></div>
      <select id="scenario-select" aria-label="Scenario">
        ${manifest.scenarios.map((s) => `<option value="${s.id}">${escapeHtml(s.method)}</option>`).join("")}
      </select>
      <label>Expansion parameter sensitivity <select id="sensitivity"><option>low</option><option selected>medium</option><option>high</option></select></label>
      <input aria-label="Simulation step" id="scenario-step" type="range" min="0" max="4" value="0" step="1" />
      <p id="scenario-explanation"></p>
      <p id="scenario-volume"></p>
      <div id="scenario-chart"></div>
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

```
