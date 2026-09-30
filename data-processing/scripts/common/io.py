"""NRRD -> NIfTI conversion (plan section A/B: preserve the original image,
convert to a canonical format without re-registering or renormalising).

NRRD files from 3D Slicer/ITK-family tools are commonly in LPS space;
NIfTI's convention is RAS+. This flips the sign of the first two axes of
the direction matrix and origin, which is the standard LPS->RAS convention
used by tools like dcm2niix and SimpleITK — not a registration or
resampling step, just a coordinate-convention relabelling.
"""

from __future__ import annotations

from pathlib import Path

import nibabel as nib
import numpy as np
import nrrd

_LPS_TO_RAS = np.diag([-1.0, -1.0, 1.0, 1.0])


def load_nrrd_as_ras(path: Path, source_units: str | None = None) -> tuple[np.ndarray, np.ndarray, dict]:
    """Returns (data, affine_ras_mm, raw_nrrd_header)."""
    data, header = nrrd.read(str(path))

    space = header.get("space", "")
    if space.lower() != "left-posterior-superior":
        raise ValueError(
            f"{path}: expected an LPS-family NRRD 'space' field, got {space!r}. "
            "The LPS->RAS sign flip below assumes LPS; verify manually before proceeding."
        )

    units = header.get("space units")
    if units is None:
        if source_units != "mm":
            raise ValueError("NRRD has no spatial units; provide --source-units mm only with documented source evidence")
    elif list(units) != ["mm", "mm", "mm"]:
        raise ValueError(f"Unsupported spatial units: {units}")

    space_directions = np.asarray(header["space directions"], dtype=float)  # rows = per-axis direction*spacing, in LPS
    space_origin = np.asarray(header["space origin"], dtype=float)

    affine_lps = np.eye(4)
    affine_lps[:3, :3] = space_directions.T  # columns = axis directions, as a proper index->world matrix
    affine_lps[:3, 3] = space_origin

    affine_ras = _LPS_TO_RAS @ affine_lps

    return data, affine_ras, header


def save_as_nifti(data: np.ndarray, affine_ras_mm: np.ndarray, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img = nib.Nifti1Image(data, affine_ras_mm)
    img.header.set_xyzt_units("mm")
    validate_geometry(img)
    nib.save(img, str(out_path))


def validate_geometry(img) -> None:
    if len(img.shape) != 3 or min(img.shape) < 1:
        raise ValueError("Expected nonempty 3D image")
    if img.header.get_xyzt_units()[0] != "mm":
        raise ValueError("Image spatial units must be explicitly millimetres")
    a = img.affine
    if not np.isfinite(a).all() or abs(np.linalg.det(a[:3, :3])) < 1e-10:
        raise ValueError("Invalid or singular affine")
    if not np.allclose(a[3], [0, 0, 0, 1]):
        raise ValueError("Invalid affine homogeneous row")


def validate_alignment(image, mask) -> np.ndarray:
    validate_geometry(image)
    validate_geometry(mask)
    if image.shape != mask.shape or not np.allclose(image.affine, mask.affine, atol=1e-5, rtol=0):
        raise ValueError("Image/mask grid or affine mismatch")
    values = np.asarray(mask.dataobj)
    if not np.isfinite(values).all() or not np.isin(values, [0, 1]).all():
        raise ValueError("Demonstration mask must contain only binary labels 0 and 1")
    return values.astype(bool)
