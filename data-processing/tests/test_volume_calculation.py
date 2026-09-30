"""Engineering acceptance test: 'Volume' row of plan section 4's test table.

A known synthetic cuboid must reproduce its analytic volume within
floating-point tolerance, using the exact formula from plan section B:

    V_mL = N_voxels * |det(A_3x3)| / 1000
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from common.volumes import compute_region_volume_ml  # noqa: E402


def _cuboid_mask(shape: tuple[int, int, int]) -> np.ndarray:
    return np.ones(shape, dtype=bool)


def test_axis_aligned_cuboid_matches_analytic_volume():
    shape = (20, 10, 5)  # voxels
    spacing_mm = (2.0, 1.0, 0.5)  # mm per voxel, one axis each

    affine = np.diag([*spacing_mm, 1.0])
    mask = _cuboid_mask(shape)

    analytic_volume_ml = (shape[0] * spacing_mm[0]) * (shape[1] * spacing_mm[1]) * (shape[2] * spacing_mm[2]) / 1000.0

    computed = compute_region_volume_ml(mask, affine)

    assert computed == pytest.approx(analytic_volume_ml, rel=1e-9)


def test_rotated_affine_gives_same_volume_as_axis_aligned():
    """A pure rotation must not change the computed volume: |det| is
    rotation-invariant, so this also guards against an implementation that
    naively multiplies diagonal entries instead of using the determinant."""
    shape = (12, 8, 6)
    spacing_mm = (1.5, 1.5, 1.5)
    mask = _cuboid_mask(shape)

    axis_aligned_affine = np.diag([*spacing_mm, 1.0])

    theta = np.deg2rad(37)
    rotation = np.array(
        [
            [np.cos(theta), -np.sin(theta), 0],
            [np.sin(theta), np.cos(theta), 0],
            [0, 0, 1],
        ]
    )
    rotated_affine = np.eye(4)
    rotated_affine[:3, :3] = rotation @ axis_aligned_affine[:3, :3]

    volume_axis_aligned = compute_region_volume_ml(mask, axis_aligned_affine)
    volume_rotated = compute_region_volume_ml(mask, rotated_affine)

    assert volume_rotated == pytest.approx(volume_axis_aligned, rel=1e-9)


def test_empty_mask_has_zero_volume():
    mask = np.zeros((5, 5, 5), dtype=bool)
    affine = np.eye(4)
    assert compute_region_volume_ml(mask, affine) == 0.0


def test_display_scale_must_not_be_used_for_volume():
    """Guards the 'scale independence' requirement (plan section F): a
    display/zoom transform with a different scale than the true voxel
    spacing must give a DIFFERENT (and therefore wrong) volume, to make
    clear why callers must always pass the original imaging affine."""
    shape = (10, 10, 10)
    mask = _cuboid_mask(shape)

    original_affine = np.diag([1.0, 1.0, 1.0, 1.0])
    display_only_affine = np.diag([2.0, 2.0, 2.0, 1.0])  # e.g. a 2x on-screen zoom

    true_volume = compute_region_volume_ml(mask, original_affine)
    volume_if_display_transform_misused = compute_region_volume_ml(mask, display_only_affine)

    assert true_volume != pytest.approx(volume_if_display_transform_misused, rel=1e-9)

