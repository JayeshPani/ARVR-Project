// Simulates iOS native permission APIs. Does not certify physical-device SLAM.
async(page)=>{
 await page.goto('http://127.0.0.1:4173');
 await page.evaluate(()=>{
  window.nativeMotionResult='denied';window.permissionCalls=[];window.arStreams=[];window.arTimers=[];
  for(const key of ['DeviceOrientationEvent','DeviceMotionEvent'])Object.defineProperty(window[key],'requestPermission',{configurable:true,value:async()=>{window.permissionCalls.push(key);return window.nativeMotionResult;}});
  navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');const stream=c.captureStream(20);window.arStreams.push(stream);window.arTimers.push(setInterval(()=>ctx.fillRect(0,0,640,480),50));return stream;};
 });
 await page.getByRole('button',{name:'explore',exact:true}).click();
 const enter=async()=>{await page.getByRole('button',{name:'Enter AR',exact:true}).click();await page.getByRole('button',{name:'Enable camera & motion',exact:true}).click();};
 await enter();await page.waitForFunction(()=>document.querySelector('#ar-overlay').hidden);
 await page.evaluate(()=>window.nativeMotionResult='granted');
 await enter();await page.waitForFunction(()=>document.querySelector('#ar-state').textContent.includes('Move slowly'));
 await page.waitForFunction(()=>document.querySelector('#ar-state').textContent.includes('No motion sensor data'),{},{timeout:12000});
 await page.getByRole('button',{name:'Restart tracking',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ar-state').textContent.includes('Move slowly'));
 await page.getByRole('button',{name:'Exit AR',exact:true}).click();
 const result=await page.evaluate(()=>{window.arTimers.forEach(clearInterval);return {calls:window.permissionCalls,stopped:window.arStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))};});
 if(result.calls.length!==4||!result.stopped)throw new Error(JSON.stringify(result));
 return {...result,retryAfterMotionDenial:true,noSensorGuidance:true,restartWorks:true};
}
