async(page)=>{
 await page.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:'explore',exact:true}).click();await page.getByRole('button',{name:'Enable hand controls',exact:true}).waitFor();
 await page.evaluate(async()=>{
  const image=new Image();image.src='/targets/bootstrap-test/card.png';await image.decode();
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');
  window.targetVisible=true;window.cameraRequests=0;
  window.arTimer=setInterval(()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,480);if(window.targetVisible)ctx.drawImage(image,120,90,400,400*image.height/image.width)},50);
  window.arStream=canvas.captureStream(20);navigator.mediaDevices.getUserMedia=async()=>{window.cameraRequests++;return window.arStream;};
 });
 await page.getByRole('button',{name:'Enter AR',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ar-state')?.textContent==='tracking',{},{timeout:30000});
 await page.locator('#ar-hand-controls').getByRole('button',{name:'Enable hand controls',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#ar-hand-controls [data-hand=status]')?.textContent?.startsWith('Ready'),{},{timeout:30000});
 const tracking=await page.locator('#ar-state').innerText();
 await page.evaluate(()=>window.targetVisible=false);
 await page.waitForFunction(()=>document.querySelector('#ar-state')?.textContent==='target-lost',{},{timeout:15000});
 const lost=await page.locator('#ar-hand-controls [data-hand=status]').innerText();
 await page.evaluate(()=>window.targetVisible=true);await page.waitForFunction(()=>document.querySelector('#ar-state')?.textContent==='tracking',{},{timeout:15000});
 const requests=await page.evaluate(()=>window.cameraRequests);
 await page.getByRole('button',{name:'Exit AR',exact:true}).click();
 const stopped=await page.evaluate(()=>{clearInterval(window.arTimer);return window.arStream.getTracks().every(t=>t.readyState==='ended');});
 if(requests!==1||!stopped||!lost.includes('Target lost'))throw new Error(JSON.stringify({requests,stopped,lost}));
 return {syntheticMarkerTracking:tracking,targetLost:lost,reacquired:true,cameraRequests:requests,cameraStopped:stopped};
}
