import { VoicePanel } from "./voice/panel";
import { voiceMotion } from "./voice/commands";
import { GesturePanel } from "./gestures/panel";
import "./style.css";
import { loadCaseManifest, ManifestLoadError } from "./case/loader";
import { renderOverview, renderExplore, renderScenarios, type ViewName } from "./ui/views";
import type { CaseManifest, ScenarioFrame } from "./case/types";
import { renderVolumeChartSvg } from "./scenarios/volume-chart";
import { CaseSceneViewer, defaultViewerSettings, type ViewerSettings } from "./viewer/scene";
import type { AnatomicalView, CutPlane } from "./viewer/anatomy";
import type { WorldArSession } from "./ar/world-ar-session";
import { loadArModelGroup, disposeArModel } from "./ar/ar-model";

const DEFAULT_CASE_ID = "case-01";
const app = document.querySelector<HTMLDivElement>("#app")!;
let viewer: CaseSceneViewer | null = null;
let gesturePanel: GesturePanel | null = null;
let voicePanel:VoicePanel|null=null;
let arGeneration = 0;
let renderVersion = 0;
let settings: ViewerSettings = defaultViewerSettings();
let selectedView: AnatomicalView = "oblique";
let showOverlay = true;
const scenarioChoice = { id: "baseline", step: 0, sensitivity: "medium" };

// Whichever region meshes are currently displayed in the ordinary viewer
// (baseline regions, or the active scenario frame) - AR shows the same
// thing, per plan section D: "preserve the selected case and scenario
// when switching modes."
let currentMeshPaths: Record<string, string> = {};
let arSession: WorldArSession | null = null;

const arOverlay = document.createElement("div");
arOverlay.id = "ar-overlay";
arOverlay.hidden = true;
arOverlay.innerHTML = `
  <div id="ar-viewport"></div>
  <div id="ar-hud">
    <span id="ar-state" role="status">idle</span>

    <button id="ar-exit" type="button">Exit AR</button>
  </div>
  <div id="ar-hand-controls"></div>
`;
document.body.appendChild(arOverlay);
arOverlay.querySelector<HTMLButtonElement>("#ar-exit")!.onclick = () => void exitAr();

async function enterAr(manifest: CaseManifest): Promise<void> {
  if (Object.keys(currentMeshPaths).length === 0 || !arOverlay.hidden) return;
  const generation = ++arGeneration;
  voicePanel?.stop();
  gesturePanel?.disable();
  const stateEl = arOverlay.querySelector<HTMLSpanElement>("#ar-state")!;
  const viewport = arOverlay.querySelector<HTMLDivElement>("#ar-viewport")!;
  viewport.innerHTML = "";
  arOverlay.hidden = false;
  viewer?.stop();
  stateEl.textContent = "loading model…";
  try {
    const {WorldArSession}=await import("./ar/world-ar-session");
    if(generation!==arGeneration)return;
    const session = new WorldArSession(viewport, {
      onStateChange: (state) => {
        if(generation === arGeneration) stateEl.textContent = state;
      },
      onFatalError: (message) => {
        if(generation !== arGeneration) return;
        const guidance = message.toLowerCase().includes("motion permission")
          ? "Markerless AR needs motion access, which this browser or device denied. Allow Motion & Orientation access on a motion-capable phone and try again."
          : `Markerless AR could not start: ${message}`;
        void exitAr().then(() => {
          const status = app.querySelector<HTMLElement>("#viewer-status");
          if(status) status.textContent = `${guidance} The ordinary viewer is ready.`;
        });
      },

    }, arOverlay.querySelector<HTMLElement>("#ar-hand-controls")!);
    arSession = session;
    const model = await loadArModelGroup(manifest, currentMeshPaths);
    if(generation !== arGeneration) { disposeArModel(model); return; }
    await session.start(model);
  } catch (error) {
    if(generation !== arGeneration) return;
    stateEl.textContent = `AR failed to start: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function refreshArButton(): void {
  const button = app.querySelector<HTMLButtonElement>("#ar-toggle");
  if (!button) return;
  const enabled = Object.keys(currentMeshPaths).length > 0;
  button.disabled = !enabled;
  button.title = enabled
    ? "Place the current model in markerless AR"
    : "Open Explore or Scenarios first to load a model";
}

async function exitAr(): Promise<void> {
  ++arGeneration;
  try {
    await arSession?.stop();
  } finally {
    // Always tear down the overlay, even if the underlying AR library's
    // own stop() failed - a broken AR session must never trap the user
    // on a black screen with no way back to the ordinary viewer.
    arSession = null;
    arOverlay.hidden = true;
    arOverlay.querySelector<HTMLDivElement>("#ar-viewport")!.innerHTML = "";
    viewer?.start();
  }
}

async function main(): Promise<void> {
  app.innerHTML = `<p role="status">Loading case…</p>`;
  try { renderApp(await loadCaseManifest(DEFAULT_CASE_ID), "overview"); }
  catch (error) {
    app.innerHTML = `<div role="alert"><h2>Case not available</h2><p id="load-error"></p><p>Generate the local case package using the instructions in the project README.</p></div>`;
    app.querySelector("#load-error")!.textContent = error instanceof ManifestLoadError ? error.message : "Could not load the case.";
  }
}

function renderApp(manifest: CaseManifest, activeView: ViewName): void {
  voicePanel?.dispose();voicePanel=null;
  gesturePanel?.dispose(); gesturePanel=null;
  viewer?.dispose(); viewer = null;
  const version = ++renderVersion;
  const renderers = { overview: renderOverview, explore: renderExplore, scenarios: renderScenarios };
  app.innerHTML = `
    <header>
      <nav aria-label="Case views">${(["overview", "explore", "scenarios"] as ViewName[]).map(view => `<button data-view="${view}" ${view === activeView ? 'aria-current="page"' : ""}>${view}</button>`).join("")}</nav>
      <button id="ar-toggle" type="button" ${Object.keys(currentMeshPaths).length ? "" : "disabled"} title="${Object.keys(currentMeshPaths).length ? "Place the current model in markerless AR" : "Open Explore or Scenarios first to load a model"}">Enter AR</button>
    </header>
    <main>${renderers[activeView](manifest)}</main>`;
  app.querySelectorAll<HTMLButtonElement>("nav button[data-view]").forEach(button => {
    button.onclick = () => renderApp(manifest, button.dataset.view as ViewName);
  });
  app.querySelector<HTMLButtonElement>("#ar-toggle")!.onclick = () => void enterAr(manifest);
  const overlay = app.querySelector<HTMLInputElement>("#mri-overlay");
  if (overlay) {
    const update = () => {
      showOverlay = overlay.checked;
      app.querySelectorAll<HTMLImageElement>("#mri-previews img").forEach(image => {
        image.src = (showOverlay ? image.dataset.overlayPath : image.dataset.basePath)!;
        image.alt = `${image.closest("figure")!.dataset.plane} MRI slice${showOverlay ? " with demonstration contour" : " without overlay"}`;
      });
    };
    overlay.checked = showOverlay; overlay.onchange = update; update();
  }
  if (activeView !== "overview") void connectViewer(manifest, activeView, version);
}

function bindControls(local: CaseSceneViewer): () => void {
  const input = (id: string) => app.querySelector<HTMLInputElement>(`#${id}`)!;
  const button = (id: string) => app.querySelector<HTMLButtonElement>(`#${id}`)!;
  const clearSelection = () => { app.querySelector("#selection-info")!.textContent = "Click or tap the brain or tumour to inspect it."; };
  const sync = () => {
    input("brain-visible").checked = settings.brainVisible;
    input("brain-visible").disabled = !local.hasBrain;
    input("brain-opacity").value = String(Math.round(settings.brainOpacity * 100));
    input("brain-opacity").disabled = !local.hasBrain || !settings.brainVisible;
    app.querySelector("#brain-opacity-value")!.textContent = `${Math.round(settings.brainOpacity * 100)}%`;
    input("auto-rotate").checked = settings.autoRotate;
    input("auto-rotate").disabled = local.handControlsEnabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input("auto-rotate").title = local.handControlsEnabled ? "Paused while hand controls are enabled" : input("auto-rotate").disabled ? "Disabled by your reduced-motion preference" : "";
    input("cut-enabled").checked = settings.cutEnabled;
    const plane = app.querySelector<HTMLSelectElement>("#cut-plane")!;
    plane.value = settings.cutPlane; plane.disabled = !settings.cutEnabled;
    input("cut-position").value = String(settings.cutPercent);
    app.querySelector("#cut-position-value")!.textContent = `${settings.cutPercent}%`;
    input("cut-reverse").checked = settings.cutReverse;
    input("cut-tumour").checked = settings.cutTumour;
    for (const id of ["cut-position", "cut-reverse", "cut-tumour"]) input(id).disabled = !settings.cutEnabled;
    app.querySelectorAll<HTMLInputElement>("[data-region-id]").forEach(i => {
      i.checked = settings.regionVisibility[i.dataset.regionId!] !== false;
      i.disabled = !local.hasRegions;
    });
    button("isolate-tumour").disabled = !local.hasRegions;
    button("focus-tumour").disabled = !local.hasRegions;
    button("isolate-tumour").setAttribute("aria-pressed", String(!settings.brainVisible));
    button("isolate-tumour").textContent = settings.brainVisible ? "Tumour only" : "Restore brain";
    app.querySelectorAll<HTMLButtonElement>("[data-camera-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cameraView === selectedView)));
    local.applySettings(settings);
  };
  const changed = () => { sync(); clearSelection(); };
  input("brain-visible").onchange = () => { settings.brainVisible = input("brain-visible").checked; changed(); };
  input("brain-opacity").oninput = () => { settings.brainOpacity = Number(input("brain-opacity").value) / 100; changed(); };
  input("auto-rotate").onchange = () => { settings.autoRotate = input("auto-rotate").checked; changed(); };
  input("cut-enabled").onchange = () => { settings.cutEnabled = input("cut-enabled").checked; changed(); };
  app.querySelector<HTMLSelectElement>("#cut-plane")!.onchange = event => { settings.cutPlane = (event.target as HTMLSelectElement).value as CutPlane; changed(); };
  input("cut-position").oninput = () => { settings.cutPercent = Number(input("cut-position").value); changed(); };
  input("cut-reverse").onchange = () => { settings.cutReverse = input("cut-reverse").checked; changed(); };
  input("cut-tumour").onchange = () => { settings.cutTumour = input("cut-tumour").checked; changed(); };
  app.querySelectorAll<HTMLInputElement>("[data-region-id]").forEach(i => { i.onchange = () => { settings.regionVisibility[i.dataset.regionId!] = i.checked; changed(); }; });
  button("isolate-tumour").onclick = () => {
    settings.brainVisible = !settings.brainVisible;
    app.querySelectorAll<HTMLInputElement>("[data-region-id]").forEach(i => { settings.regionVisibility[i.dataset.regionId!] = true; });
    changed();
  };
  button("focus-tumour").onclick = () => {
    app.querySelectorAll<HTMLInputElement>("[data-region-id]").forEach(i => { settings.regionVisibility[i.dataset.regionId!] = true; });
    changed(); local.focusTumour();
  };
  button("zoom-in").onclick = () => local.zoom(0.8);
  button("zoom-out").onclick = () => local.zoom(1.25);
  button("reset-view").onclick = () => { local.resetCamera(); selectedView = "oblique"; sync(); };
  button("reset-controls").onclick = () => { settings = defaultViewerSettings(); selectedView = "oblique"; local.resetCamera(); changed(); };
  app.querySelectorAll<HTMLButtonElement>("[data-camera-view]").forEach(b => {
    b.onclick = () => { selectedView = b.dataset.cameraView as AnatomicalView; settings.autoRotate = false; local.setView(selectedView); sync(); };
  });
  const fieldset = app.querySelector<HTMLFieldSetElement>("#viewer-controls")!;
  fieldset.disabled = false;
  sync(); local.setView(selectedView);
  return sync;
}

async function connectViewer(manifest: CaseManifest, activeView: ViewName, version: number): Promise<void> {
  const status = app.querySelector<HTMLElement>("#viewer-status")!;
  let local: CaseSceneViewer | null = null;
  try {
    local = new CaseSceneViewer(app.querySelector<HTMLElement>("#viewer-container")!);
    viewer = local;
    await local.loadCase(manifest);
    if (version !== renderVersion) return;
    currentMeshPaths = Object.fromEntries(manifest.regions.filter(r => r.available !== false).map(r => [r.id, r.meshPath]));
    refreshArButton();
    let currentVolumes = Object.fromEntries(manifest.regions.map(r => [r.id, r.volumeMl]));
    local.onSelect = selection => {
      const text = app.querySelector("#selection-info");
      if (!text || version !== renderVersion) return;
      if (!selection) { text.textContent = "Click or tap the brain or tumour to inspect it."; return; }
      text.textContent = selection.kind === "brain"
        ? "Brain context selected · automated, unreviewed surface. Lower brain opacity or enable a cutaway to reveal the tumour."
        : `${manifest.regions.find(r => r.id === selection.regionId)?.label ?? "Tumour"} selected · ${(currentVolumes[selection.regionId!] ?? 0).toFixed(4)} mL · measured from the displayed state's mask.`;
    };
    const syncControls = bindControls(local);
    gesturePanel = new GesturePanel(app.querySelector<HTMLElement>("#hand-controls")!,{
      applyGesture: frame=>local!.applyGesture(frame),resetManipulation:()=>local!.resetManipulation(),
      setGestureEnabled: enabled=>{local!.setGestureEnabled(enabled);if(version===renderVersion)syncControls();}
    },local.renderer.domElement);
    const voiceHost=document.createElement("section");app.querySelector<HTMLElement>("#hand-controls")!.after(voiceHost);
    voicePanel=new VoicePanel(voiceHost,command=>{
      if(version!==renderVersion||!arOverlay.hidden)return "Viewer voice controls are inactive.";
      gesturePanel?.cancelActiveGesture();
      if(["place","lock","unlock"].includes(command.kind))return "That command is available in AR.";
      settings.autoRotate=false;
      if(command.kind==="zoom")local!.zoom(command.direction==="in"?0.8:1.25);
      if(command.kind==="rotate"||command.kind==="move")local!.applyGesture(voiceMotion(command));
      if(command.kind==="reset"){local!.resetManipulation();selectedView="oblique";}
      if(command.kind==="opacity"){settings.brainOpacity=command.value;settings.brainVisible=true;}
      if(command.kind==="cut"){settings.cutEnabled=command.plane!==null;if(command.plane)settings.cutPlane=command.plane;settings.cutTumour=false;}
      local!.applySettings(settings);syncControls();return `Applied: ${command.kind}. Listening…`;
    });
    local.start();
    status.textContent = local.warnings.length ? local.warnings.join(" ") : "Brain and tumour ready. Use the controls to explore.";
    if (activeView === "scenarios") await connectScenarios(local, manifest, version, status, volumes => {
      currentVolumes = volumes;
      app.querySelectorAll<HTMLElement>("[data-region-volume]").forEach(el => { el.textContent = `${(volumes[el.dataset.regionVolume!] ?? 0).toFixed(2)} mL`; });
      syncControls();
    });
  } catch (error) {
    if (version === renderVersion) {
      voicePanel?.dispose();voicePanel=null;
      local?.dispose(); viewer = null;
      status.textContent = `3D unavailable: ${String(error)}. MRI previews remain available.`;
    }
  }
}

async function connectScenarios(local: CaseSceneViewer, manifest: CaseManifest, version: number, status: HTMLElement, onVolumes: (volumes: Record<string, number>) => void): Promise<void> {
  const select = app.querySelector<HTMLSelectElement>("#scenario-select")!;
  const step = app.querySelector<HTMLInputElement>("#scenario-step")!;
  const sensitivity = app.querySelector<HTMLSelectElement>("#sensitivity")!;
  select.value = manifest.scenarios.some(s => s.id === scenarioChoice.id) ? scenarioChoice.id : manifest.scenarios[0]?.id ?? "";
  step.value = String(scenarioChoice.step); sensitivity.value = scenarioChoice.sensitivity;
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
      currentMeshPaths = frame.meshPaths;
      refreshArButton();
      scenarioChoice.id = scenario.id; scenarioChoice.step = frame.step; scenarioChoice.sensitivity = sensitivity.value;
      onVolumes(frame.volumesMl);
      app.querySelector("#scenario-explanation")!.textContent = scenario.explanation;
      app.querySelector("#scenario-volume")!.textContent = `Simulation step ${frame.step} · ${frame.volumesMl["whole-tumour"]!.toFixed(4)} mL · baseline ${manifest.regions[0]!.volumeMl.toFixed(4)} mL`;
      app.querySelector("#scenario-chart")!.innerHTML = renderVolumeChartSvg([
        { label: "Selected simulation", color: "#ed667d", values: frames.map(f => f.volumesMl["whole-tumour"]!) },
        { label: "Baseline", color: "#7399d8", values: frames.map(() => manifest.regions[0]!.volumeMl) }
      ]) + `<p>Pink: selected simulation · Blue: baseline. Horizontal: simulation steps 0–4; vertical: volume (mL).</p><p>${frames.map(f => `${f.step}: ${f.volumesMl["whole-tumour"]!.toFixed(2)} mL`).join(" → ")}</p>`;
      status.textContent = (Object.keys(frame.meshPaths).length ? "Simulation step loaded." : "Empty residual — 0 mL; no tumour surface to display.") + (local.warnings.length ? ` ${local.warnings.join(" ")}` : "");
    } catch (error) {
      if (id === updateId && version === renderVersion) status.textContent = `Could not load requested step; the last loaded model and measurements remain displayed. ${String(error)}`;
    }
  };
  select.onchange = () => { step.value = "0"; void update(); };
  step.oninput = () => { void update(); };
  sensitivity.onchange = () => { void update(); };
  await update();
}

main();
