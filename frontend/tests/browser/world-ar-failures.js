// Run against the production preview on port 4174.
async(page)=>{
 const open=async()=>{await page.goto('http://127.0.0.1:4174');await page.getByRole('button',{name:'explore',exact:true}).click();await page.getByRole('button',{name:'Enter AR',exact:true}).click();};
 await page.route('**/world-ar-session-*.js',r=>r.abort());await open();
 await page.waitForFunction(()=>document.querySelector('#ar-state')?.textContent?.includes('failed'));
 await page.getByRole('button',{name:'Exit AR',exact:true}).click();await page.unroute('**/world-ar-session-*.js');
 await open();
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.grantLate=resolve);});
 await page.getByRole('button',{name:'Enable camera & motion',exact:true}).click();
 await page.waitForFunction(()=>!!window.grantLate);
 await page.getByRole('button',{name:'Exit AR',exact:true}).click();
 await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;window.lateStream=c.captureStream();window.grantLate(window.lateStream);});
 await page.waitForFunction(()=>window.lateStream.getTracks().every(t=>t.readyState==='ended'));
 return {assetFailureRecoverable:true,lateCameraGrantStopped:true};
}
