"""Same-case approximate brain envelope (plan section B: "Use a same-case
brain envelope where a suitable brain mask is available").

This is classical morphology (Euclidean-distance-transform erosion to peel
past the skull/scalp, keep the largest interior component, dilate back,
then a small closing pass to bridge sulcal CSF gaps into one smooth
envelope) — NOT a validated skull-stripping tool (e.g. SynthStrip/BET/HD-BET),
NOT trained on data, and NOT guaranteed accurate at the gyral level. It is
good enough for translucent anatomical CONTEXT in the viewer/AR, not for any
quantitative claim about brain tissue volume. Label it exactly that way
everywhere it surfaces (manifest `anatomicalContext.label`, limitations).
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage
from skimage import measure


def _largest_component(mask: np.ndarray) -> np.ndarray:
    labels = measure.label(mask)
    if labels.max() == 0:
        return mask
    props = sorted(measure.regionprops(labels), key=lambda p: -p.area)
    return labels == props[0].label


def extract_approximate_brain_envelope(
    data: np.ndarray,
    spacing_mm: np.ndarray,
    head_threshold_fraction: float = 0.08,
    erosion_mm: float = 8.0,
    closing_mm: float = 4.0,
) -> np.ndarray:
    """Returns a boolean mask approximating the brain's outer surface,
    excluding skull/scalp, from a single T1-like head volume.

    Method: threshold tissue-vs-background -> erode `erosion_mm` past the
    (thin) skull/scalp using a real-world-mm distance transform (so it
    works correctly under anisotropic voxel spacing) -> keep only the
    largest remaining component (the brain interior, now disconnected from
    skull/scalp fragments) -> dilate back by the same distance, clipped to
    the original tissue mask (so it can't re-grow into skull) -> a small
    morphological closing to bridge sulcal CSF gaps into one smooth blob
    for a cleaner envelope surface.
    """
    head = data > (head_threshold_fraction * data.max())
    head = ndimage.binary_fill_holes(head)
    head = _largest_component(head)

    edt_inside = ndimage.distance_transform_edt(head, sampling=spacing_mm)
    core = edt_inside > erosion_mm
    core = _largest_component(core)

    edt_outside_core = ndimage.distance_transform_edt(~core, sampling=spacing_mm)
    envelope = (edt_outside_core <= erosion_mm) & head

    dilated = ndimage.distance_transform_edt(~envelope, sampling=spacing_mm) <= closing_mm
    closed = ~(ndimage.distance_transform_edt(~dilated, sampling=spacing_mm) > closing_mm)
    closed = closed & head

    return _largest_component(closed)
