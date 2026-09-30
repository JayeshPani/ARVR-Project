#!/usr/bin/env python3
"""Export the validated case-01 demonstration package for LOCAL use.

No redistribution licence has been established. This script does not publish.
Run numbered scripts first. Every referenced asset must exist before writing.
"""
import argparse
import json
import shutil
import tempfile
from pathlib import Path
import nibabel as nib
import numpy as np
from jsonschema import validate
from common.io import validate_alignment
from common.provenance import sha256_of_file
from common.volumes import compute_region_volume_ml

ROOT = Path(__file__).resolve().parents[1]
CHECKSUM = '998cb522173839c78657f4bc0ea907cea09fd04e44601f17c82ea27927937b95'
ORIGIN = 'Programmatic threshold-based demonstration contour: programmatic, not hand-drawn, not expert, not ML. Not expert-validated or diagnostic.'


def build_manifest(case_dir):
    if case_dir.name != 'case-01':
        raise ValueError('Only case-01 provenance is configured; do not relabel another case')
    source = ROOT / 'raw/case-01/RegLib_C01_1.nrrd'
    if sha256_of_file(source) != CHECKSUM:
        raise ValueError('Source checksum mismatch')
    image = nib.load(case_dir / 't1.nii.gz')
    mask = validate_alignment(image, nib.load(case_dir / 'mask-whole-tumour-demo.nii.gz'))
    if not mask.any():
        raise ValueError('Baseline region is empty')
    volume = compute_region_volume_ml(mask, image.affine)
    envelope_glb = case_dir / 'meshes/brain-envelope-synthstrip-raw.glb'
    full_resolution = envelope_glb.is_file()
    if not full_resolution:
        envelope_glb = case_dir / 'meshes/brain-envelope.glb'
    quality = 'full-resolution' if full_resolution else 'decimated for display'
    has_envelope = envelope_glb.is_file()
    recorded = json.loads((case_dir / 'volumes.json').read_text())['regions']['whole-tumour']['volumeMl']
    if not np.isclose(volume, recorded, atol=1e-8, rtol=0):
        raise ValueError('Stale volume artifact; rerun step 04')
    previews = json.loads((case_dir / 'previews/previews.json').read_text())
    scenarios_path = case_dir / 'scenarios/scenarios.json'
    scenarios = json.loads(scenarios_path.read_text()) if scenarios_path.exists() else []
    for scenario in scenarios:
        variants = scenario['parameters'].get('sensitivityFrames', {'default': scenario['frames']})
        for variant, frames in variants.items():
            if [frame['step'] for frame in frames] != list(range(5)):
                raise ValueError('Scenario steps must be exactly 0 through 4')
            for frame in frames:
                state = nib.load(case_dir / 'scenarios' / scenario['id'] / variant / f"{frame['step']}.nii.gz")
                state_mask = validate_alignment(image, state)
                measured = compute_region_volume_ml(state_mask, image.affine)
                if not np.isclose(measured, frame['volumesMl']['whole-tumour'], atol=1e-8, rtol=0):
                    raise ValueError('Scenario volume does not match its mask')
                if bool(frame['meshPaths']) != bool(state_mask.any()):
                    raise ValueError('Nonempty mask requires a mesh; empty mask must omit it')
                if frame['step'] == 0 and not np.array_equal(state_mask, mask):
                    raise ValueError('Scenario baseline mismatch')
                if scenario['id'] in ['resection', 'localised-reduction', 'global-reduction'] and np.count_nonzero(np.logical_and(state_mask, np.logical_not(mask))) > 0:
                    raise ValueError('Reduction scenario contains voxels outside baseline')
    manifest = {
        'schemaVersion': '1.0.0', 'caseId': 'case-01', 'displayName': 'MRBrainTumor1 — demonstration contour',
        'provenance': {'datasetName': '3D Slicer SampleData — MRBrainTumor1', 'datasetVersion': 'SHA256/' + CHECKSUM,
            'sourceUrl': 'https://github.com/Slicer/SlicerTestingData/releases/download/SHA256/' + CHECKSUM,
            'sourceCaseId': source.name, 'licence': 'Redistribution permission unverified; local evaluation only.',
            'redistributable': False, 'maskOrigin': ORIGIN, 'checksums': {source.name: CHECKSUM}},
        'geometry': {'originalAffine': image.affine.tolist(), 'units': 'mm',
            'orientation': ''.join(nib.aff2axcodes(image.affine)), 'displayTransform': np.eye(4).tolist()},
        'regions': [{'id': 'whole-tumour', 'label': 'Demonstration tumour contour', 'meshPath': 'meshes/whole-tumour.glb',
            'color': '#ed667d', 'volumeMl': volume, 'isNested': False, 'available': True}],
        'mriPreviews': previews, 'scenarios': scenarios,
        'limitations': {'missingAnatomy': ['No expert annotation, enhancing-tumour or tumour-core labels.',
            'Preview slicePosition is a source voxel index; images retain source voxel-axis orientation.'] +
            ([] if has_envelope else ['No brain envelope; MRI previews supply source-image context.']),
            'annotationStatus': ORIGIN, 'simulationCaveats': ['Educational geometric illustrations only; not clinical predictions.'] +
            ([f'Brain envelope: FreeSurfer SynthStrip no-CSF v1 (MIT-licensed model) envelope intersected with an MRI intensity isosurface, {quality}; automated and unreviewed, not a validated pial reconstruction; surface materials/colour are artistic, not measured. For illustrative context only, not a tissue-volume measurement.'] if has_envelope else [])}}
    if has_envelope:
        manifest['anatomicalContext'] = {
            'meshPath': envelope_glb.relative_to(case_dir).as_posix(),
            'isPatientSpecific': True,
            'label': f'Same-case brain envelope (FreeSurfer SynthStrip no-CSF v1 + MRI isosurface, {quality}; automated, unreviewed) — illustrative context only',
        }
    validate(manifest, json.loads((ROOT.parent / 'case-schema/case-manifest.schema.json').read_text()))
    return manifest


def export_package(case_dir, out):
    manifest = build_manifest(case_dir)
    paths = {r['meshPath'] for r in manifest['regions']}
    if 'anatomicalContext' in manifest:
        paths.add(manifest['anatomicalContext']['meshPath'])
    for p in manifest['mriPreviews']:
        paths.update([p['imagePath'], p['overlayPath']])
    for scenario in manifest['scenarios']:
        for frame in scenario['frames']:
            paths.update(frame['meshPaths'].values())
        for frames in scenario['parameters'].get('sensitivityFrames', {}).values():
            for frame in frames:
                paths.update(frame['meshPaths'].values())
    for relative in paths:
        path = (case_dir / relative).resolve()
        if not path.is_relative_to(case_dir.resolve()) or not path.is_file():
            raise ValueError(f'Missing or unsafe required asset: {relative}')
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out.parent) as temp:
        stage = Path(temp)
        for relative in paths:
            destination = stage / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(case_dir / relative, destination)
            manifest['provenance']['checksums'][relative] = sha256_of_file(destination)
        (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2, allow_nan=False))
        # All validation/copying succeeds before replacing the generated package.
        out.mkdir(parents=True, exist_ok=True)
        shutil.copytree(stage, out, dirs_exist_ok=True)
    print(f'Local package: {out} ({len(paths)} assets)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    export_package(args.case_dir, args.out)
