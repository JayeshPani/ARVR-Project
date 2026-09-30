async(page)=>{
 await page.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:'explore',exact:true}).click();await page.getByRole('button',{name:'Enable hand controls',exact:true}).waitFor();
 await page.evaluate(()=>{
  const Original=window.Worker;window.latencies=[];
  window.Worker=class extends Original {constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.type==='result')window.latencies.push(performance.now()-e.data.time);});}};
  const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');let n=0;window.videoTimer=setInterval(()=>{ctx.fillStyle=n++%2?'#888':'#999';ctx.fillRect(0,0,640,480)},50);window.testStream=c.captureStream(20);navigator.mediaDevices.getUserMedia=async()=>window.testStream;
 });
 await page.getByRole('button',{name:'Enable hand controls',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-hand=status]')?.textContent?.startsWith('Ready'),{},{timeout:30000});
 const results=await page.evaluate(async()=>{
  window.latencies=[];const times=[];const start=performance.now();await new Promise(resolve=>{const loop=t=>{times.push(t);if(t-start<5000)requestAnimationFrame(loop);else resolve();};requestAnimationFrame(loop)});
  const latency=window.latencies.slice(3).sort((a,b)=>a-b);
  return {seconds:(times.at(-1)-times[0])/1000,fps:(times.length-1)*1000/(times.at(-1)-times[0]),detections:latency.length,workerRoundTripMedianMs:latency[Math.floor(latency.length*.5)],workerRoundTripP95Ms:latency[Math.floor(latency.length*.95)],conditions:'Chromium desktop, full-resolution brain, default opacity 30%, blank synthetic 640x480 video, no real hands; not end-to-end gesture latency'};
 });
 await page.getByRole('button',{name:'Disable hand controls',exact:true}).click();await page.evaluate(()=>clearInterval(window.videoTimer));return results;
}
