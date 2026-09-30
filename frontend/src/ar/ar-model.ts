import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CaseManifest } from "../case/types";

/** Names used to find the source-space group and the brain context inside a
 * loaded AR model, so ArSession can apply settings without a wider signature. */
export const ANATOMY_SOURCE = "anatomy-source";
export const ANATOMY_CONTEXT = "anatomy-context";

/**
 * Loads whichever meshes are currently active (baseline regions, or the
 * currently-selected scenario frame) plus the brain context, into a single
 * centred/scaled group for the AR anchor. Independent from the ordinary
 * viewer's own Three.js scene/renderer (CaseSceneViewer) - reloads the GLBs
 * fresh rather than reparenting live objects, so AR can't corrupt the
 * ordinary viewer's object graph or vice versa. The full-resolution brain is about 12 MB; loading is asynchronous.
 */
export async function loadArModelGroup(
  manifest: CaseManifest,
  regionMeshPaths: Record<string, string>,
): Promise<THREE.Group> {
  const loader = new GLTFLoader();

  const regionEntries = Object.entries(regionMeshPaths);
  const [regionGltfs, contextGltf] = await Promise.all([
    Promise.all(regionEntries.map(([, path]) => loader.loadAsync(`/cases/${manifest.caseId}/${path}`))),
    manifest.anatomicalContext
      ? loader.loadAsync(`/cases/${manifest.caseId}/${manifest.anatomicalContext.meshPath}`)
      : Promise.resolve(null),
  ]);

  const inner = new THREE.Group();

  regionGltfs.forEach((gltf, i) => {
    const [regionId] = regionEntries[i]!;
    const color = manifest.regions.find((r) => r.id === regionId)?.color ?? "#ed667d";
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (!obj.geometry.hasAttribute("normal")) obj.geometry.computeVertexNormals();
        obj.material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
      }
    });
    inner.add(gltf.scene);
  });

  if (contextGltf) {
    contextGltf.scene.name = ANATOMY_CONTEXT;
    contextGltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (!obj.geometry.hasAttribute("normal")) obj.geometry.computeVertexNormals();
        // Transparency and clipping are owned by ArSession's settings, applied
        // immediately on start - not hardcoded here.
        obj.material = new THREE.MeshStandardMaterial({ color: 0xd6aba0, roughness: 0.9, side: THREE.DoubleSide });
      }
    });
    inner.add(contextGltf.scene);
  }

  // Taken while `inner` is still untransformed and unparented, so these are
  // source RAS-mm bounds - what anatomicalClipPlane() expects, paired with
  // inner.matrixWorld. Stashed for ArSession, which computes its own planes.
  const bounds = new THREE.Box3().setFromObject(inner);
  inner.name = ANATOMY_SOURCE;
  inner.userData.sourceBounds = bounds.clone();
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 0.6 / Math.max(size.x, size.y, size.z, 1e-6);

  const outer = new THREE.Group();
  outer.add(inner);
  inner.position.set(-centre.x, -centre.y, -centre.z);
  outer.scale.setScalar(scale);
  // Same RAS -> screen convention as the ordinary viewer: right stays
  // right, superior becomes up, anterior comes toward the viewer.
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.05;
  return outer;
}

export function disposeArModel(model: THREE.Object3D): void {
  model.traverse(object=>{
    if(!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      for(const value of Object.values(material)) if(value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
