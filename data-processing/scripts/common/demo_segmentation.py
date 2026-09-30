"""Generates a PROGRAMMATIC DEMONSTRATION contour for the plan's Slicer
fallback case (RegLib_C01_1 / MRBrainTumor1), which ships with no
segmentation.

This is explicitly NOT a manual (hand-drawn) contour and NOT an expert
annotation and NOT a trained segmentation model. It is simple, inspectable
image processing — a local intensity threshold plus connected-component
selection, seeded from a location a human (visually inspecting
derived/case-01/previews/) identified as the lesion — used only to
unblock engineering per plan section A: "If no permitted real case is
available by the first-day deadline, use a visibly labelled synthetic
phantom to unblock engineering."

Every place this mask's origin is recorded (manifest maskOrigin field,
docs/provenance/data-source-manifest.md) must say exactly what this is:
a programmatic threshold-based demonstration contour, not expert-validated,
not hand-drawn, not diagnostic.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage
from skimage import morphology


def grow_demo_lesion_mask(
    data: np.ndarray,
    seed: tuple[int, int, int],
    margin: tuple[int, int, int] = (30, 30, 20),
    threshold: float | None = None,
) -> np.ndarray:
    """Connected-threshold region growing, restricted to a bounding box
    around `seed` so it cannot leak into unrelated anatomy far away."""
    sx, sy, sz = seed
    mx, my, mz = margin
    shape = data.shape

    x0, x1 = max(sx - mx, 0), min(sx + mx, shape[0])
    y0, y1 = max(sy - my, 0), min(sy + my, shape[1])
    z0, z1 = max(sz - mz, 0), min(sz + mz, shape[2])

    crop = data[x0:x1, y0:y1, z0:z1]
    local_seed = (sx - x0, sy - y0, sz - z0)

    if threshold is None:
        # Otsu-style split isn't robust on such a small/skewed crop; use a
        # fixed offset above the crop's median (background brain tissue)
        # instead, calibrated against this specific case during Day 1.
        threshold = float(np.median(crop)) + 60.0

    binary = crop >= threshold
    # Disconnects thin bright structures (e.g. the falx cerebri, a bright
    # midline sheet on T1) from the bulkier compact lesion before labelling,
    # so growth can't leak into them through a hairline connection.
    binary = morphology.opening(binary, morphology.ball(2))
    labels, _ = ndimage.label(binary)
    seed_label = labels[local_seed]
    if seed_label == 0:
        raise ValueError(
            f"Seed voxel {seed} (value {crop[local_seed]}) is below threshold {threshold}; "
            "adjust the seed or threshold."
        )

    local_mask = labels == seed_label

    full_mask = np.zeros(shape, dtype=bool)
    full_mask[x0:x1, y0:y1, z0:z1] = local_mask
    return full_mask
