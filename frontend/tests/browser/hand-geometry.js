async(page)=>{
 await page.goto('http://127.0.0.1:4174');
 return await page.evaluate(async()=>{
  const {CaseSceneViewer,defaultViewerSettings}=await import('/src/viewer/scene.ts');
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const manifest=await(await fetch('/cases/case-01/manifest.json')).json();
  const saved=JSON.stringify(manifest);
  const el=document.createElement('div');el.style.cssText='width:800px;height:600px';document.body.append(el);
  const viewer=new CaseSceneViewer(el);await viewer.loadCase(manifest);viewer.start();
  const check=(c,s)=>{if(!c)throw new Error(s);};
  const frame=(mode,dx=0,dy=0,started=false,ratio=1)=>({mode,dx,dy,started,ratio,progress:1,points:[]});
  const meshes=[];viewer.scene.traverse(o=>{if(o.isMesh)meshes.push(o)});
  const brain=meshes.find(o=>o.userData.kind==='brain'),tumour=meshes.find(o=>o.userData.kind==='region');
  const source=viewer.root,parent=viewer.manipulation;
  const baselineMatrix=source.matrix.clone(),before=parent.matrixWorld.clone();
  viewer.setGestureEnabled(true);viewer.applySettings({...defaultViewerSettings(),autoRotate:true,cutEnabled:true});
  check(!viewer.controls.autoRotate,'Automatic rotation remained on');
  viewer.applyGesture(frame('rotate',.15,.06));viewer.applyGesture(frame('move',.04,-.03));
  check(!parent.matrixWorld.equals(before),'No manipulation applied');check(source.matrix.equals(baselineMatrix),'Source transform changed');
  const point=new THREE.Vector3(10,20,30),world=source.localToWorld(point.clone());check(source.worldToLocal(world).distanceTo(point)<1e-7,'MRI coordinates corrupted');
  const transformedPlane=viewer.clippingPlane.clone();check(transformedPlane.normal.distanceTo(new THREE.Vector3(-1,0,0))>.01,'Clip plane failed to rotate');
  const ancestor=(o)=>{for(let p=o;p;p=p.parent)if(p===source)return true;return false;};check(ancestor(brain)&&ancestor(tumour),'Brain and tumour do not share source root');
  const pose=parent.matrixWorld.clone();await viewer.loadMeshes(manifest,manifest.scenarios.find(s=>s.id==='global-reduction').frames[2].meshPaths);
  check(parent.matrixWorld.equals(pose),'Scenario changed manipulation pose');check(saved===JSON.stringify(manifest),'Measurements changed');
  viewer.applyGesture(frame('zoom',0,0,true));viewer.applyGesture(frame('zoom',0,0,false,100));
  check(Math.abs(viewer.initialDistance/viewer.camera.position.distanceTo(viewer.controls.target)-3)<1e-6,'Zoom max clamp');
  viewer.applyGesture(frame('zoom',0,0,true));viewer.applyGesture(frame('zoom',0,0,false,.001));
  check(Math.abs(viewer.initialDistance/viewer.camera.position.distanceTo(viewer.controls.target)-.35)<.01,'Zoom min clamp');
  viewer.setView('anterior');check(parent.quaternion.angleTo(new THREE.Quaternion())<1e-8,'Preset did not clear rotation');
  viewer.resetManipulation();check(parent.position.length()===0,'Reset position failed');
  viewer.dispose();el.remove();
  return {highResolution:manifest.anatomicalContext.meshPath,triangles:brain.geometry.index.count/3,sourceCoordinates:true,scenarioPose:true,clipping:true,zoomLimits:true,reset:true,measurementsUnchanged:true};
 });
}
