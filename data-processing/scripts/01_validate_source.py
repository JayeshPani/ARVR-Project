#!/usr/bin/env python3
"""Day 1 task (plan section B.1-B.4).

Validate image dimensions, spacing, orientation and affine transform for a
source case, and convert it to canonical NIfTI (preserving the original
NRRD untouched in raw/). Mask-alignment/label checks are added once a
segmentation mask exists for the case (see docs/provenance/claim-audit.md
and data-source-manifest.md for why this case currently has none).

Usage:
    python 01_validate_source.py --case-dir raw/case-01 --out derived/case-01
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.io import load_nrrd_as_ras, save_as_nifti  # noqa: E402


def validate_and_convert(nrrd_path: Path, out_dir: Path, source_units: str | None = None) -> None:
    if not nrrd_path.exists():
        raise FileNotFoundError(f"Source volume not found: {nrrd_path}")

    data, affine, header = load_nrrd_as_ras(nrrd_path, source_units)

    print(f"Source: {nrrd_path}")
    print(f"  shape (voxels): {data.shape}")
    print(f"  dtype: {data.dtype}")
    print(f"  value range: [{data.min()}, {data.max()}]")

    spatial_block = affine[:3, :3]
    spacing_mm = np.linalg.norm(spatial_block, axis=0)
    print(f"  voxel spacing (mm, RAS axes): {spacing_mm}")

    if np.any(spacing_mm <= 0) or np.any(spacing_mm > 10):
        raise ValueError(
            f"Voxel spacing {spacing_mm} mm is outside a plausible MRI range (0, 10] mm per axis "
            "- refusing to proceed silently (plan: fail clearly on invalid geometry)."
        )

    if data.ndim != 3:
        raise ValueError(f"Expected a 3D volume, got {data.ndim}D")

    det = np.linalg.det(spatial_block)
    print(f"  affine 3x3 determinant: {det:.6f} ({'right' if det > 0 else 'left'}-handed)")

    out_path = out_dir / "t1.nii.gz"
    save_as_nifti(data, affine, out_path)
    print(f"Converted (LPS->RAS, no resampling) -> {out_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-units", choices=["mm"])
    args = parser.parse_args()

    nrrd_candidates = sorted(args.case_dir.glob("*.nrrd"))
    if not nrrd_candidates:
        print(f"No .nrrd file found in {args.case_dir}", file=sys.stderr)
        return 1

    validate_and_convert(nrrd_candidates[0], args.out, args.source_units)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
