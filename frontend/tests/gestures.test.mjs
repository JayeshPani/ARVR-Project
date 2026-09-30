import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GestureEngine, clampZoom, GESTURE } from '../src/gestures/engine.ts';
import { manipulate } from '../src/gestures/transforms.ts';
import { anatomicalClipPlane, RAS_TO_VIEWER } from '../src/viewer/anatomy.ts';
function hand(x=.4, pinch=false, label='Left', ratio=.2) {
 const p=Array.from({length:21},()=>({x,y:.5,z:0}));p[0]={x,y:.8};
 for(const [base,offset] of [[5,-.06],[9,0],[13,.05],[17,.1]]) {
  p[base]={x:x+offset,y:.6};p[base+1]={x:x+offset,y:.47};p[base+2]={x:x+offset,y:.38};p[base+3]={x:x+offset,y:.28};
 }
 p[4]=pinch?{x:p[8].x+.2*ratio,y:p[8].y}:{x:x-.18,y:.55};return {landmarks:p,handedness:label};
}
function feed(e,h,end,start=0) {let result;for(let t=start;t<=end;t+=50)result=e.update(h,t);return result;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('pinch hold arms without movement and release stops immediately',()=>{
 const e=new GestureEngine(),h=hand(.4,true);assert.equal(feed(e,[h],300).mode,'arming');
 const begin=e.update([h],350);assert.equal(begin.mode,'move');assert.equal(begin.started,true);near(begin.dx,0);
 assert.ok(e.update([hand(.43,true)],400).dx>0);assert.equal(e.update([],450).mode,'idle');assert.equal(e.update([h],500).mode,'arming');
});
test('open palm holds 250 ms; static hand and tiny noise do not rotate',()=>{
 const e=new GestureEngine();assert.equal(feed(e,[hand()],200).mode,'arming');assert.equal(e.update([hand()],250).mode,'rotate');
 near(e.update([hand()],300).dx,0);near(e.update([hand(.4001)],350).dx,0);assert.ok(e.update([hand(.44)],400).dx>0);
});
test('pinch hysteresis prevents toggling between .40 and .55',()=>{
 const e=new GestureEngine();feed(e,[hand(.4,true)],350);assert.equal(e.update([hand(.4,true,'Left',.48)],400).mode,'move');assert.notEqual(e.update([hand(.4,true,'Left',.6)],450).mode,'move');
});
test('two-hand zoom takes priority and survives a brief pinch dropout',()=>{
 const e=new GestureEngine();feed(e,[hand(.3,true)],350);const two=[hand(.3,true),hand(.7,true,'Right')];
 assert.equal(feed(e,two,500,400).mode,'arming');const begin=e.update(two,550);assert.equal(begin.mode,'zoom');assert.equal(begin.started,true);
 assert.ok(e.update([hand(.28,true),hand(.72,true,'Right')],600).ratio>1);
 // A dropped pinch holds the zoom rather than ending it, and must not leak
 // into a move that would fling the model.
 const gap=e.update([hand(.3,true)],650);assert.equal(gap.mode,'zoom');near(gap.dx,0);near(gap.dy,0);
});
test('a sustained pinch loss still cancels zoom and still demands a release',()=>{
 const e=new GestureEngine();const two=[hand(.3,true),hand(.7,true,'Right')];feed(e,two,150);
 assert.equal(e.update(two,200).mode,'zoom');
 // Grace is 250 ms; step in <=150 ms hops so the idle-gap reset never fires.
 assert.equal(e.update([hand(.3,true)],300).mode,'zoom');
 assert.equal(e.update([hand(.3,true)],450).mode,'zoom');
 assert.equal(e.update([hand(.3,true)],600).mode,'idle');
 assert.equal(e.update([hand(.3,true)],650).mode,'idle');
 e.update([hand()],700);assert.equal(e.update([hand(.3,true)],750).mode,'arming');
});
test('zoom refuses to start from hands too close to measure, then starts at ratio 1',()=>{
 // Spread .03 sits under the old 0.04 baseline floor, which made the first
 // ratio .03/.04 and snapped the model to ~3/4 size the instant zoom engaged.
 const e=new GestureEngine();assert.equal(feed(e,[hand(.50,true),hand(.53,true,'Right')],200).mode,'arming');
 const begin=e.update([hand(.40,true),hand(.70,true,'Right')],250);
 assert.equal(begin.mode,'zoom');assert.equal(begin.started,true);near(begin.ratio,1);
});
test('a landmark jitter spike cannot snap the scale more than one step',()=>{
 const e=new GestureEngine(),two=[hand(.3,true),hand(.7,true,'Right')];feed(e,two,150);
 assert.equal(e.update(two,200).mode,'zoom');
 const spike=e.update([hand(.1,true),hand(.9,true,'Right')],250); // raw ratio would be ~1.46
 assert.ok(spike.ratio<=1+GESTURE.maxRatioStep+1e-9,`${spike.ratio} exceeded one step`);
});
test('hand array reorder preserves identity; ambiguity cancels only outside a committed zoom',()=>{
 const e=new GestureEngine(),pair=[hand(.25,true),hand(.75,true,'Right')];feed(e,pair,150);assert.equal(e.update([...pair].reverse(),200).mode,'zoom');
 // Still armings: identity matters before the gesture commits, so cancel.
 const a=new GestureEngine();feed(a,[hand(.45,true),hand(.55,true,'Right')],100);
 assert.equal(a.update([hand(.5,true),hand(.5,true,'Right')],150).mode,'idle');
 // Committed: |p0-p1| is swap invariant, and converging hands ARE the
 // zoom-out motion, so the gesture survives and the scale does not collapse.
 const b=new GestureEngine();feed(b,[hand(.45,true),hand(.55,true,'Right')],150);
 const crossed=b.update([hand(.5,true),hand(.5,true,'Right')],200);
 assert.equal(crossed.mode,'zoom');assert.ok(crossed.ratio>=GESTURE.minZoom);
});
test('gaps and interruption require fresh activation',()=>{
 const e=new GestureEngine();feed(e,[hand(.4,true)],350);assert.equal(e.update([hand(.6,true)],600).mode,'arming');e.cancel();assert.equal(e.update([hand(.6,true)],650).mode,'idle');e.update([],700);assert.equal(e.update([hand(.6,true)],750).mode,'arming');
});
test('zoom limits and malformed input',()=>{near(clampZoom(.01),.35);near(clampZoom(20),3);assert.equal(new GestureEngine().update([{landmarks:[]}],0).mode,'idle');});
test('aspect corrected pinch is invariant to normalized image shape',()=>{
 const h=hand(.4,true,'Left',.35),s={...h,landmarks:h.landmarks.map(p=>({...p,x:p.x/2}))};assert.equal(new GestureEngine().update([h],0,1).action,new GestureEngine().update([s],0,2).action);
});
const frame=(mode,dx=.1,dy=.04)=>({mode,dx,dy,started:false,ratio:1,progress:1,points:[]});
test('screen-plane movement remains camera relative under a rotated AR anchor',()=>{
 const scene=new THREE.Scene(),anchor=new THREE.Group(),model=new THREE.Group();anchor.rotation.set(.4,.7,.2);anchor.scale.setScalar(1.7);scene.add(anchor);anchor.add(model);
 const camera=new THREE.PerspectiveCamera(45,1.5,.01,100);camera.position.set(0,0,5);camera.lookAt(0,0,0);scene.add(camera);scene.updateMatrixWorld(true);
 const before=model.getWorldPosition(new THREE.Vector3()).project(camera);manipulate(model,camera,frame('move'));const after=model.getWorldPosition(new THREE.Vector3()).project(camera);
 near(after.x-before.x,.2);near(after.y-before.y,-.08);near(after.z,before.z);
});
test('rotation preserves MRI coordinates, alignment and transformed clipping',()=>{
 const scene=new THREE.Scene(),parent=new THREE.Group(),source=new THREE.Group();source.matrixAutoUpdate=false;source.matrix.copy(RAS_TO_VIEWER).scale(new THREE.Vector3(.01,.01,.01));parent.add(source);scene.add(parent);
 const camera=new THREE.PerspectiveCamera();camera.position.z=5;scene.add(camera);scene.updateMatrixWorld(true);
 const tumour=new THREE.Object3D(),brain=new THREE.Object3D();tumour.position.set(20,30,40);brain.position.copy(tumour.position);source.add(tumour,brain);
 manipulate(parent,camera,frame('rotate'));source.updateWorldMatrix(true,true);assert.ok(tumour.getWorldPosition(new THREE.Vector3()).distanceTo(brain.getWorldPosition(new THREE.Vector3()))<1e-10);
 const ras=source.worldToLocal(tumour.getWorldPosition(new THREE.Vector3()));near(ras.x,20);near(ras.y,30);near(ras.z,40);
 const bounds=new THREE.Box3(new THREE.Vector3(-50,-50,-50),new THREE.Vector3(50,50,50));const clip=anatomicalClipPlane(bounds,source.matrixWorld,'sagittal',50,false);near(clip.distanceToPoint(new THREE.Vector3(0,20,30).applyMatrix4(source.matrixWorld)),0);
});

test('mirroring and cropped AR video share one landmark mapping',async()=>{
 const {mapHands}=await import('../src/gestures/tracker.ts');
 const hands=[{landmarks:[{x:.2,y:.4,z:0}],handedness:'Left'}];
 const mirrored=mapHands(hands,{x:0,y:0,width:1,height:1,mirrored:true});near(mirrored[0].landmarks[0].x,.8);
 const cropped=mapHands(hands,{x:-.5,y:0,width:2,height:1,mirrored:false});near(cropped[0].landmarks[0].x,-.1);near(cropped[0].landmarks[0].y,.4);
 near(hands[0].landmarks[0].x,.2);
});
test('late camera grant after cancellation stops its tracks',async()=>{
 const {acquireCamera}=await import('../src/gestures/camera.ts');
 const old=Object.getOwnPropertyDescriptor(navigator,'mediaDevices');let grant;
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>{grant=resolve;})}});
 let stops=0;const stream={getTracks:()=>[{stop:()=>stops++}]};
 try {
  const controller=new AbortController();const promise=acquireCamera({play:async()=>{}},{video:true},controller.signal);
  controller.abort();await assert.rejects(promise,{name:'AbortError'});grant(stream);await new Promise(resolve=>setImmediate(resolve));assert.equal(stops,1);
 } finally {if(old)Object.defineProperty(navigator,'mediaDevices',old);else delete navigator.mediaDevices;}
});
