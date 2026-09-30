import * as THREE from "three";
import type { GestureFrame } from "./engine.ts";

/** Changes the manipulation parent only; its children retain source geometry. */
export function manipulate(object: THREE.Object3D, camera: THREE.Camera, frame: GestureFrame): void {
  if(frame.started || (frame.mode!=="move" && frame.mode!=="rotate")) return;
  object.updateWorldMatrix(true,false); camera.updateWorldMatrix(true,false);
  const parentQ=object.parent?.getWorldQuaternion(new THREE.Quaternion())??new THREE.Quaternion();
  const cameraQ=camera.getWorldQuaternion(new THREE.Quaternion());
  if(frame.mode==="rotate") {
    const axes=cameraQ.clone();
    const up=new THREE.Vector3(0,1,0).applyQuaternion(axes);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(axes);
    const rotation=new THREE.Quaternion().setFromAxisAngle(up,frame.dx*Math.PI)
      .multiply(new THREE.Quaternion().setFromAxisAngle(right,frame.dy*Math.PI));
    const world=object.getWorldQuaternion(new THREE.Quaternion()).premultiply(rotation);
    object.quaternion.copy(parentQ.invert().multiply(world));
  } else {
    // Unproject at the object's camera depth. Works with MindAR's calibrated
    // projection matrix as well as the ordinary perspective camera.
    const centre=object.getWorldPosition(new THREE.Vector3());
    const ndc=centre.clone().project(camera);
    const next=new THREE.Vector3(ndc.x+frame.dx*2,ndc.y-frame.dy*2,ndc.z).unproject(camera);
    object.position.copy(object.parent?object.parent.worldToLocal(next):next);
  }
  object.updateWorldMatrix(false,true);
}
