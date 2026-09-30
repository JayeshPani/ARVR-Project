#!/usr/bin/env python3
"""Generates case-01's same-case approximate brain envelope (plan section
B) and its GLB mesh, reusing the same marching-cubes pipeline as the tumour
mesh (03_reconstruct_meshes.py::mask_to_world_mesh) so both live in the
same real-world mm coordinate space.

NOT a validated skull-stripping result — see common/brain_envelope.py's
docstring. For illustrative anatomical context only.

Usage:
    python generate_brain_envelope_case01.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common.brain_envelope import extract_approximate_brain_envelope  # noqa: E402

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "reconstruct_meshes", Path(__file__).resolve().parent / "03_reconstruct_meshes.py"
)
_reconstruct = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_reconstruct)
mask_to_world_mesh = _reconstruct.mask_to_world_mesh


def main() -> int:
    case_dir = Path(__file__).resolve().parents[1] / "derived" / "case-01"
    nifti_path = case_dir / "t1.nii.gz"
    if not nifti_path.exists():
        print(f"Run 01_validate_source.py first — missing {nifti_path}", file=sys.stderr)
        return 1

    img = nib.load(str(nifti_path))
    data = np.asarray(img.dataobj)
    spacing_mm = np.linalg.norm(img.affine[:3, :3], axis=0)

    mask = extract_approximate_brain_envelope(data, spacing_mm)
    voxel_count = int(mask.sum())
    if voxel_count == 0:
        print("Generated envelope is empty — thresholds need adjusting for this case.", file=sys.stderr)
        return 1

    volume_ml = voxel_count * float(np.prod(spacing_mm)) / 1000.0

    mask_out = case_dir / "mask-brain-envelope.nii.gz"
    nib.save(nib.Nifti1Image(mask.astype(np.uint8), img.affine, img.header), str(mask_out))

    # This is meant to be a smooth illustrative ENVELOPE, not exact gyral
    # detail - a light 3D Gaussian smooth on the mask (in mm, via per-axis
    # sigma scaled by spacing) removes the high-frequency voxel-boundary
    # noise that otherwise forces an unusably dense, non-watertight mesh.
    smoothing_mm = 1.5
    sigma_voxels = smoothing_mm / spacing_mm
    smoothed = ndimage.gaussian_filter(mask.astype(np.float32), sigma=sigma_voxels) > 0.5

    mesh = mask_to_world_mesh(smoothed, img.affine)
    raw_out = case_dir / "meshes" / "brain-envelope-raw.glb"
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(str(raw_out))
    print(f"Raw mesh: {len(mesh.vertices)} verts, {len(mesh.faces)} faces, watertight={mesh.is_watertight}")

    # A translucent context envelope doesn't need gyral-level detail; keep
    # it well under the plan's 50k-triangle scene budget alongside the
    # tumour mesh (~10k faces).
    target_faces = 8000
    if len(mesh.faces) > target_faces:
        mesh = mesh.simplify_quadric_decimation(face_count=target_faces)
        mesh.merge_vertices()
        mesh.fix_normals()

    if not mesh.is_watertight:
        trimesh.repair.fill_holes(mesh)
        mesh.merge_vertices()
        mesh.fix_normals()

    if not mesh.is_watertight:
        # Purely visual/context asset (not used for any volume or physical
        # measurement) - a handful of decimation seams not forming a
        # perfectly closed manifold doesn't affect its use in the viewer,
        # so this is a recorded fact, not a hard failure.
        print(f"Note: final mesh is not perfectly watertight after decimation+repair (visual-only asset, not used for volume).")

    mesh_out = case_dir / "meshes" / "brain-envelope.glb"
    mesh.export(str(mesh_out))

    print(f"Envelope voxels: {voxel_count}, approx volume: {volume_ml:.1f} mL")
    print(f"Final mesh: {len(mesh.vertices)} verts, {len(mesh.faces)} faces, watertight={mesh.is_watertight}")
    print(f"Saved mask -> {mask_out}")
    print(f"Saved mesh -> {mesh_out} (raw pre-decimation: {raw_out})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
