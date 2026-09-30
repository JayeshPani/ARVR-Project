"""Engineering acceptance tests: 'Orientation' and 'Mesh fidelity' rows of
plan section 4's test table.

'Orientation' specifically requires an ASYMMETRIC test object to catch a
left/right mirror or axis swap that a symmetric shape (like a plain cube)
would hide.
"""

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from common.volumes import compute_region_volume_ml  # noqa: E402

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "reconstruct_meshes", Path(__file__).resolve().parents[1] / "scripts" / "03_reconstruct_meshes.py"
)
_reconstruct = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_reconstruct)
mask_to_world_mesh = _reconstruct.mask_to_world_mesh


def _asymmetric_mask(shape=(30, 30, 30)) -> np.ndarray:
    """A cube with a single-voxel-thick bump on one +x face only —
    asymmetric along x, symmetric along y/z, so a mirror or axis swap
    changes which side the bump ends up on."""
    mask = np.zeros(shape, dtype=bool)
    mask[10:20, 10:20, 10:20] = True
    mask[20:22, 14:16, 14:16] = True  # bump on the +x face, centred in y/z
    return mask


def test_orientation_bump_lands_on_correct_world_side():
    mask = _asymmetric_mask()
    affine = np.diag([1.0, 1.0, 1.0, 1.0])  # identity: voxel index i == world mm i

    mesh = mask_to_world_mesh(mask, affine)

    # The bump is at higher x than the cube body; the mesh's vertex
    # centroid on the +x half must include those bump vertices, i.e. the
    # max x extent must reach the bump (~21-22mm) not stop at the cube
    # body's edge (~20mm untouched) or appear mirrored at the -x side.
    assert mesh.vertices[:, 0].max() > 20.5
    assert mesh.vertices[:, 0].min() >= 9.5  # nothing leaked to the mirrored -x side


def test_orientation_survives_a_negative_determinant_affine():
    """A left-handed (mirrored) affine, as could arise from an orientation
    bug, must produce a mesh whose bump moves to the OPPOSITE world side
    versus the right-handed affine — proving this test can actually
    detect a real mirror bug, not just always pass."""
    mask = _asymmetric_mask()

    right_handed = np.diag([1.0, 1.0, 1.0, 1.0])
    left_handed = np.diag([-1.0, 1.0, 1.0, 1.0])  # mirrors the x axis

    mesh_rh = mask_to_world_mesh(mask, right_handed)
    mesh_lh = mask_to_world_mesh(mask, left_handed)

    assert mesh_rh.vertices[:, 0].max() > 20.5  # bump on +x
    assert mesh_lh.vertices[:, 0].min() < -20.5  # same bump now on -x under mirroring


def test_watertight_and_volume_matches_voxel_count():
    shape = (20, 20, 20)
    mask = np.zeros(shape, dtype=bool)
    # a solid interior block, away from the array border, so marching
    # cubes produces a clean closed surface
    mask[5:15, 5:15, 5:15] = True

    spacing_mm = (1.2, 1.2, 1.2)
    affine = np.diag([*spacing_mm, 1.0])

    mesh = mask_to_world_mesh(mask, affine)
    assert mesh.is_watertight

    voxel_volume_ml = compute_region_volume_ml(mask, affine)
    mesh_volume_ml = mesh.volume / 1000.0  # mesh.volume is in mm^3 since vertices are in mm

    # Marching cubes approximates the voxel block's surface at the
    # half-level boundary, so its volume is systematically a bit smaller
    # than the raw voxel count's volume - not equal, but close.
    assert mesh_volume_ml == pytest.approx(voxel_volume_ml, rel=0.1)
