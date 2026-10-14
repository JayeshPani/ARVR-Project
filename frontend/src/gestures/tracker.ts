import { GestureEngine, type GestureFrame, type Hand } from "./engine.ts";

const MIN_INTERVAL=50, MAX_INTERVAL=100;
/** MediaPipe's hand model works at roughly 192-224 px internally, so feeding it
 * 640 px only paid for a bigger downscale on the critical path. */
const INFERENCE_WIDTH=480;

export interface VideoMapping { x: number; y: number; width: number; height: number; mirrored: boolean }
export function mapHands(hands: Hand[], mapping: VideoMapping): Hand[] {
  return hands.map(h=>({...h,landmarks:h.landmarks.map(p=>({...p,
    x:mapping.x+(mapping.mirrored?1-p.x:p.x)*mapping.width,
    y:mapping.y+p.y*mapping.height}))}));
}
/** Owns inference only; the caller owns the camera. One frame is ever in flight. */
export class HandTracker {
  private worker: Worker;
  private engine = new GestureEngine();
  private stopped=false;
  private ready=false;
  private paused=false;
  private busy=false;
  private epoch=0;
  private lastVideo=-1;
  private lastSent=-Infinity;
  private interval=MIN_INTERVAL;
  private latency=0;
  private frameWindowStart=performance.now();
  private renderFrames=0;
  private raf=0;
  private timer=0;
  private lastResult=0;
  constructor(privateOptions: {
    video: HTMLVideoElement;
    sample?: ()=>{image: ImageBitmapSource; width:number; height:number; id:number}|null;
    mapping: ()=>VideoMapping;
    aspect: ()=>number;
    frame: (frame: GestureFrame)=>void;
    status: (status: string)=>void;
  }) {
    this.options=privateOptions;
    this.worker=new Worker(new URL("./hand-worker.ts",import.meta.url),{type:"module"});
    this.worker.onmessage=({data})=>{
      if(this.stopped) return;
      if(data.type==="ready") { clearTimeout(this.timer); this.ready=true; this.lastResult=performance.now(); this.options.status("Ready — show an open palm or pinch"); }
      if(data.type==="error") this.fail(data.message);
      if(data.type==="result") {
        this.busy=false; const now=performance.now(); this.lastResult=now;
        const roundTrip=now-data.time;
        this.latency=this.latency?this.latency*.8+roundTrip*.2:roundTrip;
        // Adapt in BOTH directions. `interval` previously only ever increased,
        // so a single slow patch pinned inference at 10 fps for the rest of
        // the session even once the device recovered.
        if(this.latency>90) this.interval=MAX_INTERVAL; else if(this.latency<55) this.interval=MIN_INTERVAL;
        if(this.paused || data.epoch!==this.epoch || document.hidden) return;
        if(roundTrip>this.staleLimit()) {
          // Skip a late frame, but never tear down a gesture the user is
          // holding - that was cancelling zooms mid-pinch.
          if(!this.engine.isActive) this.cancel(false);
          this.options.status("Tracking is slow — hold your hand steady"); return;
        }
        const hands=mapHands(data.hands,this.options.mapping());
        this.options.frame(this.engine.update(hands,data.time,this.options.aspect()));
      }
    };
    this.worker.onerror=()=>this.fail("Hand tracking worker could not start");
    this.worker.postMessage({type:"init",wasm:new URL("/mediapipe-wasm",location.href).href,model:new URL("/models/hand_landmarker.task",location.href).href});
    this.timer=window.setTimeout(()=>this.fail("Hand tracking initialization timed out"),30000);
    document.addEventListener("visibilitychange",this.visibility);
    this.tick();
  }
  private options: { video: HTMLVideoElement;
    sample?: ()=>{image: ImageBitmapSource; width:number; height:number; id:number}|null; mapping: ()=>VideoMapping; aspect: ()=>number; frame: (frame: GestureFrame)=>void; status:(status:string)=>void };
  /** Tolerate latency proportional to the rate we are actually achieving; a
   * flat 150 ms fired constantly once `interval` reached 100 ms. */
  private staleLimit(): number { return Math.max(300,this.interval*3); }
  cancel(requireRelease=true): void { this.epoch++; this.engine.cancel(requireRelease); }
  setPaused(paused: boolean): void { this.paused=paused; this.cancel(); }
  private visibility=():void=>{ this.cancel(); };
  private tick=():void=>{
    if(this.stopped) return;
    this.raf=requestAnimationFrame(this.tick);
    const now=performance.now(),video=this.options.video;
    this.renderFrames++;
    if(now-this.frameWindowStart>=2000) {
      if(!document.hidden && this.renderFrames*1000/(now-this.frameWindowStart)<30) this.interval=MAX_INTERVAL;
      this.frameWindowStart=now;this.renderFrames=0;
    }
    if(this.ready && now-this.lastResult>this.staleLimit()) {
      this.engine.cancel(false);
      if(!this.paused) this.options.frame({mode:"idle",progress:0,points:[],started:false,dx:0,dy:0,ratio:1});
    }
    if(this.ready && this.busy && now-this.lastSent>5000) { this.fail("Hand inference timed out");return; }
    if(!this.ready || this.paused || document.hidden || this.busy || now-this.lastSent<this.interval) return;
    const sample=this.options.sample?.();
    if(this.options.sample ? !sample : video.readyState<2) return;
    const id=sample?.id??video.currentTime; if(id===this.lastVideo) return;
    this.busy=true; this.lastVideo=id; this.lastSent=now;
    const epoch=this.epoch;
    const sw=sample?.width??video.videoWidth,sh=sample?.height??video.videoHeight;
    const width=Math.min(sw,INFERENCE_WIDTH),height=Math.max(1,Math.round(sh*width/sw));
    void createImageBitmap(sample?.image??video,{resizeWidth:width,resizeHeight:height}).then(bitmap=>{
      if(this.stopped || epoch!==this.epoch) { bitmap.close(); this.busy=false; return; }
      this.worker.postMessage({type:"frame",bitmap,time:now,epoch},[bitmap]);
    }).catch(error=>this.fail(String(error)));
  };
  private fail(message: string): void {
    this.stop(); this.options.status(`Hand controls unavailable: ${message}. Mouse, touch and buttons remain available.`);
  }
  stop(): void {
    if(this.stopped) return;
    this.stopped=true; clearTimeout(this.timer); cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange",this.visibility); this.worker.terminate(); this.engine.cancel();
  }
}
