import * as THREE from "three";

export type AnatomicalView = "oblique" | "anterior" | "posterior" | "left" | "right" | "superior";
export type CutPlane = "sagittal" | "coronal" | "axial";

// Right-handed rotation: RAS +X -> viewer +X, +Y -> -Z, +Z -> +Y.
export const RAS_TO_VIEWER = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
export const VIEW_DIRECTIONS: Record<AnatomicalView, [number, number, number]> = {
  oblique: [1, 0.65, -1.4], anterior: [0, 0, -1], posterior: [0, 0, 1],
  left: [-1, 0, 0], right: [1, 0, 0], superior: [0, 1, 0],
};
const RAS_NORMALS: Record<CutPlane, [number, number, number]> = {
  sagittal: [-1, 0, 0], coronal: [0, -1, 0], axial: [0, 0, -1],
};

export interface AnatomyMaterialSettings { opacity: number; visible: boolean; planes: THREE.Plane[] }

/** The material half of applying anatomy settings, shared by the ordinary
 * viewer and the AR session so transparency and clipping cannot drift apart.
 * Deliberately transform-free: each caller computes its own planes, because
 * the viewer orients through RAS_TO_VIEWER while the AR graph rolls its own. */
export function applyAnatomyMaterials(root: THREE.Object3D, settings: AnatomyMaterialSettings): void {
  root.visible = settings.visible && settings.opacity > 0;
  const transparent = settings.opacity < 1;
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.MeshStandardMaterial;
    if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
    material.opacity = THREE.MathUtils.clamp(settings.opacity, 0, 1);
    material.depthWrite = !transparent;
    material.clippingPlanes = settings.planes;
  });
}

/** A source-space plane transformed with the same matrix as the anatomy.
 * Percent 0 retains the entire bounding box; 100 removes it. */
export function anatomicalClipPlane(bounds: THREE.Box3, transform: THREE.Matrix4, axis: CutPlane, percent: number, reverse: boolean): THREE.Plane {
  const normal = new THREE.Vector3(...RAS_NORMALS[axis]).multiplyScalar(reverse ? -1 : 1);
  let minimum = Infinity, maximum = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const projection = normal.dot(new THREE.Vector3(x, y, z));
    minimum = Math.min(minimum, projection); maximum = Math.max(maximum, projection);
  }
  const epsilon = Math.max(1, maximum - minimum) * 0.0001;
  const cut = THREE.MathUtils.lerp(minimum - epsilon, maximum + epsilon, THREE.MathUtils.clamp(percent, 0, 100) / 100);
  return new THREE.Plane(normal, -cut).applyMatrix4(transform);
}
