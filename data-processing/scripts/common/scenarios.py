"""Deterministic mask-space illustrations with physical millimetre distances."""
import numpy as np
from scipy.ndimage import distance_transform_edt

EXPLANATIONS = {
 'baseline': 'Imaging-derived demonstration segmentation, not expert-validated.',
 'illustrative-expansion': 'Geometric illustration; not predicted infiltration. Low/medium/high spread is parameter sensitivity, not a confidence interval.',
 'resection': 'Geometric removal; no surgical feasibility or outcome estimate.',
 'localised-reduction': 'Radiation-inspired illustration; no dose calculation.',
 'global-reduction': 'Drug-response illustration; no pharmacological model.'}


def scenario_masks(mask, affine, scenario, maximum_mm=4.0):
    if scenario not in EXPLANATIONS or not mask.any():
        raise ValueError('Unknown scenario or empty baseline')
    spacing = np.linalg.norm(affine[:3, :3], axis=0)
    directions = affine[:3, :3] / spacing
    if not np.allclose(directions.T @ directions, np.eye(3), atol=1e-5):
        raise ValueError('Distance transforms require orthogonal voxel axes')
    inside = distance_transform_edt(np.pad(mask, 1), sampling=spacing)[1:-1, 1:-1, 1:-1]
    outside = distance_transform_edt(~mask, sampling=spacing)
    x = np.arange(mask.shape[0])[:, None, None]
    occupied = np.where(mask)[0]
    low, high = int(occupied.min()), int(occupied.max()) + 1
    for step in range(5):
        amount = maximum_mm * step / 4
        if step == 0 or scenario == 'baseline':
            frame = mask.copy()
        elif scenario == 'illustrative-expansion':
            frame = mask | (outside <= amount)
            if any(np.take(frame, i, axis=a).any() for a in range(3) for i in [0, -1]):
                raise ValueError('Expansion reaches image boundary')
        elif scenario == 'resection':
            frame = mask & (x >= low + (high - low) * step / 4)
        elif scenario == 'localised-reduction':
            frame = mask & ((x < (low + high) / 2) | (inside > amount))
        else:
            frame = mask & (inside > amount)
        yield frame
