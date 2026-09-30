"""Provenance record-keeping (plan section A).

Every case package must record dataset name/version, source URL, case
identifier, licence, segmentation origin and checksums — this module builds
that record; it does not decide whether redistribution is permitted, which
must be checked against the dataset's actual licence terms by a human.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class ProvenanceRecord:
    dataset_name: str
    dataset_version: str
    source_url: str
    source_case_id: str
    licence: str
    mask_origin: str
    redistributable: bool
    checksums: dict[str, str] = field(default_factory=dict)

    def to_manifest_dict(self) -> dict:
        return {
            "datasetName": self.dataset_name,
            "datasetVersion": self.dataset_version,
            "sourceUrl": self.source_url,
            "sourceCaseId": self.source_case_id,
            "licence": self.licence,
            "maskOrigin": self.mask_origin,
            "redistributable": self.redistributable,
            "checksums": self.checksums,
        }


def sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_provenance_json(record: ProvenanceRecord, out_path: Path) -> None:
    out_path.write_text(json.dumps(asdict(record), indent=2))
