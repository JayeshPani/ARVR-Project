/** A late camera grant must never survive disable, navigation or AR exit. */
export async function acquireCamera(video: HTMLVideoElement, constraints: MediaStreamConstraints, signal: AbortSignal): Promise<MediaStream> {
  if(!navigator.mediaDevices?.getUserMedia) throw new Error("Camera requires HTTPS or localhost");
  let stream:MediaStream|undefined;
  const aborted=()=>new DOMException("Camera request cancelled","AbortError");
  let rejectAbort:(error:unknown)=>void=()=>{};
  const stop=()=>{stream?.getTracks().forEach(t=>t.stop());rejectAbort(aborted());};
  const cancellation=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  signal.addEventListener("abort",stop,{once:true});
  try {
    if(signal.aborted) throw aborted();
    const request=navigator.mediaDevices.getUserMedia(constraints).then(value=>{
      stream=value;
      if(signal.aborted) { value.getTracks().forEach(t=>t.stop());throw aborted(); }
      return value;
    });
    stream=await Promise.race([request,cancellation]);
    video.srcObject=stream;
    await Promise.race([video.play(),cancellation]);
    if(signal.aborted) throw aborted();
    return stream;
  } catch(error) { stream?.getTracks().forEach(t=>t.stop());throw error; }
  finally { signal.removeEventListener("abort",stop); }
}
