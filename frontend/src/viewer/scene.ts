import { manipulate } from "../gestures/transforms";
import { clampZoom, type GestureFrame } from "../gestures/engine";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CaseManifest } from "../case/types";
import { anatomicalClipPlane, applyAnatomyMaterials, RAS_TO_VIEWER, VIEW_DIRECTIONS, type AnatomicalView, type CutPlane } from "./anatomy";

export interface ViewerSettings {
  brainVisible: boolean;
  brainOpacity: number;
  autoRotate: boolean;
  cutEnabled: boolean;
  cutPlane: CutPlane;
  cutPercent: number;
  cutReverse: boolean;
  cutTumour: boolean;
  regionVisibility: Record<string, boolean>;
}
export function defaultViewerSettings(): ViewerSettings {
  return { brainVisible: true, brainOpacity: 0.3, autoRotate: false, cutEnabled: false,
    cutPlane: "sagittal", cutPercent: 50, cutReverse: false, cutTumour: false, regionVisibility: {} };
}
export interface SurfaceSelection { kind: "brain" | "region"; regionId?: string; rasMm: [number, number, number] }

export class CaseSceneViewer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.001, 100);
  readonly renderer: THREE.WebGLRenderer;
  readonly clippingPlane = new THREE.Plane();
  private readonly container: HTMLElement;
  private readonly controls: OrbitControls;
  private readonly manipulation = new THREE.Group();
  private readonly root = new THREE.Group();
  private gestureEnabled = false;
  private initialDistance = 1;
  private zoomStart = 1;
  private readonly regions = new Map<string, THREE.Object3D>();
  private readonly resizeObserver: ResizeObserver;
  private readonly sourceBounds = new THREE.Box3();
  private readonly baselineRegionBounds = new THREE.Box3();
  private readonly wholeBounds = new THREE.Box3();
  private context: THREE.Object3D | null = null;
  private settings = defaultViewerSettings();
  private disposed = false;
  private generation = 0;
  private animationHandle: number | null = null;
  private down: { x: number; y: number } | null = null;
  private pointerCount = 0;
  private multiTouch = false;
  onSelect?: (selection: SurfaceSelection | null) => void;
  readonly warnings: string[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene.background = new THREE.Color(0x141c29);
    this.root.name = "Anatomy — source RAS millimetres";
    this.scene.add(this.manipulation);
    this.manipulation.add(this.root);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.domElement.setAttribute("aria-label", "Interactive brain model. Drag to orbit, pinch or scroll to zoom. View buttons are available below.");
    this.container.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 8;
    this.controls.autoRotateSpeed = 1;
    const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(2, 3, 4);
    const fill = new THREE.DirectionalLight(0xbcd9ff, 0.8); fill.position.set(-3, 1, -2);
    this.scene.add(key, fill, new THREE.HemisphereLight(0xffffff, 0x344055, 0.9));
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.addEventListener("pointercancel", this.pointerCancel);
    this.handleResize();
  }

  async loadCase(manifest: CaseManifest): Promise<void> {
    await this.loadMeshes(manifest, Object.fromEntries(manifest.regions.filter(r => r.available !== false).map(r => [r.id, r.meshPath])));
    if (this.disposed) return;
    this.baselineRegionBounds.copy(new THREE.Box3().setFromObject(this.root));
    if (manifest.anatomicalContext) {
      try {
        const gltf = await new GLTFLoader().loadAsync(`/cases/${manifest.caseId}/${manifest.anatomicalContext.meshPath}`);
        if (this.disposed) { disposeObject3D(gltf.scene); return; }
        this.context = gltf.scene;
        this.context.name = "Brain context";
        this.prepareMesh(this.context, "#d6aba0", "brain");
        this.root.add(this.context);
      } catch {
        this.warnings.push("Brain context could not be loaded. Tumour inspection remains available.");
      }
    }
    if (this.disposed) return;
    this.sourceBounds.copy(new THREE.Box3().setFromObject(this.root));
    if (this.sourceBounds.isEmpty()) throw new Error("No anatomy mesh was available.");
    this.root.matrixAutoUpdate = false;
    const values = manifest.geometry.displayTransform.flat();
    this.root.matrix.fromArray(values).transpose(); // JSON rows -> Three column-major.
    this.root.updateMatrixWorld(true);
    const displayed = new THREE.Box3().setFromObject(this.root);
    const centre = displayed.getCenter(new THREE.Vector3());
    const scale = 1.7 / Math.max(...displayed.getSize(new THREE.Vector3()).toArray());
    this.root.matrix.premultiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
    this.root.matrix.premultiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    this.root.matrix.premultiply(RAS_TO_VIEWER);
    this.root.updateMatrixWorld(true);
    this.wholeBounds.copy(new THREE.Box3().setFromObject(this.root));
    this.applySettings(this.settings);
    this.resetCamera();
    this.initialDistance = this.camera.position.distanceTo(this.controls.target);
    this.controls.maxDistance = Math.max(8, this.initialDistance / 0.35);
  }

  /** Commit geometry only after every requested mesh loads. Stale loads are disposed. */
  async loadMeshes(manifest: CaseManifest, paths: Record<string, string>): Promise<void> {
    const generation = ++this.generation;
    const loaded = new Map<string, THREE.Object3D>();
    try {
      for (const [id, path] of Object.entries(paths)) {
        const gltf = await new GLTFLoader().loadAsync(`/cases/${manifest.caseId}/${path}`);
        loaded.set(id, gltf.scene);
        if (this.disposed || generation !== this.generation) { loaded.forEach(disposeObject3D); return; }
        this.prepareMesh(gltf.scene, manifest.regions.find(r => r.id === id)?.color ?? "#ed667d", "region", id);
      }
      if (this.disposed || generation !== this.generation) { loaded.forEach(disposeObject3D); return; }
      this.regions.forEach(mesh => { this.root.remove(mesh); disposeObject3D(mesh); });
      this.regions.clear();
      loaded.forEach((mesh, id) => { this.regions.set(id, mesh); this.root.add(mesh); });
      this.applySettings(this.settings);
      this.onSelect?.(null);
    } catch (error) { loaded.forEach(disposeObject3D); throw error; }
  }

  private prepareMesh(object: THREE.Object3D, color: string, kind: "brain" | "region", regionId?: string): void {
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!child.geometry.hasAttribute("normal")) child.geometry.computeVertexNormals();
      disposeMaterials(child.material);
      child.material = new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide });
      child.userData = { ...child.userData, kind, regionId };
    });
  }

  applySettings(settings: ViewerSettings): void {
    this.settings = { ...settings, regionVisibility: { ...settings.regionVisibility } };
    this.controls.autoRotate = settings.autoRotate && !this.gestureEnabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.refreshTransform();
    const brainPlanes = settings.cutEnabled ? [this.clippingPlane] : [];
    const regionPlanes = settings.cutEnabled && settings.cutTumour ? [this.clippingPlane] : [];
    if (this.context) applyAnatomyMaterials(this.context, { opacity: settings.brainOpacity, visible: settings.brainVisible, planes: brainPlanes });
    this.regions.forEach((object, id) => {
      applyAnatomyMaterials(object, { opacity: 1, visible: settings.regionVisibility[id] !== false, planes: regionPlanes });
    });
  }

  get hasBrain(): boolean { return this.context !== null; }
  get hasRegions(): boolean { return this.regions.size > 0; }

  setView(view: AnatomicalView): void {
    this.manipulation.quaternion.identity(); this.refreshTransform();
    const target = this.controls.target.clone();
    const distance = Math.max(this.camera.position.distanceTo(target), 0.3);
    this.camera.up.set(0, 1, 0);
    if (view === "superior") this.camera.up.set(0, 0, -1);
    this.camera.position.copy(target).add(new THREE.Vector3(...VIEW_DIRECTIONS[view]).normalize().multiplyScalar(distance));
    this.camera.lookAt(target);
    this.controls.update();
  }

  resetCamera(): void { this.resetManipulation(); }

  resetManipulation(): void {
    this.manipulation.position.set(0,0,0); this.manipulation.quaternion.identity();
    this.refreshTransform(); this.frameBounds(this.wholeBounds); this.setView("oblique");
  }
  get handControlsEnabled(): boolean { return this.gestureEnabled; }
  setGestureEnabled(enabled: boolean): void {
    this.gestureEnabled=enabled;
    this.controls.enableDamping=!enabled;this.controls.update();
    this.applySettings(this.settings);
  }
  applyGesture(frame: GestureFrame): void {
    if(frame.mode==="zoom") {
      const distance=this.camera.position.distanceTo(this.controls.target);
      if(frame.started) this.zoomStart=this.initialDistance/distance;
      else this.zoom((this.initialDistance/clampZoom(this.zoomStart*frame.ratio))/distance);
    } else { manipulate(this.manipulation,this.camera,frame); this.refreshTransform(); }
  }
  private refreshTransform(): void {
    this.root.updateWorldMatrix(true,true);
    const s=this.settings;
    if(!this.sourceBounds.isEmpty()) {
      this.clippingPlane.copy(anatomicalClipPlane(this.sourceBounds,this.root.matrixWorld,s.cutPlane,s.cutPercent,s.cutReverse));
      this.wholeBounds.copy(this.sourceBounds).applyMatrix4(this.root.matrixWorld);
    }
  }

  focusTumour(): boolean {
    const bounds = new THREE.Box3();
    this.root.updateMatrixWorld(true);
    this.regions.forEach(object => bounds.union(new THREE.Box3().setFromObject(object)));
    if (bounds.isEmpty()) return false;
    this.frameBounds(bounds);
    return true;
  }

  zoom(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.controls.update();
  }

  private frameBounds(bounds: THREE.Box3): void {
    if (bounds.isEmpty()) return;
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 0.001) direction.set(1, 0.65, -1.4);
    const centre = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const distance = THREE.MathUtils.clamp(radius / Math.sin(Math.min(vertical, horizontal)) * 1.1, 0.2, 8);
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).add(direction.normalize().multiplyScalar(distance));
    this.controls.update();
  }

  start(): void {
    if (this.animationHandle !== null || this.disposed) return;
    const tick = () => {
      this.controls.update(); this.renderer.render(this.scene, this.camera);
      this.animationHandle = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Pauses the render loop without disposing anything - resumable via start(). */
  stop(): void {
    if (this.animationHandle !== null) { cancelAnimationFrame(this.animationHandle); this.animationHandle = null; }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++;
    if (this.animationHandle !== null) cancelAnimationFrame(this.animationHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.pointerCancel);
    this.regions.forEach(disposeObject3D); this.regions.clear();
    if (this.context) { disposeObject3D(this.context); this.context = null; }
    this.scene.clear();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
    this.onSelect = undefined;
  }

  private handleResize(): void {
    this.camera.aspect = Math.max(this.container.clientWidth, 1) / Math.max(this.container.clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }
  private pointerDown = (event: PointerEvent): void => {
    this.pointerCount++;
    if (this.pointerCount > 1) this.multiTouch = true;
    if (event.button === 0) this.down = { x: event.clientX, y: event.clientY };
  };
  private pointerCancel = (): void => { this.pointerCount = 0; this.down = null; this.multiTouch = false; };
  private pointerUp = (event: PointerEvent): void => {
    this.pointerCount = Math.max(0, this.pointerCount - 1);
    const down = this.down; this.down = null;
    if (this.multiTouch) { if (this.pointerCount === 0) this.multiTouch = false; return; }
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cursor = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(cursor, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.root.traverseVisible(obj => { if (obj instanceof THREE.Mesh) meshes.push(obj); });
    const hits = ray.intersectObjects(meshes, false).filter(hit => {
      const material = (hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
      return material.opacity > 0 && (!material.clippingPlanes?.length || this.clippingPlane.distanceToPoint(hit.point) >= 0);
    });
    // Through a translucent shell, prefer the visible tumour under the pointer.
    const hit = this.context?.visible && this.settings.brainOpacity >= 1 ? hits[0] : hits.find(h => h.object.userData.kind === "region") ?? hits[0];
    if (!hit) { this.onSelect?.(null); return; }
    const ras = this.root.worldToLocal(hit.point.clone());
    this.onSelect?.({ kind: hit.object.userData.kind, regionId: hit.object.userData.regionId, rasMm: ras.toArray() as [number, number, number] });
  };
}

function disposeMaterials(input: THREE.Material | THREE.Material[]): void {
  for (const material of Array.isArray(input) ? input : [input]) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
    material.dispose();
  }
}
function disposeObject3D(object: THREE.Object3D): void {
  object.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); disposeMaterials(child.material); } });
}
