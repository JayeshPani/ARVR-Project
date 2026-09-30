# Claim audit: corrections to the source reports

Tracks corrections between the two source reports (`docs/references/`) and
this project's actual, checked claims (plan section 4, "Corrections to the
source reports"). Add a row per correction as it's verified; do not remove
a row once added, even if later superseded — append a note instead.

| # | Original claim | Checked source | Correction |
|---|---|---|---|
| 1 | Implementation described in past tense as already complete | Direct inspection: only the two PDF reports existed at project start | State functionality as planned/in-progress until it is actually built and demonstrated in this repo |
| 2 | Conflicting publication years/venues cited across the two reports | Original publications (to be re-checked per citation) | Resolve to the actual year/venue for each citation; flag any that can't be verified |
| 3 | TCGA annotation-release count cited as a different figure | [Bakas et al. 2017, Scientific Data](https://doi.org/10.1038/sdata.2017.117) | The data paper reports **243 preoperative cases** — distinct from collection-level totals; use 243 with this citation, not a collection total |
| 4 | ACRIN 6684 identified/counted incorrectly | [TCIA ACRIN-FMISO-Brain collection page](https://www.cancerimagingarchive.net/collection/acrin-fmiso-brain/) | Correct collection name is **ACRIN-FMISO-Brain**, with **45 subjects** |
| 5 | QR-code anchoring described as eliminating drift | N/A — no anchoring method eliminates drift; a QR code only opens a URL, it does not itself register 3D pose | Remove the claim; use a textured image target (plan section D) and report measured jitter/reacquisition time instead |
| 6 | Ordinary FLAIR MRI described as directly supplying white-matter tract directions | N/A — tractography requires diffusion-weighted imaging (e.g. DTI), which FLAIR does not provide | Remove the claim; tract-directed anisotropy is deferred to the roadmap (plan section 5) pending DWI data |
| 7 | Geometric illustrations described as if they were reaction–diffusion simulations or clinical predictions | N/A — conflation of method types | Separate labelling: scenarios in this build are geometric illustrations only (plan section E); a reaction–diffusion solver is future work with its own verification gate |
| 8 | Published accuracy values reused without checking original method/dataset/metric | Per-citation (to be re-checked as encountered) | Retain a figure only after confirming what it actually measured; otherwise remove or caveat it |

## Process notes

- This table is deliberately pre-seeded with the corrections the plan
  already specifies as known; items without a concrete checked source yet
  (rows 2, 8) need the actual source reports re-read against
  `docs/references/` and updated with the specific citation once verified.
- Do not report segmentation Dice scores anywhere in the report/slides —
  this build reuses supplied masks rather than running a segmentation
  model, so a Dice score would not be evaluating anything real (plan
  section 4).
