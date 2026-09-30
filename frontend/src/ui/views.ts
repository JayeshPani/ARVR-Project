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
      <p>${manifest.anatomicalContext ? escapeHtml(manifest.anatomicalContext.label) : "No brain context available."}</p>
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
      ${renderViewer(manifest)}
      <h3>MRI evidence</h3>
      <label><input id="mri-overlay" type="checkbox" checked /> Show demonstration contour on MRI</label>
      <div id="mri-previews">
        ${manifest.mriPreviews
          .map((p) => `<figure data-plane="${p.plane}"><img data-base-path="/cases/${manifest.caseId}/${p.imagePath}" data-overlay-path="/cases/${manifest.caseId}/${p.overlayPath ?? p.imagePath}" src="/cases/${manifest.caseId}/${p.overlayPath ?? p.imagePath}" alt="${p.plane} MRI slice with demonstration contour" /><figcaption>${p.plane} · source slice ${p.slicePosition}</figcaption></figure>`)
          .join("")}
      </div>

    </section>
  `;
}

export function renderScenarios(manifest: CaseManifest): string {
  return `
    <section aria-labelledby="scenarios-heading">
      <h2 id="scenarios-heading">Scenarios</h2>
      <p>Educational simulation steps — not acquired follow-up scans.</p>
      <p id="viewer-status" role="status">Loading 3D model…</p>
      ${renderViewer(manifest)}
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

function renderViewer(manifest: CaseManifest): string {
  return `
    <div class="viewer-layout">
      <div class="viewer-stage">
        <div id="viewer-container"></div>
        <p id="selection-info" class="selection-info" role="status">Click or tap the brain or tumour to inspect it.</p>
        <p class="viewer-hint">Drag to rotate · Scroll or pinch to zoom · Right-drag or two fingers to pan</p>
      </div>
      <fieldset id="viewer-controls" disabled>
        <legend>Brain interaction</legend>
        <div id="hand-controls" class="control-section"></div>
        <div class="control-section">
          <h3>Visibility</h3>
          <label><input id="brain-visible" type="checkbox" checked ${manifest.anatomicalContext ? "" : "disabled"} /> Show brain</label>
          <label for="brain-opacity">Brain opacity <output id="brain-opacity-value">30%</output></label>
          <input id="brain-opacity" type="range" min="0" max="100" value="30" step="1" ${manifest.anatomicalContext ? "" : "disabled"} />
          ${manifest.regions.filter(r => r.available !== false).map(r => `<label><input type="checkbox" checked data-region-id="${escapeHtml(r.id)}" /> ${escapeHtml(r.label)} <span data-region-volume="${escapeHtml(r.id)}">${r.volumeMl.toFixed(2)} mL</span></label>`).join("")}
          <div class="button-row"><button id="isolate-tumour" type="button" aria-pressed="false">Tumour only</button><button id="focus-tumour" type="button">Focus tumour</button></div>
        </div>
        <div class="control-section">
          <h3>View from</h3>
          <div class="view-presets">
            ${[["oblique", "3D"], ["anterior", "Front"], ["posterior", "Back"], ["left", "Left"], ["right", "Right"], ["superior", "Top"]].map(([id,label]) => `<button type="button" data-camera-view="${id}" aria-pressed="${id === "oblique"}">${label}</button>`).join("")}
          </div>
          <p class="control-note">Front = anterior. Left and right refer to the subject.</p>
          <div class="button-row"><button id="zoom-in" type="button" aria-label="Zoom in">Zoom +</button><button id="zoom-out" type="button" aria-label="Zoom out">Zoom −</button><button id="reset-view" type="button">Fit brain</button></div>
          <label><input id="auto-rotate" type="checkbox" /> Auto-rotate</label>
        </div>
        <div class="control-section">
          <label><input id="cut-enabled" type="checkbox" /> Enable cutaway</label>
          <label for="cut-plane">Cut plane</label>
          <select id="cut-plane"><option value="sagittal">Sagittal · left/right</option><option value="coronal">Coronal · front/back</option><option value="axial">Axial · top/bottom</option></select>
          <label for="cut-position">Cut position <output id="cut-position-value">50%</output></label>
          <input id="cut-position" type="range" min="0" max="100" value="50" step="1" />
          <label><input id="cut-reverse" type="checkbox" /> Cut from opposite side</label>
          <label><input id="cut-tumour" type="checkbox" /> Also clip tumour</label>
          <p class="control-note">Cutaways reveal the interior. They do not change measured volumes.</p>
        </div>
        <button id="reset-controls" type="button">Reset all controls</button>
      </fieldset>
    </div>
    <p class="context-note">${manifest.anatomicalContext ? escapeHtml(manifest.anatomicalContext.label) : "Brain context is unavailable for this case."}</p>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
