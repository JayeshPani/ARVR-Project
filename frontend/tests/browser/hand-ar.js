// Markerless browser lifecycle check; camera frames are synthetic. This does not validate real SLAM.
async(page)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied for test','NotAllowedError');};});
 await page.getByRole('button',{name:'explore',exact:true}).click();
 await page.getByRole('button',{name:'Enter AR',exact:true}).click();
 await page.getByRole('button',{name:'Enable camera & motion',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ar-overlay')?.hidden && document.querySelector('#viewer-status')?.textContent?.includes('Camera permission failed'));
 await page.evaluate(()=>{
   window.cameraStreams=[];window.testCameraTimers=[];
   navigator.mediaDevices.getUserMedia=async()=>{
     const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
     const ctx=canvas.getContext('2d');ctx.fillStyle='gray';ctx.fillRect(0,0,640,480);
     const stream=canvas.captureStream(20);window.cameraStreams.push(stream);
     const timer=setInterval(()=>{ctx.fillStyle=Math.random()>.5?'gray':'silver';ctx.fillRect(0,0,2,2)},40);
     window.testCameraTimers.push(timer);
     return stream;
   };
 });
 for(let i=0;i<2;i++){
   await page.getByRole('button',{name:'Enter AR',exact:true}).click();
   await page.getByRole('button',{name:'Enable camera & motion',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#ar-state')?.textContent?.includes('Move slowly'));
   await page.locator('#ar-hand-controls [data-world="lock"]').click();
   await page.locator('#ar-hand-controls [data-hand="enable"]').click();
   await page.waitForFunction(()=>document.querySelector('#ar-hand-controls [data-hand="pause"]')?.disabled===false);
   await page.getByRole('button',{name:'Exit AR',exact:true}).click();
 }
 const ended=await page.evaluate(()=>{window.testCameraTimers.forEach(clearInterval);return window.cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'));});
 if(!ended||errors.length)throw new Error(JSON.stringify({ended,errors}));
 return {denialHandled:true,reenteredTwice:true,camerasStopped:ended,errors};
}
