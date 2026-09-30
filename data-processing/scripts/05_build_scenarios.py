#!/usr/bin/env python3
"""Five states per scenario; masks retained for audit, empty residual has no mesh."""
import argparse
import importlib.util
import json
from pathlib import Path
import nibabel as nib
from common.io import validate_alignment, save_as_nifti
from common.scenarios import EXPLANATIONS, scenario_masks
from common.volumes import compute_region_volume_ml

spec = importlib.util.spec_from_file_location('meshes', Path(__file__).with_name('03_reconstruct_meshes.py'))
meshes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(meshes)


def build(case_dir, out):
    image = nib.load(case_dir / 't1.nii.gz')
    mask = validate_alignment(image, nib.load(case_dir / 'mask-whole-tumour-demo.nii.gz'))
    if out.resolve() != (case_dir / 'scenarios').resolve():
        raise ValueError('Output must be <derived case>/scenarios')
    out.mkdir(parents=True, exist_ok=True)
    scenarios = []
    for scenario, explanation in EXPLANATIONS.items():
        variants = {'low': 2., 'medium': 4., 'high': 6.} if scenario == 'illustrative-expansion' else {'default': 4.}
        frames_by_variant = {}
        for variant, maximum in variants.items():
            frames = []
            for step, mask_state in enumerate(scenario_masks(mask, image.affine, scenario, maximum)):
                folder = out / scenario / variant
                folder.mkdir(parents=True, exist_ok=True)
                save_as_nifti(mask_state.astype('uint8'), image.affine, folder / f'{step}.nii.gz')
                paths = {}
                if mask_state.any():
                    destination = folder / f'{step}.glb'
                    meshes.mask_to_world_mesh(mask_state, image.affine).export(str(destination))
                    paths['whole-tumour'] = destination.relative_to(case_dir).as_posix()
                frames.append({'step': step, 'meshPaths': paths,
                    'volumesMl': {'whole-tumour': compute_region_volume_ml(mask_state, image.affine)}})
            frames_by_variant[variant] = frames
        parameters = {'maximumOffsetMm': 4., 'steps': 5, 'timeUnit': 'simulation step',
            'resectionAxis': 'source voxel axis 0', 'localRegion': 'upper half of baseline voxel-axis-0 extent'}
        if scenario == 'illustrative-expansion':
            parameters.update({'sensitivityLabel': 'parameter sensitivity', 'maximumOffsetsMm': variants,
                'sensitivityFrames': frames_by_variant})
        scenarios.append({'id': scenario, 'method': scenario.replace('-', ' ').capitalize(),
            'explanation': explanation, 'parameters': parameters,
            'frames': frames_by_variant.get('medium', frames_by_variant.get('default'))})
    (out / 'scenarios.json').write_text(json.dumps(scenarios, indent=2, allow_nan=False))
    print(f'Generated 35 audited mask states in {out}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    build(args.case_dir, args.out)
