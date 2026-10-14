import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4, Quaternion, Vector3} from 'three';
import {ArPoseFilter, TrackingWarmup} from '../src/ar/pose-stability.ts';
const pose=(x=0, angle=0)=>new Matrix4().compose(new Vector3(x,0,-1.5),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),angle),new Vector3(1,1,1)).elements;

test('warmup rejects good pulses, duplicate frames, and a changed map',()=>{
 const gate=new TrackingWarmup();
 assert.equal(gate.update(true,true,0,'a'),false);
 assert.equal(gate.update(true,false,1000,'a'),false);
 for(let i=1;i<=5;i++)gate.update(true,true,1000+i*100,'a');
 assert.equal(gate.update(true,false,1500,'a'),true);
 assert.equal(gate.update(false,false,1510,'a'),false);
 assert.equal(gate.update(true,true,1520,'a'),false);
 for(let i=1;i<=6;i++)gate.update(true,true,1520+i*100,'a');
 assert.equal(gate.update(true,true,2200,'b'),false);
});

test('small alternating translation and rotation noise are damped',()=>{
 const filter=new ArPoseFilter();filter.update(pose(),0);
 let translation=0,rotation=0;
 const q=new Quaternion(),p=new Vector3(),s=new Vector3();
 for(let i=1;i<=60;i++){
   assert.equal(filter.update(pose((i%2?1:-1)*.003,(i%2?1:-1)*.004),i*1000/60),true);
   filter.matrix.decompose(p,q,s);
   if(i>10){translation=Math.max(translation,Math.abs(p.x));rotation=Math.max(rotation,q.angleTo(new Quaternion()));}
 }
 assert.ok(translation<.002,`translation noise ${translation}`);
 assert.ok(rotation<.0025,`rotation noise ${rotation}`);
});

test('ordinary walking speed stays responsive at 15, 30 and 60 camera FPS',()=>{
 for(const fps of [15,30,60]){
   const filter=new ArPoseFilter();filter.update(pose(),0);
   for(let i=1;i<=fps;i++){
     const x=.5*i/fps;
     assert.equal(filter.update(pose(x),i*1000/fps),true);
     assert.ok(x-filter.matrix.elements[12]<.035);
   }
 }
});

test('large jumps and invalid poses cannot replace the displayed transform',()=>{
 const filter=new ArPoseFilter();filter.update(pose(),0);
 const original=filter.matrix.elements.slice();
 for(const input of [pose(1),pose(0,Math.PI),new Array(16).fill(0),new Array(16).fill(NaN)]){
   assert.equal(filter.update(input,33),false);assert.deepEqual(filter.matrix.elements,original);
 }
 // A long tracking loss must not make a map jump pass the speed allowance.
 assert.equal(filter.update(pose(2),10000),false);
 filter.reset();assert.equal(filter.update(pose(2),10001),true);
 assert.equal(filter.matrix.elements[12],2);
});
