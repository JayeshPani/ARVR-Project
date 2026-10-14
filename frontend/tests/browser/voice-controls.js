// Recognition events are simulated; real microphone/browser-service acceptance is separate.
async(page)=>{
 await page.addInitScript(()=>{
  window.SpeechRecognition=class {
   constructor(){window.testRecognition=this;this.aborted=false;}
   start(){this.onstart?.();} abort(){this.aborted=true;}
   emit(text,final=true){this.onresult?.({resultIndex:0,results:[{isFinal:final,0:{transcript:text}}]});}
  };
 });
 await page.goto('http://127.0.0.1:4173');
 await page.getByRole('button',{name:'explore',exact:true}).click();
 await page.getByRole('button',{name:'Enable voice controls',exact:true}).click();
 await page.evaluate(()=>window.testRecognition.emit('opacity 70 percent',false));
 if(await page.locator('#brain-opacity').inputValue()!=='30')throw new Error('Interim speech changed opacity');
 await page.evaluate(()=>window.testRecognition.emit('opacity 70 percent'));
 if(await page.locator('#brain-opacity').inputValue()!=='70')throw new Error('Final speech not applied');
 // The same finalized result must not be interpreted twice.
 await page.evaluate(()=>window.testRecognition.emit('opacity 10 percent'));
 if(await page.locator('#brain-opacity').inputValue()!=='70')throw new Error('Duplicate result replayed');
 await page.getByRole('button',{name:'Stop listening',exact:true}).click();
 await page.getByRole('button',{name:'Enable voice controls',exact:true}).click();
 await page.evaluate(()=>window.testRecognition.emit('cut coronal'));
 if(await page.locator('#cut-plane').inputValue()!=='coronal'||!await page.locator('#cut-enabled').isChecked())throw new Error('Cut not applied');
 await page.evaluate(()=>{window.oldSpeech=window.testRecognition;window.lateSpeech=window.testRecognition.onresult;});
 await page.getByRole('button',{name:'scenarios',exact:true}).click();
 await page.getByRole('button',{name:'Enable voice controls',exact:true}).waitFor();
 if(!await page.evaluate(()=>window.oldSpeech.aborted))throw new Error('Navigation left microphone active');
 await page.evaluate(()=>window.lateSpeech({resultIndex:1,results:[{}, {isFinal:true,0:{transcript:'opacity 0 percent'}}]}));
 if(await page.locator('#brain-opacity').inputValue()!=='70')throw new Error('Late speech changed new view');
 await page.getByRole('button',{name:'Enable voice controls',exact:true}).click();
 await page.evaluate(()=>window.testRecognition.emit('stop listening'));
 if(!await page.evaluate(()=>window.testRecognition.aborted))throw new Error('Voice stop failed');
 await page.getByRole('button',{name:'Enable voice controls',exact:true}).click();
 await page.getByRole('button',{name:'Enter AR',exact:true}).click();
 if(!await page.evaluate(()=>window.testRecognition.aborted))throw new Error('AR entry left viewer mic active');
 await page.getByRole('button',{name:'Exit AR',exact:true}).click();
 await page.getByRole('button',{name:'Enable voice controls',exact:true}).click();
 await page.evaluate(()=>window.testRecognition.onerror({error:'not-allowed'}));
 if(!await page.locator('[data-voice=status]').textContent().then(t=>t.includes('not-allowed')))throw new Error('Missing denial feedback');
 return {finalOnly:true,noReplay:true,settingsSynced:true,navigationCleanup:true,lateResultsIgnored:true,voiceStop:true,arEntryCleanup:true,permissionError:true};
}
