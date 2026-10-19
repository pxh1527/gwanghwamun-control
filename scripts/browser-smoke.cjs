'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:[
  '--no-sandbox','--disable-dev-shm-usage','--enable-webgl',
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
 ]});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const issues=[];
 page.on('pageerror',e=>issues.push(e.message));
 page.on('console',m=>{if(m.type()==='error')issues.push('console: '+m.text())});
 await page.goto('http://127.0.0.1:3000/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.__gwangEngineReady===true,{timeout:30000});
 await page.locator('#startPlay').click({timeout:10000});
 await page.waitForFunction(()=>window.__GWANG_DEBUG__?.player?.avatar?.visible===true,{timeout:12000});
 await page.waitForTimeout(2000);
 let onFoot=await page.evaluate(()=>{
  const d=window.__GWANG_DEBUG__,p=d.player,a=p.avatar,u=a.userData;
  return {
   visible:a.visible,human:!!u.humanBody,humanVisible:!!u.humanVisible,
   proxyVisible:!!u.torso?.visible,legsVisible:(u.legs||[]).some(x=>x.visible),
   animatedMeshes:(()=>{let n=0;u.humanBody?.traverse(x=>{if((x.isMesh||x.isSkinnedMesh)&&x.visible)n++});return n})(),
   root:[p.x,p.y,p.z],humanLocalPos:u.humanBody?.position.toArray(),phase:u.humanClipLabel,
   ringOnly:!!u.humanTeamRing?.visible&&!u.humanBody?.visible&&!u.torso?.visible
  }
 });
 console.log('Initial avatar',JSON.stringify(onFoot));
 if(!onFoot.visible || onFoot.ringOnly ||(!onFoot.humanVisible&&!onFoot.proxyVisible)){
  throw Error('Avatar invisible on foot: '+JSON.stringify(onFoot))
 }
 fs.mkdirSync('test-results',{recursive:true});
 await page.screenshot({path:'test-results/standing.png'});
 await page.keyboard.down('w');await page.waitForTimeout(1200);
 let walking=await page.evaluate(()=>{const d=window.__GWANG_DEBUG__,p=d.player,u=p.avatar.userData;
   return {avatarVisible:p.avatar.visible,world:[p.x,p.z],moving:p.moving,phase:u.humanClipLabel,rig:u.humanVisible,proxy:u.torso?.visible,ringOnly:!!u.humanTeamRing?.visible&&!u.humanBody?.visible&&!u.torso?.visible};
 });
 await page.screenshot({path:'test-results/walking.png'});
 await page.keyboard.up('w');await page.waitForTimeout(350);
 let stopped=await page.evaluate(()=>{const p=window.__GWANG_DEBUG__.player;return {moving:p.moving,world:[p.x,p.z],rig:p.avatar.userData.humanVisible}});
 console.log('Walking',walking,'Stopped',stopped);
 if(!walking.avatarVisible||walking.ringOnly||(!walking.rig&&!walking.proxy))throw Error('Walking character vanished: '+JSON.stringify(walking));
 if(!walking.moving)throw Error('W did not set moving true');
 if(stopped.moving)throw Error('W key release did not stop moving');
 await page.mouse.click(720,480);await page.waitForTimeout(60);
 const attack=await page.evaluate(()=>({serial:window.__GWANG_DEBUG__.player.attackSerial||0,clip:window.__GWANG_DEBUG__.player.avatar.userData.humanClipLabel}));
 console.log('Punch',attack);
 if(!attack.serial)throw Error('Mouse punch did not trigger');
 await page.screenshot({path:'test-results/punch.png'});
 await page.close();await browser.close();
 console.log('PASS: local avatar visible, animated in motion, stops on key release and punches.');
 if(issues.length)console.warn('Browser console errors:',issues.slice(0,15));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
