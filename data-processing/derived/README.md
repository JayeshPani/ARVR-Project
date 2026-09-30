# derived/

Intermediate pipeline outputs (previews, meshes, computed volumes, scenario
frames) land here, one subfolder per case. Gitignored — regenerate by
re-running the scripts in `data-processing/scripts/`, in order, against
`data-processing/raw/<case-id>/`.

The final step (`06_export_case_package.py`) copies the subset of this
that the frontend actually needs into `frontend/public/cases/<case-id>/`.
