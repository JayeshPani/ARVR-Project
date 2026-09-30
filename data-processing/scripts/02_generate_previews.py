#!/usr/bin/env python3
"""Day 2 task (plan section B.5), started early on Day 1 to visually locate
the lesion in the RegLib_C01_1 fallback case (needed before a demonstration
contour can be drawn at all).

Generates axial, coronal and sagittal preview PNGs (optionally with a mask
overlay, once one exists) from a converted NIfTI volume.

Usage:
    python 02_generate_previews.py --nifti derived/case-01/t1.nii.gz \\
        --out derived/case-01/previews --overview-grid
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from skimage.io import imsave
from skimage.transform import resize
import json
from common.io import validate_alignment, validate_geometry

Plane = str  # "axial" | "coronal" | "sagittal"


def normalise_to_uint8(slice_2d: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    clipped = np.clip(slice_2d, vmin, vmax)
    scaled = (clipped - vmin) / max(vmax - vmin, 1e-6)
    return (scaled * 255).astype(np.uint8)


def extract_slice(data: np.ndarray, plane: Plane, index: int) -> np.ndarray:
    if plane == "axial":
        s = data[:, :, index]
    elif plane == "coronal":
        s = data[:, index, :]
    elif plane == "sagittal":
        s = data[index, :, :]
    else:
        raise ValueError(f"Unknown plane {plane}")
    return np.rot90(s)


def save_overview_grid(data: np.ndarray, plane: Plane, out_path: Path, n: int = 16, spacing=(1, 1, 1)) -> None:
    """A single contact-sheet PNG of n evenly spaced slices, for quickly
    eyeballing an entire volume without opening n separate files."""
    size = data.shape[{"sagittal": 0, "coronal": 1, "axial": 2}[plane]]
    indices = np.linspace(int(size * 0.15), int(size * 0.85), n, dtype=int)
    vmin, vmax = np.percentile(data, [1, 99])

    tiles = [physical_pixels(normalise_to_uint8(extract_slice(data, plane, i), vmin, vmax), plane, spacing) for i in indices]
    tile_h, tile_w = tiles[0].shape
    cols = 4
    rows = int(np.ceil(n / cols))
    grid = np.zeros((rows * tile_h, cols * tile_w), dtype=np.uint8)

    for i, (tile, idx) in enumerate(zip(tiles, indices)):
        r, c = divmod(i, cols)
        grid[r * tile_h : (r + 1) * tile_h, c * tile_w : (c + 1) * tile_w] = tile

    out_path.parent.mkdir(parents=True, exist_ok=True)
    imsave(out_path, grid)
    print(f"  {plane}: contact sheet of {n} slices (indices {indices.tolist()}) -> {out_path}")


def save_overlay_at_centroid(data: np.ndarray, mask: np.ndarray, plane: Plane, out_path: Path, spacing=(1, 1, 1)) -> int:
    """One representative slice through the mask's own centroid on that
    axis, with the mask outlined in red — this is the manifest's
    per-plane MRI preview (plan section C), and doubles as the
    'Alignment' acceptance-test check (image and mask overlay agree)."""
    axis = {"sagittal": 0, "coronal": 1, "axial": 2}[plane]
    mask_indices = np.where(mask.any(axis=tuple(a for a in range(3) if a != axis)))[0]
    if len(mask_indices) == 0:
        raise ValueError(f"Mask is empty along the {plane} axis — nothing to preview")
    index = int(np.round(mask_indices.mean()))

    vmin, vmax = np.percentile(data, [1, 99])
    base = normalise_to_uint8(extract_slice(data, plane, index), vmin, vmax)
    mask_slice = extract_slice(mask.astype(np.uint8), plane, index).astype(bool)

    rgb = np.stack([base, base, base], axis=-1)
    rgb[mask_slice, 0] = 255
    rgb[mask_slice, 1] = (rgb[mask_slice, 1] * 0.3).astype(np.uint8)
    rgb[mask_slice, 2] = (rgb[mask_slice, 2] * 0.3).astype(np.uint8)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    imsave(out_path.with_name(f"{plane}.png"), physical_pixels(base, plane, spacing))
    imsave(out_path, physical_pixels(rgb, plane, spacing))
    print(f"  {plane}: overlay at index {index} -> {out_path}")
    return index


def physical_pixels(pixels, plane, spacing):
    axes = {"axial": (1, 0), "coronal": (2, 0), "sagittal": (2, 1)}[plane]
    size = tuple(round(pixels.shape[i] * spacing[a] / min(spacing)) for i, a in enumerate(axes))
    return resize(pixels, size, order=0, preserve_range=True, anti_aliasing=False).astype(np.uint8)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nifti", type=Path, required=True)
    parser.add_argument("--mask", type=Path, help="Optional mask NIfTI to overlay (same voxel grid as --nifti)")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--overview-grid", action="store_true", help="Also save one contact-sheet PNG per plane")
    args = parser.parse_args()

    if not args.nifti.exists():
        print(f"Not found: {args.nifti}", file=sys.stderr)
        return 1

    img = nib.load(str(args.nifti))
    validate_geometry(img)
    data = np.asarray(img.dataobj)
    spacing = np.linalg.norm(img.affine[:3, :3], axis=0)

    if args.overview_grid:
        for plane in ("axial", "coronal", "sagittal"):
            save_overview_grid(data, plane, args.out / f"{plane}-overview.png", spacing=spacing)

    if args.mask:
        if not args.mask.exists():
            print(f"Not found: {args.mask}", file=sys.stderr)
            return 1
        mask_img = nib.load(str(args.mask))
        mask = validate_alignment(img, mask_img)
        if mask.shape != data.shape:
            print(f"Mask shape {mask.shape} != image shape {data.shape}", file=sys.stderr)
            return 1
        metadata = []
        for plane in ("axial", "coronal", "sagittal"):
            index = save_overlay_at_centroid(data, mask, plane, args.out / f"{plane}-overlay.png", spacing)
            metadata.append({"plane": plane, "slicePosition": index, "imagePath": f"previews/{plane}.png", "overlayPath": f"previews/{plane}-overlay.png"})
        (args.out / "previews.json").write_text(json.dumps(metadata, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
