# Layout
Single shared header with Overview, Explore, Scenarios navigation.

```
import "./style.css";
import { loadCaseManifest, ManifestLoadError } from "./case/loader";
import { renderOverview, renderExplore, renderScenarios, type ViewName } from "./ui/views";
import type { CaseManifest } from "./case/types";

import { renderVolumeChartSvg } from "./scenarios/volume-chart";
import { CaseSceneViewer } from "./viewer/scene";
import type { ScenarioFrame } from "./case/types";
let viewer: CaseSceneViewer | null = null;
let renderVersion = 0;

const DEFAULT_CASE_ID = "case-01";

const app = document.querySelector<HTMLDivElement>("#app")!;

async function main(): Promise<void> {
  renderLoading();

  let manifest: CaseManifest;
  try {
    manifest = await loadCaseManifest(DEFAULT_CASE_ID);
  } catch (error) {
    renderMissingAsset(error);
    return;
  }

  renderApp(manifest, "overview");
}

function renderLoading(): void {
  app.innerHTML = `<p role="status">Loading case…</p>`;
}

function renderMissingAsset(error: unknown): void {
  const message = error instanceof ManifestLoadError ? error.message : "Unknown error loading case.";
  app.innerHTML = `
    <div role="alert">
      <h2>Case not available</h2>
      <p>${message}</p>
      <p>No case package has been generated yet. Run the data-processing pipeline
      (see <code>data-processing/README.md</code>) and export it to
      <code>frontend/public/cases/${DEFAULT_CASE_ID}/</code>.</p>
    </div>
  `;
}

function renderApp(manifest: CaseManifest, activeView: ViewName): void {
  viewer?.dispose();
  viewer = null;
  const version = ++renderVersion;
  const viewRenderers: Record<ViewName, (m: CaseManifest) => string> = {
    overview: renderOverview,
    explore: renderExplore,
    scenarios: renderScenarios,
  };

  app.innerHTML = `
    <header>
      <nav aria-label="Case views">
        ${(["overview", "explore", "scenarios"] as ViewName[])
          .map((view) => `<button data-view="${view}" ${view === activeView ? 'aria-current="page"' : ""}>${view}</button>`)
          .join("")}
      </nav>
      <button id="ar-toggle" type="button" disabled title="Tumour AR integration is pending">AR pending</button>
    </header>
    <main>${viewRenderers[activeView](manifest)}</main>
  `;

  app.querySelectorAll<HTMLButtonElement>("nav button[data-view]").forEach((button) => {
    button.addEventListener("click", () => renderApp(manifest, button.dataset.view as ViewName));
  });
  if (activeView !== "overview") void connectViewer(manifest, activeView, version);
}

async function connectViewer(manifest: CaseManifest, activeView: ViewName, version: number): Promise<void> {
  const status = app.querySelector<HTMLElement>("#viewer-status")!;
  let local: CaseSceneViewer;
  try {
    local = new CaseSceneViewer(app.querySelector<HTMLElement>("#viewer-container")!);
    viewer = local;
    await local.loadCase(manifest);
    if (version !== renderVersion) return;
    local.start();
    status.textContent = "3D model loaded";
    app.querySelectorAll<HTMLInputElement>("[data-region-id]").forEach(input => {
      input.onchange = () => local.setRegionVisible(input.dataset.regionId!, input.checked);
    });
    const clipping = app.querySelector<HTMLInputElement>("#clipping");
    if (clipping) clipping.oninput = () => local.setClippingPlaneOffset(Number(clipping.value));
    const reset = app.querySelector<HTMLButtonElement>("#reset-view");
    if (reset) reset.onclick = () => { local.resetCamera(); local.setClippingPlaneOffset(2); clipping!.value = "2"; };
    if (activeView === "scenarios") {
      const select = app.querySelector<HTMLSelectElement>("#scenario-select")!;
      const step = app.querySelector<HTMLInputElement>("#scenario-step")!;
      const sensitivity = app.querySelector<HTMLSelectElement>("#sensitivity")!;
      let updateId = 0;
      const update = async () => {
        const id = ++updateId;
        const scenario = manifest.scenarios.find(s => s.id === select.value);
        if (!scenario) { status.textContent = "Scenario package has not been generated."; return; }
        sensitivity.disabled = scenario.id !== "illustrative-expansion";
        const variants = scenario.parameters.sensitivityFrames as Record<string, ScenarioFrame[]> | undefined;
        const frames = variants?.[sensitivity.value] ?? scenario.frames;
        const frame = frames[Number(step.value)]!;
        status.textContent = "Loading simulation step…";
        try {
          await local.loadMeshes(manifest, frame.meshPaths);
          if (version !== renderVersion || id !== updateId) return;
          app.querySelector("#scenario-explanation")!.textContent = scenario.explanation;
          app.querySelector("#scenario-volume")!.textContent = `Simulation step ${frame.step} · ${frame.volumesMl["whole-tumour"]!.toFixed(4)} mL · baseline ${manifest.regions[0]!.volumeMl.toFixed(4)} mL`;
          app.querySelector("#scenario-chart")!.innerHTML = renderVolumeChartSvg([
            { label: "Selected simulation", color: "#ed667d", values: frames.map(f => f.volumesMl["whole-tumour"]!) },
            { label: "Baseline", color: "#7399d8", values: frames.map(() => manifest.regions[0]!.volumeMl) }
          ]) + `<p>Pink: selected simulation · Blue: baseline. Horizontal: simulation steps 0–4; vertical: volume (mL).</p><p>${frames.map(f => `${f.step}: ${f.volumesMl["whole-tumour"]!.toFixed(2)} mL`).join(" → ")}</p>`;
          status.textContent = Object.keys(frame.meshPaths).length ? "Simulation step loaded" : "Empty residual — 0 mL; no surface to display";
        } catch (error) { if (id === updateId) status.textContent = `Could not load step: ${String(error)}`; }
      };
      select.onchange = () => { step.value = "0"; void update(); };
      step.oninput = () => { void update(); };
      sensitivity.onchange = () => { void update(); };
      await update();
    }
  } catch (error) {
    if (version === renderVersion) status.textContent = `3D unavailable: ${String(error)}. MRI previews remain available.`;
  }
}

main();

```
