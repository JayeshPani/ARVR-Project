#!/usr/bin/env python3
"""Case-specific, not part of the generic 01-06 pipeline: generates the
demonstration lesion contour for case-01 (RegLib_C01_1 / Slicer's
MRBrainTumor1 fallback sample), which ships with no segmentation at all.

The seed voxel below was located by a human visually inspecting
derived/case-01/previews/axial-overview.png (and cross-checking coronal/
sagittal), then triangulated precisely via a connected-component search
(see chat history / commit for that exploration) — it is not guessed
blind. The mask itself is grown automatically from that seed by simple
intensity thresholding (see common/demo_segmentation.py): NOT hand-drawn,
NOT expert-validated, NOT a trained model.

Usage:
    python generate_demo_segmentation_case01.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import nibabel as nib
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.io import validate_geometry
from common.demo_segmentation import grow_demo_lesion_mask  # noqa: E402
from common.volumes import compute_region_volume_ml  # noqa: E402

SEED_VOXEL = (131, 96, 75)  # (x, y, z) in derived/case-01/t1.nii.gz voxel space


def main() -> int:
    case_dir = Path(__file__).resolve().parents[1] / "derived" / "case-01"
    nifti_path = case_dir / "t1.nii.gz"
    if not nifti_path.exists():
        print(f"Run 01_validate_source.py first — missing {nifti_path}", file=sys.stderr)
        return 1

    img = nib.load(str(nifti_path))
    validate_geometry(img)
    data = np.asarray(img.dataobj)

    mask = grow_demo_lesion_mask(data, seed=SEED_VOXEL)
    voxel_count = int(mask.sum())
    if voxel_count == 0:
        print("Generated mask is empty — seed/threshold need adjusting.", file=sys.stderr)
        return 1

    volume_ml = compute_region_volume_ml(mask, img.affine)

    out_path = case_dir / "mask-whole-tumour-demo.nii.gz"
    mask_img = nib.Nifti1Image(mask.astype(np.uint8), img.affine)
    mask_img.header.set_xyzt_units("mm")
    nib.save(mask_img, str(out_path))

    print(f"Seed voxel: {SEED_VOXEL} (intensity {data[SEED_VOXEL]})")
    print(f"Mask voxels: {voxel_count}")
    print(f"Volume: {volume_ml:.2f} mL")
    print(f"Saved -> {out_path}")
    print()
    print("Mask origin for the manifest: 'programmatic threshold-based demonstration")
    print("contour, seeded from a human-identified location - not expert-validated,")
    print("not hand-drawn, not diagnostic'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
