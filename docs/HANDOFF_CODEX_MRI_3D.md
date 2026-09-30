> Update — 2026-09-21: the original handoff below is retained for context.
> Scripts 04–06 are now implemented; geometry and unit validation is stricter;
> previews preserve physical proportions; 35 scenario masks and a local case
> package are generated. The ordinary viewer and scenario controls are wired.
> Run instructions/status: `data-processing/README.md`, root `README.md`,
> and `docs/evaluation/acceptance-tests.md`. Original surfaces are retained;
> optimisation is deferred. Redistribution permission remains unverified.
> Tumour AR, in-scene MRI context and target-device acceptance remain pending.

# Handoff: MRI → 3D modelling pipeline (`data-processing/`)

For an agent picking up **only** the MRI processing / 3D mesh reconstruction
/ radiomics side of this project. You do not need to touch `frontend/`
unless a change there requires a manifest schema change (coordinate with
whoever owns the frontend if so — see "Interface you must not break" below).

**Read first, in this order:**
1. `docs/PLAN.md` — the governing spec. Sections A, B and E are your remit.
2. `docs/SCHEDULE.md` — day-by-day checklist; Day 1 is done, you're picking
   up Day 2 onward for the data-processing side.
3. `docs/provenance/data-source-manifest.md` — what data exists and its
   exact honesty constraints (read this before writing anything that
   touches masks/labels).
4. `data-processing/README.md` — pipeline script status table.
5. This file.

## What this project actually is (don't over-scope)

A 5-day academic demonstrator, not a research system. The plan is explicit
that **quantitative radiomics is future work, not part of this build**
(plan section 5: "Quantitative radiomics" requires fixed resampling/
extraction settings, feature-stability testing, and leakage prevention
before any claim is made — none of that exists yet, and doing it properly
is its own multi-day effort). If you're asked to "add radiomics," treat it
as an *optional stretch extension with its own evidence gate*, not a
same-day deliverable, and say so explicitly rather than shipping an
unvalidated feature extractor dressed up as a result. Same applies to
"automated segmentation" — the current mask is a labelled placeholder, not
a model, and must stay described that way unless someone actually trains
and validates one (plan section 5 spells out what that validation requires:
checkpoint licence, training/test overlap check, per-region Dice + surface
distance on independent cases).

If in doubt about scope, the plan's own scope-control rules (section 3) and
completion definition (end of section 5) are the tiebreaker, not ambition.

## What's done

| Artifact | Where | Notes |
|---|---|---|
| Real MRI case | `data-processing/raw/case-01/RegLib_C01_1.nrrd` | 3D Slicer `MRBrainTumor1` sample, sha256 `998cb52217...7937b95` (verified against Slicer's own registry). No login/account needed — see `docs/provenance/data-source-manifest.md` for exactly why BraTS/TCIA were not used (both need an account/DUA). **Ships with no segmentation.** |
| NRRD→NIfTI conversion | `scripts/01_validate_source.py`, `scripts/common/io.py` | LPS→RAS sign-flip only, no resampling. Output: `derived/case-01/t1.nii.gz`, shape (256,256,112), spacing 0.9375×0.9375×1.4mm |
| Demo tumour mask | `scripts/generate_demo_segmentation_case01.py`, `scripts/common/demo_segmentation.py` | Seeded region-growing from a human-identified location (seed voxel `(131,96,75)`, see script docstring for how it was found). **Programmatic, not hand-drawn, not expert, not ML** — this exact phrase must propagate to any manifest/report text. Output: `derived/case-01/mask-whole-tumour-demo.nii.gz`, volume 15.22 mL |
| Previews + overlays | `scripts/02_generate_previews.py` | Contact-sheet overviews + per-plane overlay at the mask's centroid slice. Output: `derived/case-01/previews/*.png` |
| Mesh reconstruction | `scripts/03_reconstruct_meshes.py` | Marching cubes → vertices transformed through the image's own affine (mm, not voxel indices) → GLB. Output: `derived/case-01/meshes/whole-tumour.glb` (5093 verts / 10106 faces, watertight). **No smoothing/decimation yet** — that's your Day 2 task, and the plan requires the ORIGINAL (this) surface be saved before any decimation happens. |
| Volume formula | `scripts/common/volumes.py` | `V_mL = N_voxels * |det(A_3x3)| / 1000`, using the image's own affine — never a display/zoom transform. Unit-tested. |
| Tests | `tests/test_volume_calculation.py`, `tests/test_mesh_reconstruction.py` | 7/7 passing. Run with `source .venv/bin/activate && python -m pytest tests/ -v` |

## A real bug you should know about (so you don't reintroduce it)

`skimage.measure.marching_cubes` returned faces with **inward-facing
normals** on this mask (mesh volume came out negative). Left alone, three.js's
default backface culling would make the tumour invisible from most camera
angles. Fixed in `03_reconstruct_meshes.py::mask_to_world_mesh` with
`mesh.fix_normals()`. `tests/test_mesh_reconstruction.py` has two tests
(`test_orientation_bump_lands_on_correct_world_side`,
`test_orientation_survives_a_negative_determinant_affine`) that would have
caught this — if you touch mesh reconstruction, run these, don't just eyeball
one screenshot.

Also: on this Mac, numpy uses Apple's Accelerate BLAS backend, which raises
a **spurious** `RuntimeWarning: divide by zero encountered in matmul` on some
matmul shapes even though the output is fully finite (verified by hand).
It's suppressed locally in that one function with a comment explaining why.
Don't silence it globally, and don't panic if you see it elsewhere and can
independently confirm the output has no actual NaN/Inf.

## What's left (your remit, Day 2+ per `docs/PLAN.md` section B)

In rough order:

1. **Mesh smoothing + decimation** (plan B.7). Apply conservative smoothing
   (e.g. Laplacian/Taubin) and decimation to `03_reconstruct_meshes.py`'s
   output, but **only after** the original surface is saved (already true
   — keep it that way, e.g. write to a separate `*-raw.glb` before
   simplifying). Target: comfortably under 50,000 visible triangles across
   the whole scene (plan section F) — right now one region is ~10k faces,
   so budget matters more once there are multiple regions/scenario frames.
   Acceptance criterion (plan section 4, "Mesh fidelity"): target surface
   displacement within one source-voxel diagonal after optimisation —
   write a test for this (compare pre/post simplification via e.g.
   trimesh's `proximity` module or Hausdorff distance), don't just assert
   triangle count went down.

2. **`04_compute_volumes.py`** — currently a stub; volume computation itself
   (`common/volumes.py`) is done and tested. This script should consolidate
   per-region volumes into a single artifact (e.g. `derived/<case>/volumes.json`)
   once a case has multiple regions. Remember: whole tumour / tumour core /
   enhancing tumour (when they exist) are **nested**, never sum them as
   disjoint (plan section B).

3. **`05_build_scenarios.py`** (plan section E) — the biggest remaining
   piece. Five scenarios, each exactly 5 discrete states, computed from mask
   operations (not mesh operations — do it in voxel space, then run each
   state through the same mesh pipeline):
   - `baseline` — unmodified mask, trivial
   - `illustrative-expansion` — signed-distance transform expansion at
     predefined mm offsets (provide low/med/high variants — label the
     spread "parameter sensitivity", never "confidence interval")
   - `resection` — remove voxels on one side of a plane; must never let
     residual volume exceed baseline, and must handle an empty residual
   - `localised-reduction` — erosion within a selected sub-region
   - `global-reduction` — erosion applied to the whole mask
   Every frame's volume must be computed from *that frame's own mask*, not
   interpolated or animated separately from the displayed number. Each
   scenario needs a plain-language `explanation` string (see
   `case-schema/case-manifest.schema.json`'s `scenarios[].explanation`
   field) stating what it is and, just as importantly, what it is **not**
   (not a predicted infiltration, not a surgical feasibility estimate, not
   a dose calculation, not a pharmacological model — the plan spells out
   the exact required caveat per scenario, copy it).

4. **`06_export_case_package.py`** — assemble everything (provenance,
   geometry, regions+volumes, previews, scenario frames, limitations) into
   one `manifest.json` matching `case-schema/case-manifest.schema.json`
   exactly, and copy referenced assets into `frontend/public/cases/<caseId>/`.
   Must fail loudly (non-zero exit) on invalid geometry or missing required
   assets — optional missing regions get hidden with an explanation, not
   silently dropped.

5. **(Optional, only after case-01 passes end-to-end) a second real case**
   — plan section 3 explicitly says don't start this until the first case
   is fully working, so don't context-switch into it early.

## Interface you must not break

`case-schema/case-manifest.schema.json` is the contract with the frontend
(mirrored by hand in `frontend/src/case/types.ts` — no codegen, so if you
change the schema, tell whoever owns the frontend to update that file too).
Every path referenced inside a manifest (`meshPath`, `imagePath`, etc.) is
relative to that case's folder under `frontend/public/cases/<caseId>/` and
must actually exist there after your export step runs — the frontend's
loader (`frontend/src/case/loader.ts`) fails loudly and clearly on a missing
or malformed manifest, by design; don't try to make it more lenient instead
of fixing the export step.

## Environment

```bash
cd data-processing
python3 -m venv .venv        # already exists; recreate if needed
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests/ -v   # should show 7 passed before you change anything
```

Verified working from a clean venv (just ran it): Python 3.14.0, nibabel
5.4.2, numpy 1.26.4, scipy 1.17.1, scikit-image 0.26.0, trimesh 4.12.2,
pynrrd (needed to read the source `.nrrd` file — `nibabel` alone cannot
open NRRD; already in `requirements.txt`).

## Definition of done for this remit

Per `docs/PLAN.md`'s own completion definition: case-01 works end to end
(mesh, volumes, scenarios all pass their acceptance tests in
`docs/evaluation/acceptance-tests.md`), simulated states are unmistakably
labelled as such everywhere they surface, and someone else can reproduce
every artifact in `derived/case-01/` from `raw/case-01/` by re-running the
numbered scripts in order. Update `docs/evaluation/acceptance-tests.md` and
`data-processing/README.md`'s status table as you go — they're the source
of truth for what's actually verified versus still aspirational.
