import test from 'node:test';
import assert from 'node:assert/strict';
import {requestArPermissions} from '../src/ar/permissions.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const stream=onStop=>({getTracks:()=>[{stop:onStop}]});
test('requests both iOS permission APIs inside the original click before waiting for either',async()=>{
 const o=deferred(),m=deferred(),calls=[];let stopped=0;
 const result=requestArPermissions(new AbortController().signal,{secure:true,
 orientation:{requestPermission:()=>{calls.push('orientation');return o.promise;}},
 motion:{requestPermission:()=>{calls.push('motion');return m.promise;}},
 camera:async()=>{calls.push('camera');return stream(()=>stopped++);}});
 assert.deepEqual(calls,['orientation','motion','camera']);o.resolve('granted');m.resolve('granted');await result;assert.equal(stopped,1);
});
test('retry uses fresh native permission results after a previous denial',async()=>{
 let result='denied';const env={secure:true,orientation:{requestPermission:async()=>result},camera:async()=>stream(()=>{})};
 await assert.rejects(requestArPermissions(new AbortController().signal,env),/Orientation permission denied/);
 result='granted';await requestArPermissions(new AbortController().signal,env);
});
test('native rejection is reported rather than leaving the SDK polling forever',async()=>{
 await assert.rejects(requestArPermissions(new AbortController().signal,{secure:true,motion:{requestPermission:async()=>{throw new Error('Motion blocked');}},camera:async()=>stream(()=>{})}),/Motion blocked/);
});
test('exit cancels immediately and a late camera grant stops its tracks',async()=>{
 const c=new AbortController(),p=deferred();let stopped=0;
 const result=requestArPermissions(c.signal,{secure:true,camera:()=>p.promise});c.abort();
 await assert.rejects(result,{name:'AbortError'});p.resolve(stream(()=>stopped++));await new Promise(r=>setTimeout(r,0));assert.equal(stopped,1);
});
test('insecure context and missing camera return actionable errors without requesting permission',async()=>{
 await assert.rejects(requestArPermissions(new AbortController().signal,{secure:false}),/HTTPS/);
 await assert.rejects(requestArPermissions(new AbortController().signal,{secure:true}),/unavailable/);
});
