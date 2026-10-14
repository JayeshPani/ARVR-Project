import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceCommand as parse,voiceMotion} from '../src/voice/commands.ts';
test('voice commands are exact, normalized and bounded',()=>{
 assert.deepEqual(parse('Please brain zoom in!'),{kind:'zoom',direction:'in'});
 assert.deepEqual(parse('set transparency to 70 percent'),{kind:'opacity',value:.3});
 assert.deepEqual(parse('opacity fifty percent'),{kind:'opacity',value:.5});
 assert.deepEqual(parse('transparency twenty five percent'),{kind:'opacity',value:.75});
 assert.deepEqual(parse('brain opacity 0%'),{kind:'opacity',value:0});
 assert.deepEqual(parse('opacity 100 percent'),{kind:'opacity',value:1});
 for(const text of ['opacity 101','opacity -1','opacity 1.5','do not zoom in','zoom in and reset','someone said reset'])assert.equal(parse(text),null,text);
});
test('cut, lock and stop commands are explicit',()=>{
 assert.deepEqual(parse('cut axial'),{kind:'cut',plane:'axial'});
 assert.deepEqual(parse('cut off'),{kind:'cut',plane:null});
 assert.deepEqual(parse('unlock model'),{kind:'unlock'});
 assert.deepEqual(parse('stop listening'),{kind:'stop'});
});
test('voice motion is a finite discrete step, not an arming gesture',()=>{
 const left=voiceMotion(parse('rotate left'));assert.equal(left.started,false);assert.equal(left.dx,-1/12);assert.equal(left.dy,0);
 const up=voiceMotion(parse('move up'));assert.equal(up.dy,-.05);assert.equal(up.dx,0);
});
