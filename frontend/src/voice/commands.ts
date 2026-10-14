import type { GestureFrame } from '../gestures/engine.ts';
export type VoiceCommand =
 | {kind:'zoom';direction:'in'|'out'}
 | {kind:'rotate'|'move';direction:'left'|'right'|'up'|'down'}
 | {kind:'opacity';value:number}
 | {kind:'cut';plane:'sagittal'|'coronal'|'axial'|null}
 | {kind:'reset'|'lock'|'unlock'|'place'|'stop'};
/** Full-utterance matching prevents background sentences from triggering actions. */
export function parseVoiceCommand(text:string):VoiceCommand|null {
 const s=text.toLowerCase().trim().replace(/[.,!?]+$/,'').replace(/\s+/g,' ').replace(/^please /,'').replace(/^brain /,'');
 let m=s.match(/^zoom (in|out)$/);if(m)return {kind:'zoom',direction:m[1] as 'in'|'out'};
 m=s.match(/^(rotate|turn|tilt|move) (left|right|up|down)$/);
 if(m)return {kind:m[1]==='move'?'move':'rotate',direction:m[2] as 'left'|'right'|'up'|'down'};
 m=s.match(/^(?:set )?(opacity|transparency)(?: to)? (.+?)(?: percent|%)?$/);
 if(m){const n=percentage(m[2]!);return n!==null?{kind:'opacity',value:(m[1]==='transparency'?100-n:n)/100}:null;}
 m=s.match(/^(?:cut|cutaway) (sagittal|coronal|axial)$/);if(m)return {kind:'cut',plane:m[1] as 'sagittal'|'coronal'|'axial'};
 if(['cut off','cutaway off','remove cut','show whole brain'].includes(s))return {kind:'cut',plane:null};
 if(['reset','reset position','reset view','reset brain'].includes(s))return {kind:'reset'};
 if(['lock','lock model','lock brain'].includes(s))return {kind:'lock'};
 if(['unlock','unlock model','unlock brain'].includes(s))return {kind:'unlock'};
 if(['place brain','place model','place'].includes(s))return {kind:'place'};
 if(['stop listening','microphone off','voice off'].includes(s))return {kind:'stop'};
 return null;
}
export function voiceMotion(command:Extract<VoiceCommand,{kind:'rotate'|'move'}>):GestureFrame {
 const amount=command.kind==='rotate'?1/12:0.05;
 return {mode:command.kind,started:false,progress:1,points:[],ratio:1,
 dx:command.direction==='left'?-amount:command.direction==='right'?amount:0,
 dy:command.direction==='up'?-amount:command.direction==='down'?amount:0};
}

function percentage(text:string):number|null {
 if(/^\d{1,3}$/.test(text)){const n=Number(text);return n<=100?n:null;}
 if(text==='one hundred'||text==='a hundred'||text==='hundred')return 100;
 const words:Record<string,number>={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
 if(text in words)return words[text]!;
 const parts=text.replace('-', ' ').split(' ');
 if(parts.length===2){const a=words[parts[0]!],b=words[parts[1]!];if(a!==undefined&&a>=20&&a%10===0&&b!==undefined&&b>0&&b<10)return a+b;}
 return null;
}
