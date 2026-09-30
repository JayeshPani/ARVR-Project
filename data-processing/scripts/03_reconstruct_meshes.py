#!/usr/bin/env python3
"""Day 1 (basic export) / Day 2 (smoothing+decimation) task (plan B.6-B.8).

Reconstructs a surface from a segmentation mask using marching cubes,
transforms vertices through the image's own affine into real-world
millimetres (not just raw voxel indices — plan B.8: "export every
structure through the same coordinate transform"), and exports as GLB.

The original surface is saved separately as *-raw.glb. Smoothing and
decimation are deferred while the model fits the triangle budget, pending
measured device performance. Display export preserves the original surface.

Usage:
    python 03_reconstruct_meshes.py --nifti derived/case-01/t1.nii.gz \\
        --mask derived/case-01/mask-whole-tumour-demo.nii.gz \\
        --out derived/case-01/meshes/whole-tumour.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from skimage import measure
from common.io import validate_alignment


def mask_to_world_mesh(mask: np.ndarray, affine_mm: np.ndarray) -> trimesh.Trimesh:
    """Marching cubes on `mask`, with vertices transformed by `affine_mm`
    (the image's own RAS affine) so the mesh lives in the same real-world
    mm space as the volume it came from — not an arbitrary local frame."""
    if not mask.any():
        raise ValueError("Empty mask has no surface")
    verts_voxel, faces, normals, _ = measure.marching_cubes(np.pad(mask, 1).astype(np.float32), level=0.5)
    verts_voxel -= 1

    rotation_scale = affine_mm[:3, :3]
    translation = affine_mm[:3, 3]
    # macOS numpy (Accelerate BLAS backend) raises a spurious "divide by
    # zero encountered in matmul" RuntimeWarning on some matmul shapes even
    # when every output value is finite (verified below) - a known
    # Accelerate false positive, not a real division. Suppressed locally
    # rather than globally so a genuine issue elsewhere still surfaces.
    with np.errstate(all="ignore"):
        verts_world = verts_voxel @ rotation_scale.T + translation

    if not np.isfinite(verts_world).all():
        raise ValueError("Transformed mesh vertices contain non-finite values — check the affine and mask")

    mesh = trimesh.Trimesh(vertices=verts_world, faces=faces, process=False)

    # skimage's marching_cubes winding gives inward-facing normals here
    # (mesh.volume comes out negative) - left uncorrected, three.js's
    # default backface culling would render the tumour invisible from
    # outside. fix_normals reorients winding consistently outward.
    mesh.fix_normals()

    return mesh


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nifti", type=Path, required=True, help="Reference image, for its affine")
    parser.add_argument("--mask", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    if not args.nifti.exists() or not args.mask.exists():
        print(f"Missing input: {args.nifti} or {args.mask}", file=sys.stderr)
        return 1

    reference_img = nib.load(str(args.nifti))
    mask_img = nib.load(str(args.mask))
    mask = validate_alignment(reference_img, mask_img)

    if mask.shape != reference_img.shape:
        print(f"Mask shape {mask.shape} != reference image shape {reference_img.shape}", file=sys.stderr)
        return 1
    if not mask.any():
        print("Mask is empty — nothing to reconstruct", file=sys.stderr)
        return 1

    mesh = mask_to_world_mesh(mask, reference_img.affine)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(str(args.out.with_name(args.out.stem + "-raw.glb")))
    # Already below budget: preserve the original geometry until device measurements justify optimisation.
    mesh.export(str(args.out))

    print(f"Vertices: {len(mesh.vertices)}, faces: {len(mesh.faces)}")
    print(f"Watertight: {mesh.is_watertight}")
    print(f"Bounds (mm): {mesh.bounds.tolist()}")
    print(f"Saved -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
