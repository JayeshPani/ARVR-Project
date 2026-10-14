# Browser markerless AR — implementation and acceptance

## Stability update — 2026-10-11

- Placement and visibility after tracking loss wait for at least six fresh camera
  samples and 500 ms of continuous good tracking in the same map. Bad/stale
  tracking still hides the model immediately; render ticks do not count as samples.
- Camera-relative translation and rotation receive light adaptive smoothing once
  per camera sample. The filter responds faster during deliberate phone movement.
  This introduces a small visual lag; it does not eliminate SLAM drift.
- Invalid transforms or abrupt translation/rotation jumps hide the model and
  require explicit placement again. The jump allowance is capped after tracking
  gaps so a map correction cannot silently teleport the displayed model.
- Each placement locks manipulation. AR renders at device pixel ratio 1 to reduce
  GPU work while keeping the original full-resolution anatomy assets.
- Validation: 39 frontend tests and production build pass, including synthetic
  jitter reduction, movement at 15/30/60 FPS, discontinuity rejection and recovery
  gating. Real phone stability, lag, frame rate and lighting conditions still need
  device validation. No physical-device improvement measurement is claimed.

Implemented 2026-10-05. Default **Enter AR** now uses Zappar WorldTracker and a CustomAnchor. The old MindAR implementation and feasibility page remain in the repository, but are not the main entry path.

## Try it

1. From `frontend`, run `npm install` and `npm run dev -- --host 0.0.0.0`.
2. On an iPhone, open the HTTPS LAN address Vite prints in Safari. Accept the local development certificate as needed. HTTP on a LAN address cannot access the camera; desktop localhost is a special exception.
3. Open Explore or Scenarios, wait for the full-resolution brain, and select **Enter AR**.
4. Select **Enable camera & motion** and grant permissions. Slowly move the phone across a well-lit, textured area to initialize tracking.
5. When enabled, select **Place brain ahead**. Placement uses a fixed camera offset (approximately 1.5 m ahead), not a measured surface hit test. This is not physical measurement or table/floor snapping.
6. The model starts locked. Walk around it without manipulating it. Select **Unlock model**, then **Enable hand controls** to rotate, move and zoom. Lock it again when finished.
7. **Brain − / Brain +** adjust brain opacity; **Cut** cycles none/sagittal/coronal/axial. The tumour is not clipped. Existing floating controls support pointing/dwell when hands are enabled and the model is unlocked.
8. **Reposition ahead** deliberately replaces the anchor. **Reset position** restores the model's pose/settings relative to its current anchor; it does not rescan or re-anchor. **Exit AR** restores the viewer.

## Behavior and implementation

- Pinned `@zappar/zappar` 4.4.0 / CV 3.14.1. The low-level SDK integrates with existing Three.js 0.151.3, avoiding an incompatible upgrade required by the latest Three.js wrapper.
- SDK owns the rear camera and motion sensing. MediaPipe consumes SDK RGB frames and never opens a concurrent second camera. Native permission preflight briefly opens and closes a camera before starting the tracking stream.
- Vite emits local worker and WASM assets. The AR module loads on demand; the ordinary viewer does not wait for SLAM. Development dependency exclusions retain worker URL handling and CommonJS interop.
- Placement sets a custom anchor only on explicit user action. Rendering uses current SDK anchor poses and projection, with no smoothing of the camera pose that could introduce lag against the camera image.
- Brain and tumour retain a shared manipulation parent. The original full-resolution brain is retained; rendering pixel ratio is capped at 1.5 to limit fill cost. Measurements are unchanged.
- SDK automatic map reset is disabled. Limited quality, paused anchors, hidden pages or frames older than 250 ms hide the model and clear hand activation. A recovered anchor restores the same placement; a stopped anchor or changed world ID requires explicit placement again.
- Opacity and clipping are presentation controls. Clipping planes follow the transformed MRI anatomy.
- Camera and tracking resources are disposed on exit/failure; late initialization is ignored. The SDK's shared module/worker infrastructure may remain cached for subsequent sessions, but the pipeline and camera source are destroyed. No frame recording is enabled by this application.

## Verified locally

- TypeScript and production build passed.
- **27/27** frontend unit tests passed, including existing gesture/geometry tests and new stale-pose, map-reset and placement gates.
- Production and development browser checks: denial message; return to viewer; repeated entry/exit; stopped camera tracks; hand tracker initialization.
- Actual SDK pipeline processed synthetic camera frames, and MediaPipe consumed SDK RGB frames.
- Injected anchor quality/pose exercised placement visibility, tracking loss/recovery and brain cut controls. This is **not** a successful real-world SLAM test.
- Blocked AR JavaScript module returned a startup error without trapping the viewer. A camera permission grant arriving after exit had its tracks stopped.
- Scripts: `frontend/tests/browser/hand-ar.js` (production preview port 4173), `world-ar-runtime.js` (Vite port 4175), `world-ar-failures.js` (preview port 4174). They use the existing Playwright CLI `run-code` pattern.

## Still needs real-device acceptance

Test iPhone Safari and Android Chrome with real camera/motion data: initialization, walk-around stability, moderate shaking, camera occlusion, leaving/re-entering the placement area, portrait/landscape, both-hand manipulation, clipping alignment and five minutes of continuous use. Record rendering FPS and gesture latency with the full-resolution brain. No phone FPS, latency or stability result is claimed yet.

Strong shaking, blur, blank walls, darkness and occlusion can make tracking unreliable. Perfectly fixed placement under arbitrary motion cannot be guaranteed. The app hides unreliable content instead of presenting a stale camera-relative pose as a world anchor. This implementation does not persist anchors between sessions or provide physical occlusion.

## Hosting

Zappar documents local-network testing exceptions to domain registration, and separate licensing requirements for public self-hosting: https://docs.zap.works/universal-ar/general/licensing/ . No licence purchase, domain registration or deployment was performed. Dataset redistribution permission also remains unresolved in the existing provenance documents.

SDK API reference used: installed `@zappar/zappar/README.md`, World Tracking / Custom Anchors / Anchor Status, and https://docs.zap.works/universal-ar/javascript/ .

`npm audit` reports four existing MindAR/native-build dependency findings (tar/canvas/node-pre-gyp). No force-upgrade or downgrade was applied as part of the markerless integration.

## Startup fixes — 2026-10-10

Replaced SDK cached permission polling with fresh native permission results. Both iOS orientation and motion permission calls now run directly in the button click before awaiting either result. Native API rejection no longer leaves startup waiting indefinitely, and denial followed by retry uses the new decision. Exit aborts pending startup and stops a late camera permission stream.

All runtime failures now use the existing fatal-error callback to return to the ordinary viewer, while direct session consumers still receive a visible error status. After eight seconds without orientation/motion events, AR explains that sensor data is missing instead of indefinitely asking the user to scan. Added Restart tracking for initialization recovery without resetting permissions.

Validation: 32 frontend unit tests and production build passed; browser lifecycle checks passed with synthetic camera streams. SDK frames and shared MediaPipe frames were verified. Native iOS permission APIs are simulated in the regression tests; real Safari/Brave device tracking remains unverified. Use the HTTPS LAN URL from `npm run dev -- --host 0.0.0.0` on a phone on the same network. A desktop webcam without motion sensors does not establish this SDK's intended mobile tracking conditions.
