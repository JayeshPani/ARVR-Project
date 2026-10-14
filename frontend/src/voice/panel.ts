import {parseVoiceCommand,type VoiceCommand} from './commands.ts';
interface Recognition {
 lang:string;continuous:boolean;interimResults:boolean;
 onstart:(()=>void)|null;onend:(()=>void)|null;
 onerror:((event:{error:string})=>void)|null;
 onresult:((event:{resultIndex:number;results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>})=>void)|null;
 start():void;abort():void;
}
type RecognitionConstructor=new()=>Recognition;
export class VoicePanel {
 private recognition:Recognition|null=null;
 private generation=0;
 private disposed=false;
 private timer=0;
 private button:HTMLButtonElement;
 private status:HTMLElement;
 private host:HTMLElement;
 private execute:(command:VoiceCommand)=>string;
 constructor(host:HTMLElement,execute:(command:VoiceCommand)=>string){
  this.host=host;this.execute=execute;host.classList.add('voice-controls');
  host.innerHTML='<h3>Voice controls</h3><button type="button" data-voice="toggle" aria-pressed="false">Enable voice controls</button><p data-voice="status" role="status">Microphone off</p><details><summary>Voice command guide</summary><p>Zoom in / out · Rotate left / right / up / down · Move left / right / up / down · Reset position · Opacity 50 percent · Transparency 70 percent · Cut sagittal / coronal / axial · Cut off. In AR: Place brain · Lock model · Unlock model. Say “Stop listening” to turn off the microphone. Commands are in English.</p></details><p class="control-note">Your browser’s speech service may send audio online for recognition. This app does not save audio or transcripts. Enable only when you want to speak commands.</p>';
  this.button=host.querySelector('[data-voice="toggle"]')!;this.status=host.querySelector('[data-voice="status"]')!;
  if(!this.constructorForBrowser()){this.button.disabled=true;this.status.textContent='Voice recognition is unavailable in this browser. Use buttons or hand controls.';}
  this.button.onclick=()=>this.recognition?this.stop():this.start();
  document.addEventListener('visibilitychange',this.visibility);window.addEventListener('pagehide',this.visibility);
 }
 private constructorForBrowser():RecognitionConstructor|undefined{
  const w=window as unknown as {SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
  return w.SpeechRecognition??w.webkitSpeechRecognition;
 }
 private start():void{
  if(this.disposed)return;
  const Constructor=this.constructorForBrowser();if(!Constructor)return;
  const generation=++this.generation;
  try{
   const r=this.recognition=new Constructor();r.lang='en-US';r.continuous=true;r.interimResults=false;
   this.button.textContent='Stop listening';this.button.setAttribute('aria-pressed','true');this.status.textContent='Requesting microphone…';
   r.onstart=()=>{if(generation!==this.generation)return;clearTimeout(this.timer);this.status.textContent='Listening — say one command at a time';};
   let consumed=0;
   r.onresult=event=>{
    if(generation!==this.generation||this.disposed||document.hidden)return;
    for(let i=Math.max(event.resultIndex,consumed);i<event.results.length;i++){
     const result=event.results[i]!;if(!result.isFinal)continue;consumed=i+1;
     const command=parseVoiceCommand(result[0].transcript);
     if(command?.kind==='stop'){this.stop();return;}
     if(!command){this.status.textContent='Command not recognized. Try “zoom in” or open the guide.';continue;}
     try{this.status.textContent=this.execute(command);}catch{this.status.textContent='Command could not run. Use the on-screen controls.';}
    }
   };
   r.onerror=event=>{if(generation!==this.generation)return;this.stop();this.status.textContent=`Voice unavailable (${event.error}). Check microphone permission or browser speech support. Buttons remain available.`;};
   r.onend=()=>{if(generation!==this.generation)return;this.stop();this.status.textContent='Microphone off — enable voice controls to listen again.';};
   this.timer=window.setTimeout(()=>{if(generation===this.generation){this.stop();this.status.textContent='Speech recognition did not start. Check microphone permission and browser support.';}},15000);
   r.start();
  }catch{this.stop();this.status.textContent='Speech recognition could not start. Use the other controls.';}
 }
 stop():void{
  ++this.generation;clearTimeout(this.timer);const r=this.recognition;this.recognition=null;
  if(r){r.onstart=r.onend=r.onerror=r.onresult=null;try{r.abort();}catch{/* Already stopped. */}}
  this.button.textContent='Enable voice controls';this.button.setAttribute('aria-pressed','false');this.status.textContent='Microphone off';
 }
 private visibility=():void=>{this.stop();};
 dispose():void{this.disposed=true;this.stop();document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('pagehide',this.visibility);this.host.remove();}
}
