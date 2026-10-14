type MotionPermissionAPI = { requestPermission?:()=>Promise<string> };
export interface ArPermissionEnvironment {
  secure:boolean;
  orientation?:MotionPermissionAPI;
  motion?:MotionPermissionAPI;
  camera?:()=>Promise<MediaStream>;
}

/** Invoke directly from the click handler: iOS requires user activation.
 * Use each new native result, not the SDK's cached permission polling flags. */
export function requestArPermissions(signal:AbortSignal, environment:ArPermissionEnvironment):Promise<void> {
  if(!environment.secure) return Promise.reject(new Error("AR requires HTTPS. Open the HTTPS address on your phone, not the HTTP LAN address."));
  if(!environment.camera) return Promise.reject(new Error("Camera access is unavailable in this browser."));
  if(signal.aborted) return Promise.reject(new DOMException("AR cancelled","AbortError"));
  const requests:Promise<unknown>[]=[];
  for(const [name,api] of [["Orientation",environment.orientation],["Motion",environment.motion]] as const) {
    // Schedule every permission call before awaiting any of them.
    if(api?.requestPermission) {
      try {requests.push(api.requestPermission().then(result=>{
        if(result!=="granted")throw new Error(`${name} permission denied. Allow motion and orientation access in your browser settings, then retry.`);
      }));}catch(error){requests.push(Promise.reject(error));}
    }
  }
  try {
    requests.push(environment.camera().then(stream=>{
      // The SDK owns the actual tracking stream. This is a permission probe;
      // it must stop even if permission arrives after Exit AR.
      stream.getTracks().forEach(track=>track.stop());
    }).catch(error=>{throw new Error(`Camera permission failed: ${error instanceof Error?error.message:String(error)}`);}));
  }catch(error){requests.push(Promise.reject(error));}
  return new Promise<void>((resolve,reject)=>{
    const abort=()=>reject(new DOMException("AR cancelled","AbortError"));
    signal.addEventListener("abort",abort,{once:true});
    Promise.all(requests).then(()=>{if(signal.aborted)abort();else resolve();},reject)
      .finally(()=>signal.removeEventListener("abort",abort));
  });
}

export function browserArPermissions():ArPermissionEnvironment {
  const globals=window as unknown as {DeviceOrientationEvent?:MotionPermissionAPI;DeviceMotionEvent?:MotionPermissionAPI};
  return {secure:window.isSecureContext,orientation:globals.DeviceOrientationEvent,motion:globals.DeviceMotionEvent,
    camera:navigator.mediaDevices?.getUserMedia?()=>navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false}):undefined};
}
