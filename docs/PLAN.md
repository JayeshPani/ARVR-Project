# Project plan: Interactive AR Brain Tumour Visualisation and Educational Simulation

> Archived verbatim as the governing spec for this repository. Source PDFs
> this plan draws on are in `docs/references/`.

## 1. Objective, scope and assumptions

**Build a complete academic demonstrator in five days, working alone, for an iPhone or iPad.** The application will display MRI-derived tumour anatomy in an interactive 3D viewer and image-tracked AR, with clearly labelled educational growth and treatment scenarios.

The underlying problem is that interpreting a tumour's shape and position from separate MRI slices requires substantial spatial reasoning. The project should help a learner connect the original images, segmented regions, three-dimensional anatomy and hypothetical changes over time.

The literature survey supplies the proposed research scope and limitations (`docs/references/AR_VR_Brain_Tumour_Literature_Survey.pdf`).

The combined report supplies architectural ideas, but its claims of completed implementation are not evidence of working software — only the reports exist at the start of this build (`docs/references/Brain_Tumor_ARVR_Combined_Report.pdf`).

**Success means an examiner can:**

1. Open a case and inspect the source MRI and segmentation.
2. Rotate the reconstructed anatomy, isolate regions and read measured volumes.
3. Place the model over a printed image target using the device camera.
4. Explore hypothetical growth and intervention scenarios.
5. Understand which information comes from imaging and which is simulated.
6. Inspect reproducible processing scripts, test results and documented limitations.

| Included in the five-day build | Deferred to later development |
|---|---|
| One complete real MRI case; second case if time permits | Large dataset ingestion |
| Supplied segmentation masks, or explicitly labelled manual demonstration masks | Training a segmentation network |
| MRI slice previews and aligned 3D models | General-purpose clinical DICOM viewer |
| Browser 3D viewer and image-tracked AR | Native Unity application and headset VR |
| Volume measurements and region controls | Radiomic biomarker or survival prediction |
| Geometric growth and treatment illustrations | Patient-specific progression forecasting |
| Engineering verification and small usability pilot | Clinical trials or treatment planning |

**Planning assumptions:** approximately 35–40 focused hours, existing laptop and iPhone/iPad, no required GPU, access to a printer or second screen for the target image, and no identifiable hospital data. The exact device and Safari version will be recorded during the first-day feasibility test.

## 2. Architecture and implementation

### Technical approach

Use **offline Python processing plus a static browser application**.

```text
Public MRI + segmentation
            ↓
Geometry, labels and provenance checks
            ↓
Meshes + MRI previews + voxel-based measurements
            ↓
Precomputed educational scenario states
            ↓
Versioned case package
            ↓
Browser 3D viewer ↔ Image-tracked AR
```

| Component | Choice |
|---|---|
| Imaging processing | Python, NiBabel, NumPy, SciPy and scikit-image |
| Mesh processing/export | Trimesh; GLB assets |
| Manual inspection or fallback segmentation | 3D Slicer |
| Frontend | Vite, TypeScript and Three.js |
| Image tracking | MindAR's Three.js integration |
| Charts | Lightweight SVG volume chart |
| Hosting | Static HTTPS hosting; no application server or database |
| Versioning | Git, dependency lockfiles and processing configuration |

MindAR supports image-target AR on a static webpage. The actual device must pass a camera-and-tracking test before integration proceeds. Browser camera access requires a secure context and user permission. [MindAR documentation](https://hiukim.github.io/mind-ar-js-doc/quick-start/overview/), [browser camera requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Pin a compatible MindAR/Three.js combination demonstrated by the working sample. Do not independently upgrade dependencies during the five-day build.

### A. Data acquisition and provenance

- Target one public preoperative adult-glioma case with MRI and matching segmentation.
- First attempt a documented BraTS/TCIA release that is already accessible under acceptable terms. Limit access troubleshooting to two hours.
- If access is blocked, use Slicer's `MRBrainTumor1` sample and produce a manual demonstration segmentation in Slicer. Label it **"manual demonstration contour—not expert-validated."** The sample is listed in the [official Slicer source](https://github.com/Slicer/Slicer/blob/main/Modules/Scripted/SampleData/SampleData.py).
- Do not wait for institutional approval or download entire collections.
- Record dataset name, version, source URL, case identifier, licence, segmentation origin and checksums.
- Confirm whether derived assets can be publicly redistributed before including them in a hosted build. Where redistribution is prohibited, retain the case locally and publish only permitted demonstration assets.
- If no permitted real case is available by the first-day deadline, use a visibly labelled synthetic phantom to unblock engineering and record the real-case requirement as unmet.

Only show tumour subregions actually present in the source annotation. A single manual contour must not be presented as independently validated enhancing tumour, tumour core and whole tumour.

### B. MRI and geometry processing

1. Validate image dimensions, spacing, orientation, affine transform and mask alignment.
2. Check that mask values match the selected dataset's documented label definitions.
3. Preserve the original image and masks.
4. Avoid re-registering or normalising an already prepared dataset without a demonstrated need.
5. Generate axial, coronal and sagittal previews with mask overlays.
6. Reconstruct surfaces using marching cubes.
7. Apply conservative smoothing and decimation only after saving the original surfaces.
8. Export every structure through the same coordinate transform.

Calculate volumes from masks:

V_mL = N_voxels * |det(A_3x3)| / 1000

where the affine's spatial units have first been verified or converted to millimetres.

Keep anatomical units separate from display scale. Pinching the model larger must never change its reported tumour volume.

Use a same-case brain envelope where a suitable brain mask is available. Otherwise show aligned MRI planes as anatomical context. Any generic brain illustration must be labelled as an illustrative reference, with no claim of patient-specific alignment.

Whole tumour, tumour core and enhancing tumour can be nested regions. Do not add their volumes together as though they were disjoint.

### C. Case-package interface

The frontend consumes a versioned case manifest and static assets. No public REST API is needed.

| Manifest group | Required content |
|---|---|
| Identity | Schema version, case ID and display name |
| Provenance | Dataset/version, source, licence and mask origin |
| Geometry | Original affine, units, orientation and display transform |
| Regions | Label definition, mesh path, colour and voxel-derived volume |
| MRI previews | Image paths, viewing plane and slice position |
| Scenarios | Method, parameters, frame assets and per-frame volumes |
| Limitations | Missing anatomy, annotation status and simulation caveats |

Processing must fail clearly for incompatible masks, invalid geometry or missing required assets. Optional missing regions should be hidden with an explanation.

Implemented as `case-schema/case-manifest.schema.json` (JSON Schema) and mirrored in `frontend/src/case/types.ts`.

### D. Viewer and AR interaction

Provide three simple views:

- **Case overview:** provenance, annotation status, available structures and limitations.
- **Explore:** MRI previews, 3D model, region controls and measurements.
- **Scenarios:** timeline, comparison controls, assumptions and volume chart.

Required controls:

- Rotate, zoom and reset.
- Show/hide available regions.
- Adjust anatomical-context opacity.
- Move one clipping plane through the model.
- Switch between ordinary 3D and AR.
- Select a scenario and scrub through its states.

Use a textured printed image target rather than relying on a QR code alone. A QR code may open the webpage, but it is not proof of spatial registration.

In AR:

- Start the rear camera through an explicit button.
- Show "Searching", "Tracking" and "Target lost" states.
- Hide the anchored model when tracking is lost.
- Preserve the selected case and scenario when switching modes.
- Stop the camera when leaving AR.
- Keep all controls usable in portrait and landscape orientations.

This is **tabletop educational AR**. It does not align a tumour to a patient's head or provide surgical navigation.

### E. Educational scenarios

Implement reproducible geometric scenarios offline, with **five discrete states per scenario**. Use "simulation step" rather than days or months because the model is not calibrated to biological time.

| Scenario | Implementation | Required explanation |
|---|---|---|
| Baseline | Unmodified source mask | Imaging-derived segmentation |
| Illustrative expansion | Signed-distance expansion at predefined millimetre offsets | Geometric illustration; not predicted infiltration |
| Resection illustration | Remove voxels on one side of a plane; regenerate mesh and residual volume | Geometric removal; no surgical feasibility or outcome estimate |
| Localised reduction | Apply predefined erosion within a selected geometric region | Radiation-inspired illustration; no dose calculation |
| Global reduction | Apply predefined mask erosion | Drug-response illustration; no pharmacological model |

Use the same baseline for comparisons. Compute every chart point from the corresponding scenario mask. Clipping used for inspection must not alter volume; an explicit resection operation does.

Provide low/medium/high illustrative expansion settings. Label their spread **"parameter sensitivity"**, not a confidence interval.

Do not:

- Animate a scaled mesh while presenting unrelated volume numbers.
- Assign treatment doses or recommend a therapy.
- Suggest that reduced proliferation automatically produces shrinkage.
- Present hypothetical states as acquired follow-up scans.

Precompute scenario geometry on the laptop; only render and select states on the mobile device.

### F. Performance, privacy and reliability

- Start with a target of fewer than 50,000 visible triangles; reduce further based on measured device performance.
- Keep the initial case payload near or below 10 MB where feasible.
- Load scenario meshes on demand and dispose of unused GPU resources.
- Bundle dependencies locally within the build rather than depending on multiple runtime CDNs.
- Include loading, missing-asset and camera-denied states.
- Process camera frames locally; do not record or upload them.
- Include no patient-upload form, login, analytics or cloud inference.
- Maintain an ordinary 3D viewer as the camera-independent fallback.

## 3. Five-day schedule and decision gates

| Day | Work and time budget | Required checkpoint |
|---|---|---|
| **1 — Feasibility and data** | 2 h device/AR test; 2 h data access; 3 h case inspection and basic mesh export; 1 h setup notes | A primitive tracks on the actual device, and one permitted MRI case opens with a usable mask |
| **2 — Working viewer** | 3 h processing pipeline; 4 h viewer, labels, opacity, measurements and MRI previews; 1 h checks | One real case is fully inspectable in ordinary 3D |
| **3 — Complete interaction** | 3 h integrate case into AR; 3 h scenario generation and timeline; 2 h device testing | An end-to-end demonstration works with one case |
| **4 — Verification and refinement** | 3 h geometry/scenario tests; 2 h mobile performance and recovery; 2 h small usability pilot; 1 h fixes | Major defects fixed and measured results recorded |
| **5 — Submission** | 2 h regression checks; 3 h report and diagrams; 2 h slides/video; 1 h packaging and rehearsal | Reproducible release, report, presentation and backup demonstration |

**Scope-control rules**

- If data access exceeds two hours, take the documented Slicer fallback.
- If image tracking fails on the actual device after a focused two-hour debugging attempt, complete the 3D viewer and record AR as blocked. Do not call a desktop mock-up a completed AR result.
- If mesh optimisation noticeably damages geometry, use the higher-quality model and reduce scene complexity.
- Add a second case only after the first case passes end-to-end tests.
- Freeze new features at the end of Day 3.
- Do not introduce model training, a backend, native app migration or a new physics solver during Days 4–5.

All implementation work belongs to the single developer. Any classmates or supervisor involved are reviewers, not assumed development resources.

## 4. Verification, evaluation and academic deliverables

### Engineering acceptance tests

The numbers below are **project targets**, not achieved results or clinical standards.

| Area | Test and pass condition |
|---|---|
| Orientation | An asymmetric test object confirms no left/right mirror or axis swap through export and rendering |
| Alignment | MRI and mask overlays align in all three viewing planes |
| Volume | Known synthetic cuboid reproduces its analytic volume within floating-point tolerance |
| Scale independence | Viewer zoom and AR scaling leave reported anatomical volumes unchanged |
| Mesh fidelity | Non-empty source regions survive export; target surface displacement within one source-voxel diagonal after optimisation |
| Labels | Names and region unions match the specific dataset's documented conventions |
| Scenario consistency | Step zero matches baseline; displayed volumes match stored scenario masks |
| Resection | Residual volume never exceeds baseline, reset restores baseline, and an empty residual is handled |
| Tracking recovery | Removing and replacing the target reliably hides and restores the model across five trials |
| Camera handling | Permission denial, interruption and leaving AR do not break the ordinary viewer |
| Performance | Aim for median ≥30 FPS during a two-minute interaction; report actual results, device, browser and worst slowdowns |
| Reliability | Ten-minute case/scenario session without a crash or progressively increasing memory use |
| Packaging | A fresh setup can regenerate the case package and run the documented build |

Measure image-target jitter and reacquisition time where possible. Do not label tabletop tracking measurements as surgical target-registration accuracy.

**Do not report segmentation Dice scores when the application simply reuses supplied masks.** That would not evaluate an implemented segmentation model.

### Small usability pilot

Recruit three to five consenting classmates if available. Each performs:

1. Find and isolate the tumour.
2. Reveal it through surrounding anatomy.
3. Locate the corresponding MRI slice.
4. Compare baseline and one scenario.
5. Identify whether the displayed state is observed or simulated.

Record completion, task time, mistakes and brief feedback. Counterbalance 3D/AR viewing order where practical. Treat this as exploratory usability evidence, not proof of clinical benefit or a statistically established educational advantage.

If participants are unavailable, document a structured developer walkthrough rather than inventing user-study results.

### Corrections to the source reports

Maintain a short claim-audit table with the original claim, checked source and correction (`docs/provenance/claim-audit.md`).

At minimum:

- Replace past-tense implementation claims with actual completed functionality.
- Correct conflicting publication years and venues.
- Correct the TCGA annotation-release count: the cited paper reports **243 preoperative cases**, distinct from collection-level totals. [Original data paper](https://doi.org/10.1038/sdata.2017.117).
- Correct the ACRIN 6684 identification and count: TCIA lists **ACRIN-FMISO-Brain with 45 subjects**. [Official collection](https://www.cancerimagingarchive.net/collection/acrin-fmiso-brain/).
- Remove the claim that QR anchoring eliminates drift.
- Remove claims that ordinary FLAIR directly supplies white-matter tract directions.
- Separate geometric illustrations from reaction–diffusion simulations and clinical predictions.
- Retain published accuracy values only where their original method, dataset and metric have been checked.

The project's academic contribution should be stated as **a reproducible integration and evaluation of MRI-derived visualisation, mobile AR and transparent educational scenarios**. Do not claim a novel AI model or that no comparable system exists.

### Submission package

Deliver:

- Versioned source code and dependency lockfiles.
- Data-source and licence manifest.
- Reproducible image-to-mesh processing script.
- Working browser application and deployment instructions.
- Printed tracking target with its intended dimensions.
- Test cases, measured results and failure examples.
- Architecture and data-flow diagrams.
- Final report covering problem, literature, implementation, evaluation, limitations and future work.
- Approximately 8–10 presentation slides.
- A 2–3 minute recorded demonstration.
- A local runnable build, screenshots and video as presentation backups.

The demonstration should move from MRI evidence → 3D inspection → AR → one scenario → limitations.

## 5. Longer-term roadmap and completion definition

The full research vision remains useful, but each extension needs its own evidence gate.

| Extension | Work required before making stronger claims |
|---|---|
| Automated segmentation | Verify checkpoint licence, training-data overlap, modalities and preprocessing; evaluate independent cases with per-region Dice and surface distances |
| Quantitative radiomics | Fix resampling and extraction settings; test feature stability; prevent training/test leakage |
| Reaction–diffusion simulation | Implement a CPU reference solver with explicit units, initial conditions, tissue domain and boundary conditions; test stability, positivity and grid/time-step convergence |
| Tissue-dependent spread | Obtain reviewed tissue maps; require diffusion imaging or a justified model before claiming tract-directed anisotropy |
| Longitudinal forecasting | Obtain serial scans and treatment timelines; separate calibration from future-scan evaluation; compare against a no-change baseline |
| Treatment-response modelling | Add independently justified model parameters and treatment information; validate each intervention model separately |
| Native AR and VR | Port only after the shared case format and interactions are stable; evaluate tracking, comfort and device-specific performance |
| Clinical translation | Establish hospital partnership, data governance, specialist review, applicable regulatory requirements and prospective validation |

For a later reaction–diffusion solver, the diffusion-only time-step bound quoted in the report is insufficient as a complete numerical verification strategy. Reaction dynamics, heterogeneous coefficients, boundary handling and convergence must also be tested.

**The five-day project is complete when one real, traceable case works end to end on the target device; geometry and measurements pass checks; simulated states are unmistakable; actual performance is recorded; and another person can reproduce the demonstration.** Features that miss those conditions must be listed as incomplete rather than represented by unsupported claims.
