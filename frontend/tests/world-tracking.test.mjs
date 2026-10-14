import test from 'node:test';
import assert from 'node:assert/strict';
import {worldTrackingState} from '../src/ar/world-tracking-state.ts';
const good={placed:true,sameWorld:true,stopped:false,qualityGood:true,anchorTracking:true,frameAgeMs:0,hidden:false};
test('world tracking hides paused or stale poses, then recovers without replacing the anchor',()=>{
  assert.equal(worldTrackingState(good).visible,true);
  for(const failure of [{qualityGood:false},{anchorTracking:false},{frameAgeMs:251},{hidden:true}]){
    assert.deepEqual(worldTrackingState({...good,...failure}).placed,true);
    assert.equal(worldTrackingState({...good,...failure}).visible,false);
  }
  assert.equal(worldTrackingState(good).visible,true);
});
test('map reset or stopped anchor requires explicit replacement',()=>{
  for(const failure of [{sameWorld:false},{stopped:true}]){
    const state=worldTrackingState({...good,...failure});assert.equal(state.placed,false);assert.equal(state.visible,false);
    assert.equal(worldTrackingState({...good,placed:state.placed}).visible,false);
  }
});
test('placement needs fresh tracked frames and cannot occur in background',()=>{
  for(const failure of [{qualityGood:false},{frameAgeMs:251},{hidden:true}])assert.equal(worldTrackingState({...good,...failure}).canPlace,false);
  assert.equal(worldTrackingState({...good,placed:false}).canPlace,true);
  assert.equal(worldTrackingState({...good,placed:false}).visible,false);
});
