import * as THREE from "three";
import { ButtonPressMachine, containerPointToNdc, type Rect } from "../gestures/buttons";
import type { Point } from "../gestures/engine";

export type ArButtonId = "opacity-down" | "opacity-up" | "cut" | "reset";

const LAYOUT: { id: ArButtonId; label: string }[] = [
  { id: "opacity-down", label: "Brain −" },
  { id: "opacity-up", label: "Brain +" },
  { id: "cut", label: "Cut" },
  { id: "reset", label: "Reset" },
];
const SIZE = 0.16, GAP = 0.06, ROW_Y = -0.36, ROW_Z = 0.02;
/** Leaning the strip toward the viewer keeps it readable when the phone looks
 * down at the print. Fixed tilt rather than billboarding: a hit rectangle that
 * stops moving is far easier to dwell on than one that always faces you. */
const TILT = THREE.MathUtils.degToRad(35);

function labelTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#142032";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#8290a0"; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 250);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 42px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** In-scene AR controls, driven by dwelling a pointing finger on a button.
 * Parented beside the manipulation group so gestures that move the model never
 * carry the controls along with it. */
export class ArButtons {
  readonly group = new THREE.Group();
  private readonly onPress: (id: ArButtonId) => void;
  private readonly machine = new ButtonPressMachine();
  private readonly raycaster = new THREE.Raycaster();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly bars: THREE.Mesh[] = [];
  private rects: { container: Rect; canvas: Rect } | null = null;

  constructor(onPress: (id: ArButtonId) => void) {
    this.onPress = onPress;
    const total = LAYOUT.length * SIZE + (LAYOUT.length - 1) * GAP;
    LAYOUT.forEach((entry, index) => {
      const x = -total / 2 + SIZE / 2 + index * (SIZE + GAP);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE, SIZE),
        new THREE.MeshBasicMaterial({ map: labelTexture(entry.label), transparent: true }),
      );
      mesh.position.set(x, 0, 0);
      mesh.userData.buttonId = entry.id;
      this.meshes.push(mesh);
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE, 0.022),
        new THREE.MeshBasicMaterial({ color: 0x7cffb2 }),
      );
      bar.position.set(x, -SIZE / 2 - 0.022, 0.001);
      bar.visible = false;
      this.bars.push(bar);
      this.group.add(mesh, bar);
    });
    this.group.position.set(0, ROW_Y, ROW_Z);
    this.group.rotation.x = TILT;
  }

  /** Layout only shifts on resize/orientation, and measuring it per frame
   * forces a layout on the tracking path. */
  invalidateLayout(): void { this.rects = null; }

  update(cursor: Point | undefined, idle: boolean, time: number, camera: THREE.Camera, container: HTMLElement, canvas: HTMLCanvasElement): void {
    let hit: string | null = null;
    if (cursor && idle) {
      if (!this.rects) {
        const c = container.getBoundingClientRect(), r = canvas.getBoundingClientRect();
        this.rects = {
          container: { left: c.left, top: c.top, width: c.width, height: c.height },
          canvas: { left: r.left, top: r.top, width: r.width, height: r.height },
        };
      }
      const ndc = containerPointToNdc(cursor, this.rects.container, this.rects.canvas);
      this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      // Only the buttons are candidates, so a press can never select anatomy.
      hit = (this.raycaster.intersectObjects(this.meshes, false)[0]?.object.userData.buttonId as string) ?? null;
    }
    const state = this.machine.update(hit, idle, time);
    this.meshes.forEach((mesh, index) => {
      const hovered = state.hovered === mesh.userData.buttonId;
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(hovered ? 0x9fd2ff : 0xffffff);
      const bar = this.bars[index]!;
      bar.visible = hovered && state.progress > 0;
      bar.scale.x = hovered ? Math.max(state.progress, 1e-3) : 1e-3;
    });
    if (state.fired) this.onPress(state.fired as ArButtonId);
  }

  cancel(): void { this.machine.cancel(); }

  dispose(): void {
    this.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const material = child.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    });
    this.group.clear();
  }
}
