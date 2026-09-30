# Offline case processing

Scripts 01–06 are implemented for case-01. Run from this directory with
`.venv` active; install `requirements.txt` first. Full commands are in the
root README. Source MRI remains in `raw/case-01/` and is checksum-verified
at export. The contour is programmatic, not hand-drawn, not expert, not ML.

| Order | Script | Verified behavior |
|---|---|---|
| 1 | `01_validate_source.py` | Convert source LPS to RAS world affine, require explicit mm interpretation when source units are absent; save NIfTI mm units |
| 2 | `generate_demo_segmentation_case01.py` | Reproduce demonstration mask; save mm units |
| 3 | `02_generate_previews.py` | Reject incompatible geometry/labels, preserve physical preview proportions, save base slices and overlays plus index metadata |
| 4 | `03_reconstruct_meshes.py` | Reject incompatible geometry, preserve `*-raw.glb`, export unchanged quality surface; padded extraction closes boundary-touching masks |
| 5 | `04_compute_volumes.py` | Consolidate binary mask volumes independently; never sum nested regions |
| 6 | `05_build_scenarios.py` | Five scenario types, five states each; expansion low/medium/high; save 35 masks with matching meshes and measurements |
| 7 | `06_export_case_package.py` | Validate source checksum, alignment, volumes, scenario masks and JSON Schema; check all required paths before writing local package |

Run `python -m pytest tests -q`. Real-case audit tests skip when generated
scenario masks are absent. Empty residuals have volume zero and no mesh.

The manifest schema is unchanged. Expansion variants live in the existing
`parameters.sensitivityFrames` object; the normal `frames` array represents
medium sensitivity. Previews use source voxel-axis planes; `slicePosition`
is a voxel index. Original image affine and identity display transform are
recorded separately from viewer-only centring/scale and RAS-to-screen rotation.

Optimisation is deliberately deferred: the baseline is already 10,106
triangles. `*-raw.glb` and the displayed surface are identical. No claim of
post-decimation fidelity is made. Quantitative radiomics, expert/AI
segmentation and biological prediction remain outside this implementation.

Redistribution permission is unresolved. Export creates local assets only;
`redistributable` is false. No deployment is performed.
