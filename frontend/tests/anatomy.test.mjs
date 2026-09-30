import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { anatomicalClipPlane, RAS_TO_VIEWER, VIEW_DIRECTIONS } from '../src/viewer/anatomy.ts';

const bounds = new THREE.Box3(new THREE.Vector3(-30, -50, -20), new THREE.Vector3(70, 90, 100));
const transform = RAS_TO_VIEWER.clone().multiply(new THREE.Matrix4().makeScale(.01, .01, .01)).multiply(new THREE.Matrix4().makeTranslation(-20, -20, -40));
function corners() {
  const points=[];
  for(const x of [-30,70]) for(const y of [-50,90]) for(const z of [-20,100]) points.push(new THREE.Vector3(x,y,z));
  return points;
}
test('RAS right, anterior, superior retain handedness and match named camera sides', () => {
  assert.equal(RAS_TO_VIEWER.determinant(), 1);
  const ras = {right:[1,0,0], left:[-1,0,0], anterior:[0,1,0], posterior:[0,-1,0], superior:[0,0,1]};
  for(const [view, axis] of Object.entries(ras)) assert.deepEqual(new THREE.Vector3(...axis).applyMatrix4(RAS_TO_VIEWER).toArray(), VIEW_DIRECTIONS[view]);
  const asymmetricBump=new THREE.Vector3(73,12,46).applyMatrix4(transform);
  assert.ok(asymmetricBump.x > 0, 'right-sided bump must stay on world right');
  assert.ok(asymmetricBump.y > 0, 'superior bump must stay above centre');
});
test('every anatomical clipping direction retains all at 0% and removes all at 100%', () => {
  for(const axis of ['sagittal','coronal','axial']) for(const reverse of [false,true]) {
    const retained=anatomicalClipPlane(bounds,transform,axis,0,reverse);
    const removed=anatomicalClipPlane(bounds,transform,axis,100,reverse);
    for(const point of corners()) {
      const world=point.clone().applyMatrix4(transform);
      assert.ok(retained.distanceToPoint(world)>0);
      assert.ok(removed.distanceToPoint(world)<0);
    }
  }
});
test('half cut and reverse retain opposite anatomical sides after display transforms', () => {
  const retainedPoints={sagittal:[-10,20,40],coronal:[20,-20,40],axial:[20,20,0]};
  for(const [axis,point] of Object.entries(retainedPoints)) {
    const world=new THREE.Vector3(...point).applyMatrix4(transform);
    assert.ok(anatomicalClipPlane(bounds,transform,axis,50,false).distanceToPoint(world)>0);
    assert.ok(anatomicalClipPlane(bounds,transform,axis,50,true).distanceToPoint(world)<0);
  }
});
