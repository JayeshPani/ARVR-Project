// Run against Vite on port 4175. Anchor quality/pose are injected; this is not a real-world stability test.
async(page)=>{
 await page.goto('http://127.0.0.1:4175');
 await page.evaluate(async()=>{
   const {WorldArSession}=await import('/src/ar/world-ar-session.ts');
   const {loadArModelGroup}=await import('/src/ar/ar-model.ts');
   const manifest=await (await fetch('/cases/case-01/manifest.json')).json();
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');
   window.testTimers=[];window.testStreams=[];
   navigator.mediaDevices.getUserMedia=async()=>{ctx.fillStyle='#556677';ctx.fillRect(0,0,640,480);const s=canvas.captureStream(20);window.testStreams.push(s);window.testTimers.push(setInterval(()=>{ctx.fillRect(0,0,640,480)},50));return s;};
   document.querySelector('#ar-overlay').hidden=false;
   window.worldTest=new WorldArSession(document.querySelector('#ar-viewport'),{onStateChange:s=>document.querySelector('#ar-state').textContent=s},document.querySelector('#ar-hand-controls'));
   await window.worldTest.start(await loadArModelGroup(manifest,{}));
 });
 await page.getByRole('button',{name:'Enable camera & motion',exact:true}).click();
 await page.waitForFunction(()=>window.worldTest.pipeline?.frameNumber()>3,{},{timeout:25000});
 const frames=await page.evaluate(()=>window.worldTest.pipeline.frameNumber());
 await page.evaluate(async()=>{
   const Z=await import('/node_modules/@zappar/zappar/lib/index.js');const s=window.worldTest;
   const original=s.pipeline.frameUpdate.bind(s.pipeline);
   window.syntheticQuality=true;
   s.pipeline.frameUpdate=()=>{original();s.tracker.quality=window.syntheticQuality?Z.WorldTrackerQuality.WORLD_TRACKER_QUALITY_GOOD:Z.WorldTrackerQuality.WORLD_TRACKER_QUALITY_LIMITED;};
   Object.defineProperty(s.anchor,'status',{get:()=>Z.AnchorStatus.ANCHOR_STATUS_TRACKING});
   s.anchor.poseCameraRelative=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,-1.5,1]);
 });
 await page.locator('[data-world=place]').click();
 await page.waitForFunction(()=>window.worldTest.root.visible);
 const voiceChecks=await page.evaluate(()=>{
   const s=window.worldTest;
   const blocked=s.applyVoice({kind:'zoom',direction:'in'});
   if(s.manipulation.scale.x!==1||!blocked.includes('unlock'))throw new Error('Voice ignored AR lock');
   s.applyVoice({kind:'unlock'});s.applyVoice({kind:'zoom',direction:'in'});
   if(s.manipulation.scale.x!==1.25)throw new Error('AR voice zoom failed');
   s.applyVoice({kind:'opacity',value:.6});if(s.getSettings().brainOpacity!==.6)throw new Error('AR voice opacity failed');
   s.applyVoice({kind:'lock'});return true;
 });
 await page.locator('[data-world=lock]').click();await page.locator('#ar-hand-controls [data-hand=enable]').click();
 await page.waitForFunction(()=>window.worldTest.pipeline.cameraFrameDataRGB()?.width>0);
 await page.waitForFunction(()=>document.querySelector('#ar-hand-controls [data-hand=status]').textContent.startsWith('Ready'));
 await page.locator('[data-world=cut]').click();
 const cut=await page.evaluate(()=>window.worldTest.getSettings().cut);
 await page.evaluate(()=>window.syntheticQuality=false);
 await page.waitForFunction(()=>!window.worldTest.root.visible);
 await page.evaluate(()=>window.syntheticQuality=true);await page.waitForFunction(()=>window.worldTest.root.visible);
 await page.evaluate(async()=>{await window.worldTest.stop();window.testTimers.forEach(clearInterval);document.querySelector('#ar-overlay').hidden=true;});
 const stopped=await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 return {voiceRespectsLockAndUpdatesSettings:voiceChecks,actualSDKFrames:frames,syntheticAnchorRecovery:true,sharedCameraFramesForMediaPipe:true,cut,stopped};
}
