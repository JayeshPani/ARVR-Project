import { VoicePanel } from "../voice/panel";
import { voiceMotion,type VoiceCommand } from "../voice/commands";
import * as THREE from "three";
import * as Zappar from "@zappar/zappar";
import { GesturePanel, type GestureTarget } from "../gestures/panel";
import { clampZoom, type GestureFrame } from "../gestures/engine";
import { manipulate } from "../gestures/transforms";
import { disposeArModel, ANATOMY_SOURCE, ANATOMY_CONTEXT } from "./ar-model";
import { ArButtons, type ArButtonId } from "./ar-buttons";
import { anatomicalClipPlane, applyAnatomyMaterials, type CutPlane } from "../viewer/anatomy";
import { requestArPermissions, browserArPermissions } from "./permissions";
import { worldTrackingState } from "./world-tracking-state";
import { ArPoseFilter, TrackingWarmup } from "./pose-stability";
import type { ArSettings } from "./ar-session";
const defaultArSettings=():ArSettings=>({brainOpacity:0.3,cut:null});

/** Camera and inertial sensing are owned by Zappar. MediaPipe consumes SDK frames,
 * never a second camera stream. Anchors are only set by explicit placement. */
export class WorldArSession implements GestureTarget {
  private pipeline:Zappar.Pipeline|null=null;
  private cameraSource:Zappar.CameraSource|null=null;
  private tracker:Zappar.WorldTracker|null=null;
  private anchor:Zappar.CustomAnchor|null=null;
  private renderer:THREE.WebGLRenderer|null=null;
  private camera=new THREE.PerspectiveCamera();
  private scene=new THREE.Scene();
  private root=new THREE.Group();
  private manipulation=new THREE.Group();
  private model:THREE.Object3D|null=null;
  private panel:GesturePanel|null=null;
  private voice:VoicePanel|null=null;
  private buttons:ArButtons|null=null;
  private source:THREE.Object3D|null=null;
  private context:THREE.Object3D|null=null;
  private sourceBounds=new THREE.Box3();
  private clippingPlane=new THREE.Plane();
  private initialPosition=new THREE.Vector3();
  private settings=defaultArSettings();
  private cutCycle:(CutPlane|null)[]=[null,"sagittal","coronal","axial"];
  private zoomStart=1;
  private generation=0;
  private placed=false;
  private tracking=false;
  private locked=true;
  private worldId="";
  private state="";
  private toolbar:HTMLDivElement|null=null;
  private placeButton:HTMLButtonElement|null=null;
  private timeout=0;
  private permissionAbort:AbortController|null=null;
  private startedAt=0;
  private hasOrientation=false;
  private hasMotion=false;
  private failing=false;
  private lastFrame=-1;
  private lastFrameAt=-Infinity;
  private warmup=new TrackingWarmup();
  private poseFilter=new ArPoseFilter();
  private canPlace=false;
  private poseReady=false;
  private needsReplacement=false;
  private container:HTMLElement;
  private callbacks:{onStateChange(state:string):void;onFatalError?(message:string):void};
  private panelHost:HTMLElement;
  constructor(container:HTMLElement,callbacks:{onStateChange(state:string):void;onFatalError?(message:string):void},panelHost:HTMLElement) {this.container=container;this.callbacks=callbacks;this.panelHost=panelHost;}
  async start(model:THREE.Object3D):Promise<void> {
    const generation=++this.generation;this.model=model;
    this.setState("Enable camera and motion to start markerless AR");
    this.toolbar=document.createElement("div");this.toolbar.className="world-ar-toolbar button-row";
    this.toolbar.innerHTML='<button data-world="start">Enable camera & motion</button><button data-world="place" disabled>Place brain ahead</button><button data-world="lock" disabled>Unlock model</button><button data-world="restart" disabled>Restart tracking</button><button data-world="opacity-down">Brain −</button><button data-world="opacity-up">Brain +</button><button data-world="cut">Cut section</button>';
    this.panelHost.prepend(this.toolbar);
    window.addEventListener("unhandledrejection",this.cameraFailure);
    this.placeButton=this.toolbar.querySelector('[data-world="place"]');
    this.placeButton!.onclick=()=>this.place();
    const lock=this.toolbar.querySelector<HTMLButtonElement>('[data-world="lock"]')!;
    lock.onclick=()=>{this.locked=!this.locked;lock.textContent=this.locked?"Unlock model":"Lock model";this.updateAvailability();};
    for(const id of ["opacity-down","opacity-up"] as const)this.toolbar.querySelector<HTMLButtonElement>(`[data-world="${id}"]`)!.onclick=()=>this.press(id);
    this.toolbar.querySelector<HTMLButtonElement>('[data-world="cut"]')!.onclick=()=>this.press("cut");
    this.toolbar.querySelector<HTMLButtonElement>('[data-world="restart"]')!.onclick=()=>{
      this.tracker?.reset();this.placed=false;this.tracking=false;this.root.visible=false;
      this.warmup.reset();this.poseFilter.reset();this.poseReady=false;this.canPlace=false;this.needsReplacement=false;
      this.lastFrameAt=-Infinity;this.startedAt=performance.now();this.updateAvailability();
    };
    const start=this.toolbar.querySelector<HTMLButtonElement>('[data-world="start"]')!;
    start.onclick=()=>{
      start.disabled=true;
      this.setState("Waiting for camera and motion permission…");
      this.permissionAbort=new AbortController();
      // Both motion APIs are invoked synchronously from this user gesture.
      void requestArPermissions(this.permissionAbort.signal,browserArPermissions()).then(async()=>{
        if(generation!==this.generation)return;
        await this.initialize(generation);
        if(generation!==this.generation)return;
        lock.disabled=false;start.hidden=true;
        this.toolbar!.querySelector<HTMLButtonElement>('[data-world="restart"]')!.disabled=false;
      }).catch(error=>{if(generation===this.generation)void this.fail(error);});
    };
  }
  private async initialize(generation:number):Promise<void> {
    this.setState("Loading world tracking…");
    await Promise.race([Zappar.loadedPromise(),new Promise((_,reject)=>{this.timeout=window.setTimeout(()=>reject(new Error("World tracking assets could not load")),20000);})]);
    clearTimeout(this.timeout);
    if(generation!==this.generation)return;
    this.startedAt=performance.now();
    window.addEventListener("deviceorientation",this.orientation);
    window.addEventListener("devicemotion",this.motion);
    const pipeline=this.pipeline=new Zappar.Pipeline();
    const renderer=this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setPixelRatio(1);renderer.autoClear=false;renderer.localClippingEnabled=true;
    this.container.append(renderer.domElement);pipeline.glContextSet(renderer.getContext());
    this.tracker=new Zappar.WorldTracker(pipeline);this.tracker.resetIfLimitedForMS=0;
    this.anchor=new Zappar.CustomAnchor(this.tracker);
    this.cameraSource=new Zappar.CameraSource(pipeline,Zappar.cameraDefaultDeviceID());
    this.cameraSource.setPreferredResolution(640,480);this.cameraSource.start();
    this.root.matrixAutoUpdate=false;this.root.visible=false;this.scene.add(this.root);this.root.add(this.manipulation);
    const model=this.model!;this.initialPosition.copy(model.position);this.manipulation.position.copy(model.position);model.position.set(0,0,0);this.manipulation.add(model);
    this.source=model.getObjectByName(ANATOMY_SOURCE)??null;this.context=model.getObjectByName(ANATOMY_CONTEXT)??null;
    const bounds=this.source?.userData.sourceBounds as THREE.Box3|undefined;if(bounds)this.sourceBounds.copy(bounds);
    this.buttons=new ArButtons(id=>this.press(id));this.root.add(this.buttons.group);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));const light=new THREE.DirectionalLight(0xffffff,1.2);light.position.set(1,2,1);this.scene.add(light);
    const host=document.createElement("div");this.panelHost.append(host);
    this.panel=new GesturePanel(host,this,this.container,document.createElement("video"),{
      sample:()=>{const f=pipeline.cameraFrameDataRGB();return f?{image:f.frame,width:f.width,height:f.height,id:pipeline.frameNumber()}:null;},
      mapping:()=>{const f=pipeline.cameraFrameDataRGB();const w=f?.width??640,h=f?.height??480;const scale=Math.max(this.container.clientWidth/w,this.container.clientHeight/h);return {x:(1-w*scale/this.container.clientWidth)/2,y:(1-h*scale/this.container.clientHeight)/2,width:w*scale/this.container.clientWidth,height:h*scale/this.container.clientHeight,mirrored:false};}
    });
    const voiceHost=document.createElement("section");this.panelHost.append(voiceHost);
    this.voice=new VoicePanel(voiceHost,command=>this.applyVoice(command));
    this.updateAvailability();this.applySettings(this.settings);this.resize();window.addEventListener("resize",this.resize);document.addEventListener("visibilitychange",this.visibility);
    renderer.domElement.addEventListener("webglcontextlost",this.contextLost);
    renderer.setAnimationLoop(()=>{try{this.frame();}catch(error){void this.fail(error);}});
    this.timeout=window.setTimeout(()=>{if(!this.pipeline?.frameNumber()){void this.fail(new Error("No camera frames. Check camera permission and try again."));}},15000);
  }
  private place():void {
    if(!this.canPlace || document.hidden || performance.now()-this.lastFrameAt>250 || !this.tracker || !this.anchor || this.tracker.quality!==Zappar.WorldTrackerQuality.WORLD_TRACKER_QUALITY_GOOD)return;
    // Deliberate camera-offset placement, not a fabricated surface hit test.
    this.anchor.setPoseFromCameraOffset(0,0,-1.5,Zappar.TransformOrientation.Z_TOWARDS_CAMERA);
    this.placed=true;this.worldId=this.tracker.worldAnchor.id;this.resetManipulation();
    this.poseFilter.reset();this.poseReady=false;this.needsReplacement=false;
    this.locked=true;
    this.toolbar!.querySelector<HTMLButtonElement>('[data-world="lock"]')!.textContent="Unlock model";
    this.tracking=false;this.root.visible=false;this.updateAvailability();
  }
  private frame():void {
    const p=this.pipeline!,r=this.renderer!,t=this.tracker!,a=this.anchor!;
    if(document.hidden)return;
    r.resetState();p.processGL();p.frameUpdate();p.cameraFrameUploadGL();
    const good=t.quality===Zappar.WorldTrackerQuality.WORLD_TRACKER_QUALITY_GOOD;
    const now=performance.now();
    const newFrame=p.frameNumber()>0&&p.frameNumber()!==this.lastFrame;
    if(newFrame){this.lastFrame=p.frameNumber();this.lastFrameAt=now;}
    const gate=worldTrackingState({placed:this.placed,sameWorld:t.worldAnchor.id===this.worldId,stopped:a.status===Zappar.AnchorStatus.ANCHOR_STATUS_STOPPED,qualityGood:good,anchorTracking:a.status===Zappar.AnchorStatus.ANCHOR_STATUS_TRACKING,frameAgeMs:now-this.lastFrameAt,hidden:document.hidden});
    if(this.placed&&!gate.placed){this.needsReplacement=true;this.poseFilter.reset();this.poseReady=false;}
    this.placed=gate.placed;
    let stable=this.warmup.update(gate.canPlace&&(!this.placed||gate.visible),newFrame,now,t.worldAnchor.id);
    if(gate.visible&&newFrame){
      this.poseReady=this.poseFilter.update(a.poseCameraRelative(),now);
      if(!this.poseReady){
        this.placed=false;this.needsReplacement=true;this.warmup.reset();stable=false;
      }
    }
    const tracked=this.placed&&gate.visible&&stable&&this.poseReady;
    if(tracked!==this.tracking){this.tracking=tracked;this.updateAvailability();}
    this.root.visible=tracked;
    this.canPlace=gate.canPlace&&stable;
    this.placeButton!.disabled=!this.canPlace;
    this.placeButton!.textContent=this.placed?"Reposition ahead":"Place brain ahead";
    this.setState(tracked?"Brain anchored in space":this.needsReplacement?"Tracking shifted — scan slowly, then place the brain again":this.placed?"Stabilizing tracking — move slowly near the placement area":good?(this.canPlace?"Aim at your placement area, then place the brain about 1.5 m ahead":"Hold steady while tracking settles…"):
      now-this.startedAt>8000&&(!this.hasOrientation||!this.hasMotion)?"No motion sensor data — use a motion-capable phone and allow motion/orientation access. Exit AR to retry permissions.":
      now-this.startedAt>30000?"Tracking has not initialized — move sideways across a textured, well-lit area, or select Restart tracking.":
      "Move slowly to scan the room; use a well-lit, textured area");
    this.camera.projectionMatrix.fromArray(p.projectionMatrix(r.domElement.width,r.domElement.height,0.01,100));this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    // Filter each camera sample once; repeated render ticks must not change the pose.
    if(tracked)this.root.matrix.copy(this.poseFilter.matrix);
    this.refreshClipping();
    p.cameraFrameDrawGL(r.domElement.width,r.domElement.height);r.resetState();r.clearDepth();r.render(this.scene,this.camera);
  }
  private resize=():void=>{this.renderer?.setSize(this.container.clientWidth,this.container.clientHeight);this.buttons?.invalidateLayout();};
  private visibility=():void=>{this.lastFrameAt=-Infinity;this.warmup.reset();this.canPlace=false;this.tracking=false;this.root.visible=false;this.buttons?.cancel();this.updateAvailability();};
  private orientation=(event:DeviceOrientationEvent):void=>{
    if([event.alpha,event.beta,event.gamma].every(v=>typeof v==="number"&&Number.isFinite(v)))this.hasOrientation=true;
  };
  private motion=(event:DeviceMotionEvent):void=>{
    if([event.accelerationIncludingGravity?.x,event.rotationRate?.alpha].some(v=>typeof v==="number"&&Number.isFinite(v)))this.hasMotion=true;
  };
  private async fail(error:unknown):Promise<void>{
    if(this.failing)return;this.failing=true;
    const message=error instanceof Error?error.message:String(error);
    await this.stop();this.setState(`AR unavailable: ${message}`);this.callbacks.onFatalError?.(message);
  }
  private cameraFailure=(event:PromiseRejectionEvent):void=>{
    // CameraSource starts asynchronously and has no public error callback.
    const name=event.reason?.name;
    if(!this.cameraSource||!["NotAllowedError","NotFoundError","NotReadableError","OverconstrainedError"].includes(name))return;
    event.preventDefault();void this.fail(event.reason);
  };
  private contextLost=(event:Event):void=>{event.preventDefault();void this.fail(new Error("Graphics context lost. Exit and re-enter AR."));};
  private updateAvailability():void{this.panel?.setAvailable(this.tracking&&!this.locked,this.locked?"Model locked — unlock to move, rotate or zoom":"Tracking unavailable — scan the placement area");this.buttons?.cancel();}
  applyGesture(frame:GestureFrame):void {
    if(!this.tracking||this.locked)return;
    this.buttons?.update(frame.cursor,frame.mode==="idle",performance.now(),this.camera,this.container,this.renderer!.domElement);
    if(frame.mode==="zoom"){if(frame.started)this.zoomStart=this.manipulation.scale.x;else this.manipulation.scale.setScalar(clampZoom(this.zoomStart*frame.ratio));}
    else manipulate(this.manipulation,this.camera,frame);
  }
  private applyVoice(command:VoiceCommand):string {
    this.panel?.cancelActiveGesture();this.buttons?.cancel();
    if(command.kind==="lock"||command.kind==="unlock"){
      this.locked=command.kind==="lock";
      this.toolbar!.querySelector<HTMLButtonElement>('[data-world="lock"]')!.textContent=this.locked?"Unlock model":"Lock model";
      this.updateAvailability();return this.locked?"Model locked. Listening…":"Model unlocked. Listening…";
    }
    if(command.kind==="opacity"){this.applySettings({...this.settings,brainOpacity:command.value});return "Brain opacity updated. Listening…";}
    if(command.kind==="cut"){this.applySettings({...this.settings,cut:command.plane});return "Brain cut updated. Listening…";}
    if(command.kind==="place"){
      if(this.placeButton?.disabled)return "Scan the room until placement is ready.";
      this.place();return "Placement requested. Listening…";
    }
    if(!this.tracking)return "Tracking unavailable — scan the placement area.";
    if(this.locked)return "Say unlock model before changing its pose.";
    if(command.kind==="reset")this.resetManipulation();
    if(command.kind==="zoom")this.manipulation.scale.setScalar(clampZoom(this.manipulation.scale.x*(command.direction==="in"?1.25:0.8)));
    if(command.kind==="rotate"||command.kind==="move")manipulate(this.manipulation,this.camera,voiceMotion(command));
    this.refreshClipping();return `Applied: ${command.kind}. Listening…`;
  }
  private press(id:ArButtonId):void {
    const next={...this.settings};
    if(id==="reset") { this.resetManipulation(); return; }
    if(id==="opacity-down") next.brainOpacity=Math.max(0,Math.round((next.brainOpacity-0.15)*100)/100);
    if(id==="opacity-up") next.brainOpacity=Math.min(1,Math.round((next.brainOpacity+0.15)*100)/100);
    if(id==="cut") next.cut=this.cutCycle[(this.cutCycle.indexOf(this.settings.cut)+1)%this.cutCycle.length]!;
    this.applySettings(next);
  }
  getSettings():ArSettings { return {...this.settings}; }
  applySettings(settings:ArSettings):void {
    this.settings={...settings};
    const cutButton=this.toolbar?.querySelector<HTMLButtonElement>('[data-world="cut"]');if(cutButton)cutButton.textContent=`Cut: ${settings.cut??"none"}`;
    if(this.context) applyAnatomyMaterials(this.context,{
      opacity:this.settings.brainOpacity,visible:true,
      planes:this.settings.cut?[this.clippingPlane]:[],
    });
    this.refreshClipping();
  }
  /** Clipping planes live in world space, and the anchor matrix changes on
   * every tracked frame - so unlike the viewer this must be recomputed each
   * frame, not only when settings change. Writes into the existing plane. */
  private refreshClipping():void {
    if(!this.settings.cut || !this.source || this.sourceBounds.isEmpty()) return;
    this.source.updateWorldMatrix(true,false);
    this.clippingPlane.copy(anatomicalClipPlane(this.sourceBounds,this.source.matrixWorld,this.settings.cut,50,false));
  }
  resetManipulation():void {
    this.manipulation.position.copy(this.initialPosition);this.manipulation.quaternion.identity();this.manipulation.scale.setScalar(1);
    this.applySettings(defaultArSettings());
  }
  setGestureEnabled(enabled:boolean):void { if(this.pipeline)this.pipeline.cameraFrameDataRGBEnabled=enabled; }
  async stop():Promise<void> {
    ++this.generation;this.permissionAbort?.abort();this.permissionAbort=null;
    window.removeEventListener("deviceorientation",this.orientation);window.removeEventListener("devicemotion",this.motion);
    clearTimeout(this.timeout);window.removeEventListener("unhandledrejection",this.cameraFailure);window.removeEventListener("resize",this.resize);document.removeEventListener("visibilitychange",this.visibility);
    this.renderer?.setAnimationLoop(null);this.renderer?.domElement.removeEventListener("webglcontextlost",this.contextLost);
    this.voice?.dispose();this.voice=null;
    this.panel?.dispose();this.panel=null;this.panelHost.replaceChildren();
    this.cameraSource?.pause();this.cameraSource?.destroy();this.cameraSource=null;
    this.anchor?.destroy();this.anchor=null;this.tracker?.destroy();this.tracker=null;this.pipeline?.destroy();this.pipeline=null;
    this.buttons?.dispose();this.buttons=null;if(this.model)disposeArModel(this.model);this.model=null;
    this.renderer?.dispose();this.renderer?.forceContextLoss();this.renderer?.domElement.remove();this.renderer=null;
  }
  private setState(state:string):void{if(state!==this.state){this.state=state;this.callbacks.onStateChange(state);}}
}
