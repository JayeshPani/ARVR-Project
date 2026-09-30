import { createManagedMindAR } from "./managed-mindar";
import { acquireCamera } from "../gestures/camera";
import * as THREE from "three";
import type { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";
import { GesturePanel, type GestureTarget } from "../gestures/panel";
import { clampZoom, type GestureFrame } from "../gestures/engine";
import { manipulate } from "../gestures/transforms";
import { disposeArModel, ANATOMY_SOURCE, ANATOMY_CONTEXT } from "./ar-model";
import { ArButtons, type ArButtonId } from "./ar-buttons";
import { anatomicalClipPlane, applyAnatomyMaterials, type CutPlane } from "../viewer/anatomy";
export type ArState = "idle" | "starting" | "searching" | "tracking" | "target-lost" | "error";
export interface ArSessionCallbacks { onStateChange(state:ArState):void }
/** AR's own slice of the viewer's settings: only what in-scene controls expose. */
export interface ArSettings { brainOpacity: number; cut: CutPlane | null }
export const defaultArSettings=():ArSettings=>({brainOpacity:0.3,cut:null});
export class ArSession implements GestureTarget {
  private container:HTMLElement;
  private imageTargetUrl:string;
  private callbacks:ArSessionCallbacks;
  private panelHost:HTMLElement;
  private state:ArState="idle";
  private mindArThree:InstanceType<typeof MindARThree>|null=null;
  private panel:GesturePanel|null=null;
  private manipulation=new THREE.Group();
  private model:THREE.Object3D|null=null;
  private generation=0;
  private cameraAbort:AbortController|null=null;
  private initialPosition=new THREE.Vector3();
  private zoomStart=1;
  private detachResize:(()=>void)|null=null;
  private settings=defaultArSettings();
  private source:THREE.Object3D|null=null;
  private context:THREE.Object3D|null=null;
  private sourceBounds=new THREE.Box3();
  private readonly clippingPlane=new THREE.Plane();
  private buttons:ArButtons|null=null;
  private readonly cutCycle:(CutPlane|null)[]=[null,"sagittal","coronal","axial"];
  constructor(container:HTMLElement,imageTargetUrl:string,callbacks:ArSessionCallbacks,panelHost:HTMLElement) {
    this.container=container;this.imageTargetUrl=imageTargetUrl;this.callbacks=callbacks;this.panelHost=panelHost;
  }
  async start(model:THREE.Object3D):Promise<void> {
    const generation=++this.generation; this.model=model; this.setState("starting");
    const {instance,detach}=createManagedMindAR(this.container,this.imageTargetUrl);
    this.detachResize=detach;
    this.mindArThree=instance;
    const cameraAbort=new AbortController();this.cameraAbort=cameraAbort;
    // Replace only camera acquisition, retaining MindAR tracking and projection.
    // Its default startup does not cancel late getUserMedia grants.
    instance._startVideo=async()=>{
      const video=document.createElement("video");video.muted=true;video.playsInline=true;video.autoplay=true;
      video.style.cssText="position:absolute;top:0;left:0;z-index:-2";
      instance.video=video;this.container.append(video);
      await acquireCamera(video,{video:{facingMode:"environment"},audio:false},cameraAbort.signal);
      if(generation!==this.generation) { (video.srcObject as MediaStream)?.getTracks().forEach(t=>t.stop());throw new DOMException("AR cancelled","AbortError"); }
    };
    this.initialPosition.copy(model.position);this.manipulation.position.copy(model.position);model.position.set(0,0,0);
    this.source=model.getObjectByName(ANATOMY_SOURCE)??null;
    this.context=model.getObjectByName(ANATOMY_CONTEXT)??null;
    const bounds=this.source?.userData.sourceBounds as THREE.Box3|undefined;
    if(bounds) this.sourceBounds.copy(bounds);
    try {
      const {scene,renderer,camera}=instance;
      renderer.localClippingEnabled=true; // MindAR's renderer does not enable this itself
      scene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.5));
      const light=new THREE.DirectionalLight(0xffffff,1.2);light.position.set(1,2,1);scene.add(light);
      const anchor=instance.addAnchor(0); anchor.group.add(this.manipulation); this.manipulation.add(model);
      // Sibling of `manipulation`, so moving or scaling the model leaves the
      // controls where the user last saw them.
      this.buttons=new ArButtons(id=>this.press(id)); anchor.group.add(this.buttons.group);
      window.addEventListener("resize",this.onResize);
      anchor.onTargetFound=()=>{ if(generation!==this.generation)return; this.setState("tracking");this.panel?.setAvailable(true); };
      // Dwell is wall-clock based, so a part-finished press must be dropped
      // while the marker is gone - otherwise reacquiring fires it instantly.
      anchor.onTargetLost=()=>{ if(generation!==this.generation)return; this.setState("target-lost");this.panel?.setAvailable(false);this.buttons?.cancel(); };
      await instance.start();
      if(generation!==this.generation) { await instance.stop(); return; }
      if(this.state!=="tracking") this.setState("searching");
      this.panel=new GesturePanel(this.panelHost,this,this.container,instance.video);
      this.panel.setAvailable(this.state==="tracking");
      this.applySettings(this.settings);
      renderer.setAnimationLoop(()=>{ this.refreshClipping(); renderer.render(scene,camera); });
    } catch(error) { if(generation===this.generation) { await this.stop();this.setState("error"); } throw error; }
  }
  applyGesture(frame:GestureFrame):void {
    if(this.state!=="tracking" || !this.mindArThree)return;
    this.buttons?.update(frame.cursor,frame.mode==="idle",performance.now(),this.mindArThree.camera,this.container,this.mindArThree.renderer.domElement);
    if(frame.mode==="zoom") {
      if(frame.started) this.zoomStart=this.manipulation.scale.x;
      else this.manipulation.scale.setScalar(clampZoom(this.zoomStart*frame.ratio));
    } else manipulate(this.manipulation,this.mindArThree.camera,frame);
  }
  private onResize=():void=>{ this.buttons?.invalidateLayout();this.buttons?.cancel(); };
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
  setGestureEnabled(_enabled:boolean):void { /* AR has no automatic rotation. */ }
  async stop():Promise<void> {
    ++this.generation;this.detachResize?.();this.detachResize=null;window.removeEventListener("resize",this.onResize);
    this.cameraAbort?.abort();this.cameraAbort=null;this.panel?.dispose();this.panel=null;
    const instance=this.mindArThree;this.mindArThree=null;
    if(instance) {
      instance.renderer.setAnimationLoop(null);
      try { await instance.stop(); } catch(error) { console.warn("AR camera cleanup",error); }
      (instance.video?.srcObject as MediaStream|null)?.getTracks().forEach(track=>track.stop());
      instance.video?.remove();
      instance.renderer.dispose();instance.renderer.forceContextLoss();
    }
    if(this.model) { disposeArModel(this.model);this.model=null; }
    this.buttons?.dispose();this.buttons=null;
    this.source=null;this.context=null;this.sourceBounds.makeEmpty();
    this.manipulation.clear();this.setState("idle");
  }
  private setState(state:ArState):void { this.state=state;this.callbacks.onStateChange(state); }
  getState():ArState { return this.state; }
}
