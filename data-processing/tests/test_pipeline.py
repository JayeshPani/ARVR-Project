"""Geometry rejection, spacing fidelity, scenario invariants and package audit."""
import importlib.util
import json
import sys
from pathlib import Path
import nibabel as nib
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from common.io import validate_alignment
from common.scenarios import EXPLANATIONS, scenario_masks
from common.volumes import compute_region_volume_ml


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / name)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def image(values, affine=None, unit='mm'):
    result = nib.Nifti1Image(values.astype('uint8'), np.eye(4) if affine is None else affine)
    result.header.set_xyzt_units(unit)
    return result


def test_mismatched_affine_and_unknown_units_rejected():
    a = image(np.zeros((4, 4, 4)))
    shifted = np.eye(4)
    shifted[0, 3] = 1
    with pytest.raises(ValueError, match='affine mismatch'):
        validate_alignment(a, image(np.zeros(a.shape), shifted))
    with pytest.raises(ValueError, match='millimetres'):
        validate_alignment(a, image(np.zeros(a.shape), unit='unknown'))
    with pytest.raises(ValueError, match='binary'):
        validate_alignment(a, image(np.full(a.shape, 2)))


def test_preview_physical_proportions():
    preview = module('02_generate_previews.py')
    actual = preview.physical_pixels(np.zeros((112, 256), dtype='uint8'), 'coronal', (0.9375, 0.9375, 1.4))
    assert actual.shape == (167, 256)


@pytest.mark.parametrize('scenario', EXPLANATIONS)
def test_scenario_baseline_monotonicity_and_empty_resection(scenario):
    mask = np.zeros((32, 32, 32), dtype=bool)
    mask[10:22, 10:22, 10:22] = True
    frames = list(scenario_masks(mask, np.diag([1., 1., 2., 1.]), scenario))
    assert len(frames) == 5
    assert np.array_equal(mask, frames[0])
    for previous, current in zip(frames, frames[1:]):
        if scenario == 'illustrative-expansion':
            assert np.all(previous <= current)
        else:
            assert np.all(current <= previous)
    if scenario == 'resection':
        assert not frames[-1].any()


def test_real_generated_states_and_manifest():
    case = ROOT / 'derived/case-01'
    if not (case / 'scenarios/scenarios.json').exists():
        pytest.skip('Run the pipeline for real-case audit')
    manifest = module('06_export_case_package.py').build_manifest(case)
    baseline = np.asarray(nib.load(case / 'mask-whole-tumour-demo.nii.gz').dataobj).astype(bool)
    reference = nib.load(case / 't1.nii.gz')
    for scenario in manifest['scenarios']:
        variants = scenario['parameters'].get('sensitivityFrames', {'default': scenario['frames']})
        for variant, frames in variants.items():
            assert [f['step'] for f in frames] == list(range(5))
            for frame in frames:
                mask = validate_alignment(reference, nib.load(case / 'scenarios' / scenario['id'] / variant / f"{frame['step']}.nii.gz"))
                assert frame['volumesMl']['whole-tumour'] == pytest.approx(compute_region_volume_ml(mask, reference.affine))
                assert bool(frame['meshPaths']) == bool(mask.any())
                if frame['step'] == 0:
                    assert np.array_equal(mask, baseline)
                for path in frame['meshPaths'].values():
                    assert (case / path).is_file()


def test_missing_export_asset_fails_before_manifest_write(tmp_path):
    exporter = module('06_export_case_package.py')
    case = tmp_path / 'case-01'
    case.mkdir()
    # Isolate missing asset handling from the real input provenance check.
    exporter.build_manifest = lambda _: {'regions': [{'meshPath': 'missing.glb'}], 'mriPreviews': [], 'scenarios': []}
    with pytest.raises(ValueError, match='Missing'):
        exporter.export_package(case, tmp_path / 'out')
    assert not (tmp_path / 'out/manifest.json').exists()
