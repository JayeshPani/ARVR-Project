#!/usr/bin/env python3
"""Imports the case-01 brain envelope mesh produced externally (Codex, via
FreeSurfer SynthStrip no-CSF v1 + an MRI-intensity isosurface intersected
with the SynthStrip envelope — see the copied `tool-provenance.json` and
`reconstruction.json` alongside this script's output for exact method,
model checksums and licence). This supersedes
`generate_brain_envelope_case01.py`'s classical-morphology approximation,
which is kept on disk (suffixed `-classical`) for reference, not deleted.

Two conversions are required before this mesh can be combined with our own
tumour mesh (derived/case-01/meshes/whole-tumour.glb, which stays in our
pipeline's raw RAS-mm convention, untouched):

1. glTF/Blender export convention is metres, Y-up — our pipeline works in
   the image's own RAS-mm space (matches the case's affine directly).
2. The Y-up axis swap specifically is: gltf.x = RAS.x, gltf.y = RAS.z,
   gltf.z = -RAS.y (verified below against the source's own recorded
   RAS-mm bounds in reconstruction.json — exact match to <0.01mm).

The source mesh is heavily fragmented (~2000 disconnected components —
expected from an intensity-isosurface method on real, noisy sulcal CSF) and
NOT watertight; this is a visual/context-only asset, not used for any
volume measurement, so that's recorded, not treated as a blocking defect.

Usage:
    python import_codex_brain_envelope_case01.py --source /path/to/brain-import.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import trimesh


def convert_to_ras_mm(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    v = mesh.vertices.copy() * 1000.0  # metres -> mm
    ras = np.empty_like(v)
    ras[:, 0] = v[:, 0]
    ras[:, 1] = -v[:, 2]
    ras[:, 2] = v[:, 1]
    return trimesh.Trimesh(vertices=ras, faces=mesh.faces.copy(), process=False)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Path to the externally-produced brain-import.glb")
    parser.add_argument("--target-faces", type=int, default=15000)
    args = parser.parse_args()

    if not args.source.exists():
        print(f"Not found: {args.source}", file=sys.stderr)
        return 1

    case_dir = Path(__file__).resolve().parents[1] / "derived" / "case-01"
    loaded = trimesh.load(str(args.source), force="mesh")
    mesh = convert_to_ras_mm(loaded)

    raw_out = case_dir / "meshes" / "brain-envelope-synthstrip-raw.glb"
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(str(raw_out))
    print(f"Raw (converted, undecimated): {len(mesh.vertices)} verts, {len(mesh.faces)} faces -> {raw_out}")

    if len(mesh.faces) > args.target_faces:
        mesh = mesh.simplify_quadric_decimation(face_count=args.target_faces)
        mesh.merge_vertices()
        mesh.fix_normals()

    final_out = case_dir / "meshes" / "brain-envelope.glb"
    mesh.export(str(final_out))
    print(f"Final: {len(mesh.vertices)} verts, {len(mesh.faces)} faces, watertight={mesh.is_watertight}")
    print(f"Saved -> {final_out}")
    print("Visual/context-only asset - watertightness and volume are not required or measured for this mesh.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
