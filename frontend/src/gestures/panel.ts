import { acquireCamera } from "./camera";
import { HandTracker, type VideoMapping } from "./tracker";
import type { GestureFrame } from "./engine";
export interface GestureTarget { applyGesture(frame: GestureFrame): void; resetManipulation():void; setGestureEnabled(enabled:boolean):void }
export class GesturePanel {
  private tracker: HandTracker|null=null;
  private video: HTMLVideoElement;
  private ownedStream: MediaStream|null=null;
  private generation=0;
  private cameraAbort:AbortController|null=null;
  private disposed=false;
  private enabled=false;
  private paused=false;
  private available=true;
  private unavailableMessage="Target lost—keep the marker visible";
  private pointers=new Set<number>();
  private wheelTimer=0;
  private host: HTMLElement;
  private status: HTMLElement;
  private toggle: HTMLButtonElement;
  private pause: HTMLButtonElement;
  private overlay: HTMLCanvasElement;
  private preview: HTMLElement;
  private target: GestureTarget;
  private external: boolean;
  private surface: HTMLElement;
  private controlSurface:HTMLElement|null=null;
  private frameSource?: {sample:()=>{image:ImageBitmapSource;width:number;height:number;id:number}|null;mapping:()=>VideoMapping};
  constructor(host: HTMLElement,target: GestureTarget,surface: HTMLElement,video?: HTMLVideoElement, frameSource?: {sample:()=>{image:ImageBitmapSource;width:number;height:number;id:number}|null;mapping:()=>VideoMapping}) {
    this.frameSource=frameSource;this.host=host; this.target=target; this.surface=surface; this.external=!!video;
    host.innerHTML=`<h3>Hand controls</h3><div class="button-row"><button type="button" data-hand="enable">Enable hand controls</button><button type="button" data-hand="pause" disabled>Pause</button><button type="button" data-hand="reset">Reset position</button></div><p data-hand="status" role="status">Camera off</p><label><input type="checkbox" data-hand="preview" /> Show hand preview</label><div class="hand-preview" hidden></div><p class="control-note">Open palm: rotate / tilt · One pinch held briefly: move · Two pinches spread together/apart: zoom. Release to stop. Video is processed on this device.</p>`;
    this.status=host.querySelector('[data-hand="status"]')!;
    this.toggle=host.querySelector('[data-hand="enable"]')!;
    this.pause=host.querySelector('[data-hand="pause"]')!;
    this.preview=host.querySelector('.hand-preview')!;
    this.video=video??document.createElement("video");
    if(!video) { this.video.muted=true; this.video.playsInline=true; this.video.className="hand-camera"; this.preview.append(this.video); }
    this.video.addEventListener("loadedmetadata",()=>{this.cachedMapping=null;});
    this.overlay=document.createElement("canvas"); this.overlay.className="hand-overlay";
    if(video) { surface.append(this.overlay); this.overlay.style.display="none"; } else this.preview.append(this.overlay);
    this.toggle.onclick=()=>{ if(this.enabled) this.disable(); else void this.enable(); };
    this.pause.onclick=()=>{ this.paused=!this.paused; this.tracker?.setPaused(this.paused||!this.available||this.pointers.size>0); this.pause.textContent=this.paused?"Resume":"Pause"; this.status.textContent=this.paused?"Paused":this.available?"Ready — release hands before starting":this.unavailableMessage; this.clear(); };
    host.querySelector<HTMLButtonElement>('[data-hand="reset"]')!.onclick=()=>{ this.tracker?.cancel(); target.resetManipulation(); };
    host.querySelector<HTMLInputElement>('[data-hand="preview"]')!.onchange=(event)=>{
      const visible=(event.target as HTMLInputElement).checked;
      if(this.external) this.overlay.style.display=visible?"block":"none"; else this.preview.hidden=!visible;
    };
    this.controlSurface=host.closest("fieldset");
    this.controlSurface?.addEventListener("pointerdown",this.controlInput);
    this.controlSurface?.addEventListener("click",this.controlInput);
    this.controlSurface?.addEventListener("input",this.controlInput);
    surface.addEventListener("pointerdown",this.interrupt);
    surface.addEventListener("wheel",this.wheel,{passive:true});
    window.addEventListener("resize",this.interrupt);
    window.addEventListener("pointerup",this.releasePointer);
    window.addEventListener("pointercancel",this.releasePointer);
  }
  private controlInput=():void=>{this.tracker?.cancel();this.clear();};
  private interrupt=(event?: Event):void=>{
    this.cachedMapping=null; // resize/orientation moved the video within the surface
    if(event instanceof PointerEvent) { this.pointers.add(event.pointerId);this.tracker?.setPaused(true); }
    else this.tracker?.cancel(); this.clear();
  };
  private wheel=():void=>{
    this.tracker?.setPaused(true);clearTimeout(this.wheelTimer);
    this.wheelTimer=window.setTimeout(()=>this.tracker?.setPaused(this.paused||!this.available||this.pointers.size>0),200);
  };
  private releasePointer=(event:PointerEvent):void=>{
    if(!this.pointers.delete(event.pointerId)) return;
    this.tracker?.setPaused(this.paused||!this.available||this.pointers.size>0);
  };
  private cachedMapping:VideoMapping|null=null;
  private context2d:CanvasRenderingContext2D|null=null;
  private mapping=():VideoMapping=>{
    if(this.frameSource) return this.frameSource.mapping();
    if(!this.external) return {x:0,y:0,width:1,height:1,mirrored:true};
    // Two getBoundingClientRect calls per tracked frame forced a layout on the
    // critical path. The video's placement inside the surface only changes on
    // resize/orientation, which already invalidates this via `interrupt`.
    if(this.cachedMapping) return this.cachedMapping;
    const v=this.video.getBoundingClientRect(),s=this.surface.getBoundingClientRect();
    return this.cachedMapping={x:(v.left-s.left)/s.width,y:(v.top-s.top)/s.height,width:v.width/s.width,height:v.height/s.height,mirrored:false};
  };
  private async enable():Promise<void> {
    this.enabled=true; const generation=++this.generation;
    this.toggle.textContent="Disable hand controls"; this.status.textContent="Starting hand tracking…";
    this.target.setGestureEnabled(true);
    try {
      if(!this.external) {
        this.cameraAbort=new AbortController();
        const stream=await acquireCamera(this.video,{video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false},this.cameraAbort.signal);
        if(this.disposed || generation!==this.generation) { stream.getTracks().forEach(t=>t.stop()); return; }
        this.ownedStream=stream;
      }
      if(this.disposed || generation!==this.generation) return;
      this.tracker=new HandTracker({video:this.video,mapping:this.mapping,sample:this.frameSource?.sample,
        aspect:()=>this.external?this.surface.clientWidth/Math.max(1,this.surface.clientHeight):this.video.videoWidth/Math.max(1,this.video.videoHeight),
        frame:frame=>{ if(!this.enabled || this.paused || !this.available) return; this.target.applyGesture(frame); this.draw(frame); },
        status:status=>{ if(generation!==this.generation) return; if(status.startsWith("Hand controls unavailable")) { this.disable();this.status.textContent=status; }
          else this.status.textContent=this.paused?"Paused":!this.available?this.unavailableMessage:status; }});
      this.tracker.setPaused(!this.available); this.pause.disabled=false;
    } catch(error) { if(generation!==this.generation) return; this.disable(); this.status.textContent=`Hand controls unavailable: ${String(error)}. Use mouse, touch or buttons.`; }
  }
  setAvailable(available:boolean,message="Target lost—keep the marker visible"):void {
    this.unavailableMessage=message;
    this.available=available; this.tracker?.setPaused(this.paused||!available); this.clear();
    if(this.enabled) this.status.textContent=available?"Ready — release hands before starting":this.unavailableMessage;
  }
  private draw(frame:GestureFrame):void {
    const labels={idle:"Ready — show one open palm or pinch",arming:`Hold to ${frame.action}… ${Math.round(frame.progress*10)*10}%`,rotate:"Rotating",move:"Moving",zoom:"Zooming"};
    if(this.status.textContent!==labels[frame.mode]) this.status.textContent=labels[frame.mode];
    const width=this.external?this.surface.clientWidth:320;
    const height=this.external?this.surface.clientHeight:width*this.video.videoHeight/Math.max(1,this.video.videoWidth);
    if(this.overlay.width!==width) this.overlay.width=width;
    if(this.overlay.height!==height) this.overlay.height=height;
    const ctx=this.context2d??=this.overlay.getContext("2d"); if(!ctx) return;
    ctx.clearRect(0,0,width,height);
    for(const p of frame.points) {
      ctx.beginPath();ctx.arc(p.x*width,p.y*height,16,0,Math.PI*2);ctx.strokeStyle="#ffffff99";ctx.lineWidth=3;ctx.stroke();
      ctx.beginPath();ctx.arc(p.x*width,p.y*height,16,-Math.PI/2,-Math.PI/2+Math.PI*2*frame.progress);ctx.strokeStyle="#7cffb2";ctx.stroke();
    }
  }
  private clear():void { (this.context2d??=this.overlay.getContext("2d"))?.clearRect(0,0,this.overlay.width,this.overlay.height); }
  cancelActiveGesture():void { this.tracker?.cancel(); this.clear(); }
  disable():void {
    this.generation++; this.enabled=false; this.paused=false;
    this.cameraAbort?.abort(); this.cameraAbort=null;clearTimeout(this.wheelTimer);this.pointers.clear();
    this.tracker?.stop(); this.tracker=null;
    this.ownedStream?.getTracks().forEach(t=>t.stop()); this.ownedStream=null;
    if(!this.external) this.video.srcObject=null;
    this.target.setGestureEnabled(false); this.toggle.textContent="Enable hand controls";
    this.pause.disabled=true; this.pause.textContent="Pause"; this.status.textContent=this.external?"Hand controls off":"Camera off";this.clear();
  }
  dispose():void {
    this.disposed=true; this.disable(); this.overlay.remove();
    this.surface.removeEventListener("pointerdown",this.interrupt); this.surface.removeEventListener("wheel",this.wheel);
    window.removeEventListener("pointerup",this.releasePointer); window.removeEventListener("pointercancel",this.releasePointer);
    window.removeEventListener("resize",this.interrupt);clearTimeout(this.wheelTimer);
    this.controlSurface?.removeEventListener("pointerdown",this.controlInput);
    this.controlSurface?.removeEventListener("click",this.controlInput);
    this.controlSurface?.removeEventListener("input",this.controlInput);
    this.host.replaceChildren();
  }
}
