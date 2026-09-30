import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
let task: HandLandmarker | undefined;
const worker = self as unknown as { onmessage: ((e: MessageEvent)=>void)|null; postMessage: (data: unknown)=>void };
worker.onmessage = async ({data}) => {
  try {
    if(data.type==="init") {
      const vision=await FilesetResolver.forVisionTasks(data.wasm, true);
      const moduleFactory=(await import(/* @vite-ignore */ vision.wasmLoaderPath)).default;
      const scope=self as unknown as { ModuleFactory:unknown };
      scope.ModuleFactory=moduleFactory;
      const options={ runningMode:"VIDEO" as const,numHands:2,minHandDetectionConfidence:0.6,minHandPresenceConfidence:0.6,minTrackingConfidence:0.6 };
      try { task=await HandLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:data.model,delegate:"GPU"}}); }
      catch { scope.ModuleFactory=moduleFactory; task=await HandLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:data.model,delegate:"CPU"}}); }
      worker.postMessage({type:"ready"});
    } else if(data.type==="frame" && task) {
      try {
        const result=task.detectForVideo(data.bitmap,data.time);
        worker.postMessage({type:"result",time:data.time,epoch:data.epoch,hands:result.landmarks.map((landmarks,i)=>({landmarks,handedness:result.handedness[i]?.[0]?.categoryName}))});
      } finally { data.bitmap.close(); }
    }
  } catch(error) { worker.postMessage({type:"error",message:String(error)}); }
};
