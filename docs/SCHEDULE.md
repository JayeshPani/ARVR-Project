# Five-day schedule checklist

Mirrors `docs/PLAN.md` section 3. Check items off as they're actually done
— don't pre-check anything.

## Day 1 — Feasibility and data (~8h)

- [x] 2h: device/AR test — confirmed: mind-ar@1.2.5/three@0.151.3 tracks correctly on the actual device in Safari (camera access granted, `searching` → `tracking`, cube correctly anchored to the target image)
- [x] 2h: data access — went straight to the Slicer `MRBrainTumor1` fallback (BraTS/TCIA need an account/data-use-agreement neither of us can complete non-interactively, so the 2h cap would've been spent failing that first) — downloaded, checksum-verified
- [x] 3h: case inspection and basic mesh export — converted to NIfTI, generated a programmatic demonstration lesion contour (this dataset ships with no segmentation), volume computed (15.22 mL), marching-cubes GLB exported and watertight
- [x] 1h: setup notes — see `docs/provenance/data-source-manifest.md`; device/Safari version still needs recording once you run the AR test
- **Checkpoint: partial.** MRI and demonstration mask exist; primitive tracking was previously reported on device. Redistribution permission remains unverified.

## Day 2 — Working viewer (~8h)

- [x] 3h: processing pipeline (scripts 01–04); original surface preserved, optimisation deferred pending device evidence
- [ ] 4h: viewer — GLB, brain context/opacity, rotate/zoom/reset, cutaways, isolation/focus, measurements and MRI overlays implemented; full target-device and orientation acceptance still pending
- [ ] 1h: checks
- **Checkpoint:** one real case is fully inspectable in ordinary 3D

## Day 3 — Complete interaction (~8h)

- [ ] 3h: integrate case into AR
- [x] 3h: scenario generation (script 05) and timeline UI — five states and expansion sensitivity variants
- [ ] 2h: device testing
- **Checkpoint:** an end-to-end demonstration works with one case
- **Freeze new features at the end of today.**

## Day 4 — Verification and refinement (~8h)

- [ ] 3h: geometry/scenario tests (fill in `docs/evaluation/acceptance-tests.md`)
- [ ] 2h: mobile performance and recovery
- [ ] 2h: small usability pilot (`docs/evaluation/usability-pilot.md`)
- [ ] 1h: fixes
- **Checkpoint:** major defects fixed and measured results recorded

## Day 5 — Submission (~8h)

- [ ] 2h: regression checks
- [ ] 3h: report and diagrams
- [ ] 2h: slides/video
- [ ] 1h: packaging and rehearsal
- **Checkpoint:** reproducible release, report, presentation and backup demonstration

## Scope-control rules (always in force)

- Data access > 2h → take the Slicer fallback.
- AR tracking fails after a focused 2h debugging attempt → ship the 3D viewer, record AR as blocked. Never call a desktop mock-up "AR."
- Mesh optimisation damages geometry → keep the higher-quality mesh, reduce scene complexity instead.
- Second case only after the first passes end-to-end.
- No model training, backend, native app migration, or new physics solver on Days 4–5.
