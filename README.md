# Interactive AR Brain Tumour Visualisation and Educational Simulation

Academic demonstrator: MRI-derived tumour anatomy in an interactive 3D
viewer and browser markerless AR, with clearly labelled educational growth and
treatment scenarios. Full spec: [`docs/PLAN.md`](docs/PLAN.md). Progress
checklist: [`docs/SCHEDULE.md`](docs/SCHEDULE.md).

**Status: local 3D case package and educational scenarios implemented.**
The ordinary viewer loads the MRI-derived demonstration contour, measured
volumes, corrected-proportion MRI overlays and mask-derived scenario states.
Zappar world-tracking AR is integrated; real-device stability and performance acceptance remain pending.
Redistribution permission has not been established; do not publicly host the
case assets yet. See `data-processing/README.md` for reproduction.

## Repository layout

```
data-processing/   Offline Python pipeline: raw MRI+mask -> meshes, previews,
                    volumes, scenario frames -> case package (see its README)
frontend/           Vite + TypeScript + Three.js + MindAR static web app
case-schema/        JSON Schema for the case manifest — the contract between
                    data-processing/ and frontend/
targets/            Printed AR image target source assets (not the compiled
                    tracking file — that's under frontend/public/targets/)
docs/
  PLAN.md            the governing 5-day plan, archived verbatim
  SCHEDULE.md        day-by-day checklist against the plan
  references/        source literature survey + combined report PDFs
  provenance/        data source manifest + claim-audit table
  evaluation/        acceptance test tracker + usability pilot log
  diagrams/          architecture/data-flow diagrams (submission deliverable)
```

## Quick start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Generate the case package with the processing commands below before starting
the frontend. Overview, Explore and Scenarios then work locally. The AR
button opens markerless world tracking. Scan the room, choose **Place brain ahead**,
and use **Unlock model** before enabling hand manipulation. See
[`docs/evaluation/markerless-ar.md`](docs/evaluation/markerless-ar.md) for device setup and limitations.

`mind-ar` and `three` are pinned to exact versions in `frontend/package.json`
(**1.2.5 / 0.151.3** — not 0.186.0: mind-ar's prebuilt bundle imports three's
old `sRGBEncoding` export, removed in three r152+, so anything newer than
~0.151.x fails to build) per the plan's "do not independently upgrade
dependencies during the five-day build" rule.

### AR device test (Day 1 feasibility gate)

A minimal AR test page exists at `frontend/ar-test.html`, using MindAR's own
official example target (not our project's target — that comes later) just
to check whether this pinned combo tracks at all on your device.

```bash
cd frontend
npm run dev
```

This serves over **self-signed HTTPS** (required for camera access from a
phone on the LAN — only localhost gets a free pass on that). Vite prints a
`Network:` URL like `https://<your-mac-ip>:5173/`; open
`https://<your-mac-ip>:5173/ar-test.html` in mobile Safari on the same
Wi-Fi. Safari will warn the certificate isn't trusted — tap **Show Details
→ visit this website** to proceed (expected for local dev, not used in the
real deployment). Grant camera access when prompted, tap **Start AR**, and
point the rear camera at a printed or on-screen copy of the test target
image (`frontend/public/targets/bootstrap-test/card.png`) — display it big
(e.g. full-screen on a laptop/tablet) since it wasn't sized for printing.
A rotating cube appearing and the on-screen state flipping to `tracking`
is a pass. **Confirmed passing on an actual device** (iPhone/iPad, Safari) —
camera access granted, state correctly went `searching` → `tracking`, cube
rendered anchored to the target.

### Data processing

```bash
cd data-processing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests/ -v
```

Scripts `01`–`06` are implemented for case-01. See `data-processing/README.md` for the
per-script status table.

### Day 1 data: case-01

Real data acquired: 3D Slicer's `MRBrainTumor1` sample (BraTS/TCIA need an
account/data-use-agreement, so the plan's own documented fallback was used
directly rather than spending the 2h cap failing that first). Full
provenance in `docs/provenance/data-source-manifest.md`. This dataset ships
with **no segmentation**, so `data-processing/scripts/generate_demo_segmentation_case01.py`
produced a programmatic (not hand-drawn, not expert, not ML) demonstration
contour from a lesion location a human visually identified in the preview
images — volume 15.22 mL. Reproduce the whole thing with:

```bash
cd data-processing
source .venv/bin/activate
python scripts/01_validate_source.py --case-dir raw/case-01 --out derived/case-01 --source-units mm
python scripts/generate_demo_segmentation_case01.py
python scripts/02_generate_previews.py --nifti derived/case-01/t1.nii.gz \
    --mask derived/case-01/mask-whole-tumour-demo.nii.gz --out derived/case-01/previews --overview-grid
python scripts/03_reconstruct_meshes.py --nifti derived/case-01/t1.nii.gz \
    --mask derived/case-01/mask-whole-tumour-demo.nii.gz --out derived/case-01/meshes/whole-tumour.glb
python scripts/04_compute_volumes.py --case-dir derived/case-01 --out derived/case-01/volumes.json
python scripts/05_build_scenarios.py --case-dir derived/case-01 --out derived/case-01/scenarios
python scripts/06_export_case_package.py --case-dir derived/case-01 --out ../frontend/public/cases/case-01
```

While building the mesh export, `tests/test_mesh_reconstruction.py` caught
a real bug: marching cubes produced inward-facing normals (negative mesh
volume), which would have made the tumour invisible from outside in
three.js due to backface culling. Fixed with `mesh.fix_normals()`.

## Brain interaction

The browser now loads the same-case brain context imported by
`data-processing/scripts/import_codex_brain_envelope_case01.py`. The case exporter now prefers
the full-resolution 679,926-triangle reconstruction (about 12.2 MB), preserving
the MRI-derived surface detail. The 15,000-triangle mesh remains available
as a fallback when the full-resolution source is absent. Neither surface
is used to calculate tissue volumes. Full resolution also applies to the
manifest-driven AR preview; mobile performance still needs device testing.

Explore and Scenarios share controls for brain visibility/opacity, tumour
isolation and focus, anatomical view presets, zoom/fit, automatic rotation,
and sagittal/coronal/axial cutaways with a reversible direction. By default,
cutaways affect the brain only. Click a surface to identify it; tumour
measurements always come from the currently displayed state's mask.
Visibility and cutaway settings persist between the two views. MRI preview
overlays can be toggled in Explore. Reset all controls restores the view
settings without changing the selected simulation or its measurements.

Run `npm test` in `frontend/` for geometry, gesture, and camera-lifecycle tests (Node 22.6+
with type stripping). `npm run build` checks TypeScript and builds the app.
Desktop browser checks and remaining device gates are in
`docs/evaluation/acceptance-tests.md`.

## Next step

Integrate the case into AR; verify final orientation with an asymmetric
browser-rendered fixture; add aligned MRI planes as in-scene context; run
mobile performance, camera recovery and endurance checks. Preserve the
original surface: smoothing/decimation is deferred because the baseline
is already 10,106 triangles and no device result yet justifies changing it.
Git remote and first commit remain to be configured.


## Camera hand controls

Explore and Scenarios now have **Enable hand controls** at the top of the
interaction panel. Grant camera access, optionally enable **Show hand preview**,
and use an open palm to rotate/tilt, a one-hand pinch held for 350 ms to move,
or two pinching hands spread together/apart to zoom. **Pause/Resume** suspends
interaction, **Reset position** restores the model, and **Disable hand controls**
stops the viewer camera. Mouse, touch and buttons remain available.

In AR, enable hand controls after entering the camera view. MediaPipe reuses
Zappar's rear-camera frames. No printed marker is needed. The model starts locked;
unlock it for hand manipulation. Tracking loss hides the model and pauses
manipulation until the anchor recovers and a new gesture starts. The viewer uses a mirrored
front-camera preview; AR uses the rear-camera crop without mirroring.

Inference runs locally in a worker with the pinned MediaPipe 0.10.35 module WASM
and model. Initial rate is 20 Hz, reduced to 10 Hz on slow inference or low frame
rate. The full-resolution brain remains the default. No camera frames are stored
or uploaded. See `docs/evaluation/hand-controls.md` for checks and remaining
real-device acceptance work.

## Voice commands

Explore, Scenarios and initialized AR include **Enable voice controls**. The
microphone remains off until pressed. English commands include “zoom in”,
“rotate left”, “move up”, “reset position”, “opacity fifty percent”,
“transparency 70 percent”, “cut sagittal/coronal/axial” and “cut off”. AR also
supports “place brain”, “lock model” and “unlock model”. Pose changes require
an unlocked, tracked AR model. Say **stop listening** or press **Stop listening**
to disable the microphone. If the browser ends recognition, enable it again.

Speech uses the browser's Web Speech API (including its prefixed variant).
Availability depends on the browser and its speech service; API presence does
not guarantee that recognition works. Unsupported/denied/error states leave
buttons and hand controls usable. The browser may send audio to its speech
service online; this app does not save audio or transcripts. Listening stops
on navigation, AR entry/exit and page visibility changes.

Validation: 35 frontend unit tests and production build passed. Browser tests
simulate recognition events to check final-only execution, duplicate handling,
settings synchronization, late-result rejection, navigation cleanup, microphone
errors and AR lock enforcement. Real speech accuracy and simultaneous camera /
microphone use in Safari and Brave remain device acceptance checks.
