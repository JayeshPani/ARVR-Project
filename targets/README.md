# targets/

The physical printed image target used for tabletop AR tracking (plan
section D). This is a textured image, not a QR code — a QR code can open
the webpage but proves nothing about spatial registration.

To add during Day 1/3:

- `target-source.png` (or similar) — the high-contrast, richly-textured
  image to print, at print resolution.
- `target-dimensions.md` — the printed physical size (width x height in
  mm) that the AR code must be told about, since MindAR scales its anchor
  to the target's real-world size.
- A PDF version sized for A4/Letter printing, for the submission package.

The compiled `.mind` tracking file generated from this image goes in
`frontend/public/targets/`, not here — this folder holds the
human-facing source/print assets.
