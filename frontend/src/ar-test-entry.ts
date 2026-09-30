/**
 * AR preview of the real case-01 model (brain envelope + tumour contour),
 * anchored to MindAR's own official example target (bootstrap-test/card.mind
 * + card.png, from github.com/hiukim/mind-ar-js) — NOT yet the project's
 * own printed target, and NOT yet integrated into the real app's AR flow
 * (src/ar/ar-session.ts is still a stub; that's the Day 3 task: case
 * selection, scenario switching, and a purpose-made printed target inside
 * the main app). This is the fastest path to actually seeing the real
 * model in AR on a device today, reusing the harness already confirmed
 * working end-to-end (camera access, tracking) on this exact phone.
 *
 * Print or display card.png at a reasonably large size (e.g. fill a
 * monitor/tablet screen) and point the rear camera at it after pressing
 * Start AR.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";
import type { CaseManifest } from "./case/types";

type FeasibilityState = "idle" | "starting" | "searching" | "tracking" | "target-lost" | "error";

const CASE_ID = "case-01";

const stateEl = document.querySelector<HTMLSpanElement>("#state")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop-btn")!;
const container = document.querySelector<HTMLDivElement>("#container")!;

let mindarThree: InstanceType<typeof MindARThree> | null = null;

function setState(state: FeasibilityState): void {
  stateEl.textContent = state;
}

/** Same RAS->screen convention as the ordinary viewer (scene.ts): right
 * stays right, superior becomes up, anterior comes toward the viewer. */
function buildModelGroup(brain: THREE.Object3D, tumour: THREE.Object3D): THREE.Group {
  const inner = new THREE.Group();
  inner.add(brain, tumour);

  const bounds = new THREE.Box3().setFromObject(inner);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 0.6 / Math.max(size.x, size.y, size.z, 1e-6);

  const outer = new THREE.Group();
  outer.add(inner);
  inner.position.set(-centre.x, -centre.y, -centre.z);
  outer.scale.setScalar(scale);
  outer.rotation.x = -Math.PI / 2; // superior (+z, "up" after RAS) -> three.js +y
  outer.position.y = 0.05;
  return outer;
}

async function loadModel(): Promise<THREE.Group> {
  const manifest: CaseManifest = await fetch(`/cases/${CASE_ID}/manifest.json`).then((r) => r.json());
  const tumourRegion = manifest.regions.find((r) => r.available !== false);
  if (!tumourRegion) throw new Error("No available region in manifest");

  const loader = new GLTFLoader();
  const [tumourGltf, brainGltf] = await Promise.all([
    loader.loadAsync(`/cases/${CASE_ID}/${tumourRegion.meshPath}`),
    manifest.anatomicalContext
      ? loader.loadAsync(`/cases/${CASE_ID}/${manifest.anatomicalContext.meshPath}`)
      : Promise.resolve(null),
  ]);

  tumourGltf.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (!obj.geometry.hasAttribute("normal")) obj.geometry.computeVertexNormals();
      obj.material = new THREE.MeshStandardMaterial({ color: tumourRegion.color, roughness: 0.6, side: THREE.DoubleSide });
    }
  });

  const brainScene = brainGltf?.scene ?? new THREE.Group();
  brainScene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (!obj.geometry.hasAttribute("normal")) obj.geometry.computeVertexNormals();
      obj.material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
    }
  });

  return buildModelGroup(brainScene, tumourGltf.scene);
}

async function startAr(): Promise<void> {
  setState("starting");
  startBtn.disabled = true;

  try {
    mindarThree = new MindARThree({
      container,
      imageTargetSrc: "/targets/bootstrap-test/card.mind",
    });

    const { renderer, scene, camera } = mindarThree;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(1, 2, 1);
    scene.add(key);

    const anchor = mindarThree.addAnchor(0);
    const model = await loadModel();
    anchor.group.add(model);

    anchor.onTargetFound = () => setState("tracking");
    anchor.onTargetLost = () => setState("target-lost");

    await mindarThree.start();
    setState("searching");
    stopBtn.disabled = false;

    renderer.setAnimationLoop(() => {
      model.rotation.y += 0.008;
      renderer.render(scene, camera);
    });
  } catch (error) {
    console.error(error);
    setState("error");
    startBtn.disabled = false;
    alert(`AR failed to start: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function stopAr(): Promise<void> {
  if (mindarThree) {
    await mindarThree.stop();
    mindarThree.renderer.setAnimationLoop(null);
    mindarThree = null;
  }
  setState("idle");
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", startAr);
stopBtn.addEventListener("click", stopAr);
