# public/cases/

Generated case packages live here, one folder per case ID, e.g.:

```
public/cases/case-01/manifest.json
public/cases/case-01/meshes/whole-tumour.glb
public/cases/case-01/previews/axial.png
public/cases/case-01/scenarios/resection/step-2.glb
```

Gitignored (except this file) — produced by
`data-processing/scripts/06_export_case_package.py`, not written by hand.
The frontend's default case ID (see `src/main.ts`) is `case-01`.
