# raw/

Place the untouched source case here, one subfolder per case, e.g.:

```
raw/case-01/t1ce.nii.gz
raw/case-01/flair.nii.gz
raw/case-01/seg.nii.gz
```

Gitignored — never commit imaging data here, even public demonstration
data, to keep the repository small and to avoid accidentally publishing
something with unclear redistribution terms. The manifest's provenance
block (see `case-schema/case-manifest.schema.json`) is what travels with
the published case, not this folder.
