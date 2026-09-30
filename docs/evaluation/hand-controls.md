# Hand controls implementation and validation — 2026-09-22

## Behavior

- Viewer and AR share one pure, timestamp-driven gesture interpreter.
- Open palm held 250 ms: horizontal sweep rotates; vertical sweep tilts.
- One thumb–index pinch held 350 ms: move on the camera-facing plane.
- Two pinches held 150 ms: separation controls zoom from the gesture baseline;
  magnification is clamped to 0.35–3× the initial fit. Two-hand zoom takes priority.
- Leaving zoom requires release before another gesture. Missing hands stop updates;
  gaps over 150 ms, ambiguous identities, and mouse/touch input reset activation.
- Pinch thresholds are 0.40 on / 0.55 off relative to palm size; input uses aspect
  correction, an 80 ms smoother, and a 0.002 normalized movement dead zone.
- Geometry remains in source MRI coordinates beneath a manipulation parent. Brain
  and tumour stay aligned. Cut planes follow the current world transform; scenario
  replacement preserves manipulation, and measurements remain mask-derived.
- Viewer and AR maintain separate poses. Anatomical view presets clear gesture
  rotation. Reset position restores pose and zoom; ordinary controls remain usable.

## Tracking and camera ownership

The shared worker imports local MediaPipe 0.10.35 with its **module WASM** loader.
All six shipped WASM/loader assets match the installed package byte-for-byte by
SHA256. The module factory is restored before CPU fallback because MediaPipe clears
its global factory after task creation, whereas dynamic imports are cached.

Detection uses VIDEO mode, two hands, confidence thresholds 0.6, input width at most
640 pixels, and one frame in flight. It targets 20 Hz and reduces to 10 Hz after
sustained inference latency above 100 ms or observed frame rate below 30 FPS.
Frames/results older than 150 ms are not applied. Initialization and stalled
inference have timeouts. Worker failure disables tracking without losing the viewer.

Camera acquisition is explicit and cancelable. Late permission grants after disable,
navigation, or AR exit are stopped. AR shares its existing stream with the worker.
MindAR 1.2.5's camera startup is adapted to cancellation; its otherwise unremovable
resize listener is captured during synchronous construction, guarded before tracking
initializes, and removed on stop. No dependency files are patched. Built-in MindAR
modals are disabled in favor of the application's status/exit controls.

## Verified automatically

- Production TypeScript/Vite build passes (existing large-bundle warning remains).
- 15 Node tests pass: anatomical transforms, clipping, gesture timing/hysteresis,
  priority, hand reorder/ambiguity, tracking gaps, zoom clamps, camera-relative
  movement under a rotated/scaled anchor, source-coordinate preservation, video
  mapping, and late camera permission cleanup.
- Real Chromium + real MediaPipe worker, with synthetic camera video: worker loads,
  pause/resume, permission denial, missing model, disable during camera startup,
  navigation during startup, camera shutdown, AR exit during startup, and 390 px
  layout checks pass. No uncaught page errors in the final lifecycle run.
- Browser geometry check uses the actual **679,926-triangle brain**: MRI coordinates,
  transformed cut plane, scenario-pose preservation, zoom limits, reset, and
  unchanged manifest measurements pass.
- Synthetic printed-marker video exercises actual MindAR: target tracking,
  disappearance, reacquisition, hand-worker startup on the same video, exactly one
  camera request, and camera stop on exit pass. This is not a physical-device AR test.

## Performance evidence and remaining gates

Desktop Chromium, 1280×900 viewport, full-resolution brain at 30% opacity,
640×480 blank synthetic video, five-second sample:

| Measurement | Observed |
| --- | --- |
| Animation-frame cadence | 60.0 FPS |
| Worker round-trip median | 13.7 ms |
| Worker round-trip p95 | 22.9 ms |
| Samples after dropping first three | 83 |

This measures synthetic-video inference and animation cadence, **not** real-hand
recognition, camera-to-display gesture latency, or phone GPU performance.

Pending: real desktop webcam and iPhone Safari; both hands; dim/bright lighting;
portrait/landscape; marker occlusion; five-minute endurance; no-jump transitions
with actual hands. Acceptance targets remain 30 FPS and <150 ms steady-state
real-hand response. Record device/browser, lighting, observed failures and timing
before marking these gates complete. No automatic switch to a simplified brain.

## Repeatable browser checks

`frontend/tests/browser/hand-*.js` are Playwright CLI `run-code` functions, not Node
unit tests. Run from `frontend/` with a production preview at localhost:4173 and a
plain-HTTP Vite server at localhost:4174 for the geometry module-import check.
Create `output/playwright/` for the screenshot. Open a Playwright browser first.
Then pass each function's file contents to `playwright-cli run-code`:

- `hand-browser.js`: permission/asset/lifecycle/mobile-layout checks.
- `hand-geometry.js`: actual viewer geometry and gesture transform checks.
- `hand-ar.js`: real MindAR using synthetic marker video.
- `hand-performance.js`: short synthetic-video timing sample.

These scripts substitute a canvas camera; they never request the user's webcam.
Use a fresh browser context when returning to physical-camera testing.
