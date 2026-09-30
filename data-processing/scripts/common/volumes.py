"""Voxel-to-volume conversion (plan section B).

V_mL = N_voxels * |det(A_3x3)| / 1000

where A_3x3 is the spatial (rotation+scale) block of the image affine, in
millimetres. This must always be computed from the ORIGINAL affine, never
from a display/zoom transform — anatomical volume must not change when a
viewer or AR session scales the model on screen (plan section F, "scale
independence").
"""

from __future__ import annotations

import numpy as np


def compute_region_volume_ml(mask: np.ndarray, affine_mm: np.ndarray) -> float:
    """Volume in millilitres of the True/nonzero voxels in `mask`.

    `affine_mm` must be the image's native affine with spatial units already
    verified or converted to millimetres (plan section B.1) — this function
    does not attempt unit conversion itself.
    """
    if mask.ndim != 3:
        raise ValueError(f"Expected a 3D mask, got shape {mask.shape}")
    if affine_mm.shape != (4, 4):
        raise ValueError(f"Expected a 4x4 affine, got shape {affine_mm.shape}")

    if not np.isfinite(affine_mm).all() or abs(np.linalg.det(affine_mm[:3, :3])) < 1e-10:
        raise ValueError("Invalid or singular affine")

    voxel_count = int(np.count_nonzero(mask))
    spatial_block = affine_mm[:3, :3]
    voxel_volume_mm3 = abs(np.linalg.det(spatial_block))

    return voxel_count * voxel_volume_mm3 / 1000.0
