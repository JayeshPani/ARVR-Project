#!/usr/bin/env python3
"""Consolidate independently measured binary regions; never sum nested volumes."""
import argparse
import json
from pathlib import Path
import nibabel as nib
from common.io import validate_alignment
from common.volumes import compute_region_volume_ml


def compute_volumes(case_dir):
    image = nib.load(case_dir / 't1.nii.gz')
    paths = sorted(case_dir.glob('mask-*.nii.gz'))
    if not paths:
        raise ValueError('No region masks found')
    regions = {}
    for path in paths:
        mask = validate_alignment(image, nib.load(path))
        region = path.name.removeprefix('mask-').removesuffix('.nii.gz').removesuffix('-demo')
        if region in regions:
            raise ValueError(f'Duplicate region: {region}')
        regions[region] = {'maskPath': path.name, 'voxelCount': int(mask.sum()),
                           'volumeMl': compute_region_volume_ml(mask, image.affine)}
    return {'units': 'mL', 'regions': regions, 'note': 'Independent region measurements; nested regions must not be summed.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case-dir', type=Path, required=True, help='Derived case directory')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = compute_volumes(args.case_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, allow_nan=False))
    print(args.out)
