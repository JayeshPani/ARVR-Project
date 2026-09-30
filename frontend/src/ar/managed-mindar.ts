import { MindARThree } from "mind-ar/dist/mindar-image-three.prod.js";

/** MindAR 1.2.5 registers an anonymous bound resize handler with no destroy API.
 * Capture that registration during its synchronous constructor so teardown can
 * remove the exact listener. No asynchronous work runs inside this scope. */
export function createManagedMindAR(container:HTMLElement,imageTargetSrc:string): { instance: MindARThree; detach:()=>void } {
  const original=window.addEventListener;
  let instance:MindARThree|undefined;
  const listeners:EventListenerOrEventListenerObject[]=[];
  window.addEventListener=function(type:string,listener:EventListenerOrEventListenerObject,options?:boolean|AddEventListenerOptions):void {
    if(type!=="resize") { original.call(window,type,listener,options);return; }
    const guarded:EventListener=(event)=>{
      if(!(instance as unknown as {controller?:unknown})?.controller)return;
      if(typeof listener==="function") listener.call(window,event);else listener.handleEvent(event);
    };
    original.call(window,type,guarded,options);listeners.push(guarded);
  } as typeof window.addEventListener;
  const detach=()=>{listeners.forEach(listener=>window.removeEventListener("resize",listener));listeners.length=0;};
  try {
    instance=new MindARThree({container,imageTargetSrc,uiLoading:"no",uiScanning:"no",uiError:"no"});
    return {instance,detach};
  } catch(error) { detach();throw error; }
  finally { window.addEventListener=original; }
}
