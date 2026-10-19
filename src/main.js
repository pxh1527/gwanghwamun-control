
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedModel } from 'three/addons/utils/SkeletonUtils.js';
window.__gwangEngineReady=false;
try{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];const clamp=THREE.MathUtils.clamp;const lerp=THREE.MathUtils.lerp;const rand=n=>(Math.sin(n*135.79+3.12)*43758.54%1+1)%1;
const TOOL_TYPES=['의자','나무','화분','바리케이드','팻말','가로등','상자'];let toolType='의자',lastHudTick=0,lastMapTick=0,lastPhysTick=0,rockCooldown=0,interactTarget=null,benchRest=0,localRole='guest',props=new Map(),rockShots=[],boardText='광화문 점령전 · 서로 존중하는 플레이',boardImage=null;const TEAM={blue:{name:'파랑',color:0x428bff,css:'#428bff',spawn:[-13,62]},red:{name:'빨강',color:0xf26368,css:'#f26368',spawn:[10,62]},green:{name:'초록',color:0x4abd82,css:'#4abd82',spawn:[-19,-112]},white:{name:'자유와혁신',color:0xf0f3f7,css:'#f2f7ff',spawn:[18,12]}};const TEAMS=Object.keys(TEAM);
const ZONES=[{id:'admiral',name:'이순신 동상',z:-43,x:-5.8,r:12},{id:'king',name:'세종대왕 동상',z:-96,x:-5.8,r:13},{id:'gate',name:'광화문 앞',z:-152,x:-5,r:13},{id:'square',name:'시민광장',z:32,x:-5,r:16}];
const zoneState=ZONES.map(()=>({owner:null,lead:null,progress:0}));let scores={blue:0,red:0,green:0,white:0};let team='blue',nick='플레이어',gender='male',hair=0,skin=0,hairColor=0,started=false,online=false,ws=null,selfId=null,lastSend=0,lastStateAt=0;let now=0,last=0,deadUntil=0,attackCooldown=0,hitFlash=0,toastTimer;let nearCar=null,inCar=null,freeCar=null,sticks={x:0,y:0,run:false};let keys={};const npcs=[],remotes=new Map(),cars=[],labels=[];
const PLAYER={x:0,y:0,z:62,heading:0,vy:0,vx:0,vz:0,hp:100,stamina:100,hunger:100,food:3,coins:0,branches:0,stones:0,weapons:{club:false,axe:false},weapon:'fist',maxHp:100,maxStamina:100,power:0,skillPoints:0,wellFedSeconds:0,aliveSeconds:0,stun:0,walk:0,attack:0,team:'blue',avatar:null,car:null,id:'self'};
const CAPTURE_PERCENT_PER_PERSON_PER_SECOND=1/300; // 5 minutes / player / 1 percent
const GROWTH_SECONDS=300;
const HUNGER_PER_SECOND=1/60; // HP 100 -> 99 in exactly 60 seconds (while alive)
const LOOT={club:{branches:2,stones:0,name:'나무 몽둥이'},axe:{branches:1,stones:2,name:'돌도끼'}};
function inventoryPacket(d){if(!d)return;for(const k of ['coins','branches','stones','food','hp','stamina','hunger','maxHp','maxStamina','power','skillPoints','aliveSeconds','wellFedSeconds'])if(typeof d[k]==='number')PLAYER[k]=d[k];if(d.weapons)PLAYER.weapons={...d.weapons};if(d.weapon)PLAYER.weapon=d.weapon;syncWeaponAppearance()}
let weaponDisplay=null;
function syncWeaponAppearance(){
 if(!PLAYER.avatar?.userData?.arms)return;
 const arm=PLAYER.avatar.userData.arms[1];if(weaponDisplay){arm.remove(weaponDisplay);weaponDisplay.traverse(o=>{if(o.geometry)o.geometry.dispose()});weaponDisplay=null}
 if(PLAYER.weapon==='fist')return;
 const g=new THREE.Group();arm.add(g);g.position.set(0,-.94,-.02);
 cylinder(0,-.62,-.06,.087,.12,1.25,mat(0x90603b),g,8);
 if(PLAYER.weapon==='club'){cylinder(0,-1.35,-.06,.17,.12,.54,mat(0x8d5830),g,9);}
 else{cube(0,-1.35,-.06,.7,.40,.26,mat(0x747d83),g);cube(-.39,-1.35,-.06,.17,.23,.26,mat(0xb1bec2),g)}
 weaponDisplay=g;
}
function craftWeapon(type){if(!LOOT[type])return;if(online){send({t:'craft',kind:type});return}const r=LOOT[type];if(PLAYER.branches<r.branches||PLAYER.stones<r.stones){toast('재료가 부족합니다');return}if(PLAYER.weapons[type]){toast('이미 가지고 있는 무기입니다');return}PLAYER.branches-=r.branches;PLAYER.stones-=r.stones;PLAYER.weapons[type]=true;PLAYER.weapon=type;syncWeaponAppearance();toast('⚒️ '+r.name+' 제작 완료!')}
function equipWeapon(type){if(type!=='fist'&&!PLAYER.weapons[type]){toast('먼저 무기를 제작하세요 (B)');return}PLAYER.weapon=type;syncWeaponAppearance();if(online)send({t:'equip',kind:type});toast('⚔️ '+(type==='fist'?'맨손':LOOT[type].name)+' 장착')}
function upgradeStat(stat){if(!['health','power','stamina'].includes(stat)||PLAYER.skillPoints<1){toast('성장 포인트가 부족합니다');return}if(online){send({t:'upgrade',stat});return}PLAYER.skillPoints--;if(stat==='health'){PLAYER.maxHp=Math.min(200,PLAYER.maxHp+20);PLAYER.hp=Math.min(PLAYER.maxHp,PLAYER.hp+20)}else if(stat==='power')PLAYER.power=Math.min(40,PLAYER.power+4);else{PLAYER.maxStamina=Math.min(200,PLAYER.maxStamina+15);PLAYER.stamina=Math.min(PLAYER.maxStamina,PLAYER.stamina+15)}toast('📈 능력치 상승!')}
function offlineSurvival(dt){if(!started||PLAYER.hp<=0)return;PLAYER.aliveSeconds+=dt;if(PLAYER.hunger>=20)PLAYER.wellFedSeconds+=dt;if(PLAYER.wellFedSeconds>=GROWTH_SECONDS){PLAYER.wellFedSeconds-=GROWTH_SECONDS;PLAYER.skillPoints++;toast('🌱 건강하게 5분 생존! 성장 포인트 +1')}}
function offlineKnockout(enemy){if(enemy.team!==team){PLAYER.coins+=25;toast('🪙 적군 제압! 25코인 획득')}}
function toast(s){const n=$('#notices');n.textContent=s;n.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove('show'),1800)}
function chat(name,text){let p=document.createElement('p'),b=document.createElement('b');b.textContent=name+': ';p.appendChild(b);p.appendChild(document.createTextNode(text));$('#chatLog').appendChild(p);$('#chatLog').scrollTop=$('#chatLog').scrollHeight;while($('#chatLog').childElementCount>35)$('#chatLog').firstChild.remove()}
function sendChat(){let t=$('#chatInput').value.trim().slice(0,120);if(!t)return;chat(nick,t);if(online)send({t:'chat',text:t});$('#chatInput').value='';$('#chatInput').blur()}$('#send').onclick=sendChat;$('#chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.stopPropagation();sendChat()}});
for(let t of TEAMS){let r=document.createElement('div');r.className='teamLine';r.innerHTML=`<span class="dot" style="background:${TEAM[t].css}"></span><span>${TEAM[t].name}</span><b id="sc_${t}">0</b>`;$('#teamRows').appendChild(r)}for(let [i,z] of ZONES.entries()){let r=document.createElement('div');r.className='zoneLine';r.innerHTML=`<div class="zoneTop"><span class="zoneIcon">⚑ ${z.name}</span><span id="zoneOwner${i}">중립</span></div><div class="track"><div class="fill" id="zoneFill${i}"></div></div>`;$('#zoneRows').appendChild(r)}
const scene=new THREE.Scene();scene.background=new THREE.Color(0xaed7ed);scene.fog=new THREE.FogExp2(0xaacbce,.00185);const renderer=new THREE.WebGLRenderer({antialias:!/Edg\//.test(navigator.userAgent),powerPreference:'high-performance',precision:'highp'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.05));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.48;renderer.outputColorSpace=THREE.SRGBColorSpace;$('#game').appendChild(renderer.domElement);
const gfxMessage=document.createElement('div');gfxMessage.id='graphicsStatus';gfxMessage.style.cssText='display:none;position:fixed;left:50%;top:12%;transform:translateX(-50%);z-index:99;max-width:520px;padding:16px 22px;background:#142d42ef;color:white;border:1px solid #6bece0;border-radius:12px;font:700 13px/1.7 system-ui,sans-serif;text-align:center;box-shadow:0 15px 35px #0008';document.body.appendChild(gfxMessage);
function showGraphicsStatus(text){gfxMessage.textContent=text;gfxMessage.style.display='block'}
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();showGraphicsStatus('⚠ 그래픽 장치 연결이 끊겼습니다. 잠시 후 자동 복구를 시도합니다. 계속 보이지 않으면 새로고침하세요.')});
renderer.domElement.addEventListener('webglcontextrestored',()=>{gfxMessage.style.display='none';resetCamera();renderer.setSize(innerWidth,innerHeight,false)});

const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.1,600);const cam={yaw:.15,pitch:.36,dist:12,drag:false,px:0,py:0};
// Apply yaw smoothing in angle space instead of lerping the camera *through* the avatar.
let orbitYaw=cam.yaw;
function resetCamera(){cam.yaw=PLAYER?.heading||0;orbitYaw=cam.yaw;cam.pitch=.36;cam.dist=12;cam.drag=false}
const hemi=new THREE.HemisphereLight(0xe7f4ff,0x7d9381,2.05);scene.add(hemi);const sun=new THREE.DirectionalLight(0xffe8c5,2.8);sun.position.set(-65,100,-85);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-135;sun.shadow.camera.right=135;sun.shadow.camera.top=200;sun.shadow.camera.bottom=-155;sun.shadow.camera.near=1;sun.shadow.camera.far=410;sun.shadow.bias=-.0003;scene.add(sun);const materialCache=new Map(),geometryCache=new Map();let mat=(color,roughness=0.88,metalness=0)=>{let key=color+'_'+roughness+'_'+metalness;if(!materialCache.has(key))materialCache.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));return materialCache.get(key)};const cachedGeo=(type,args,make)=>{let key=type+':'+args.join(':');if(!geometryCache.has(key))geometryCache.set(key,make());return geometryCache.get(key)};let buildingMat=mat(0xdde0da),dark=mat(0x293948),glass=mat(0x628eaa,.22,.36),gold=mat(0xb79c51,.55,.8),bronze=mat(0x59645d,.52,.79),wood=mat(0x804c40),leaf=mat(0x3f8e69),line=mat(0xe4e7dd);
function mesh(geo,material,parent=scene,x=0,y=0,z=0,cast=true){let m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=cast;m.receiveShadow=true;parent.add(m);return m}
function cube(x,y,z,w,h,d,m,parent=scene){return mesh(cachedGeo('box',[w,h,d],()=>new THREE.BoxGeometry(w,h,d)),m,parent,x,y,z)}function ball(x,y,z,r,m,parent=scene,seg=14){return mesh(cachedGeo('sphere',[r,seg,10],()=>new THREE.SphereGeometry(r,seg,10)),m,parent,x,y,z)}function cylinder(x,y,z,rt,rb,h,m,parent=scene,seg=12){return mesh(cachedGeo('cylinder',[rt,rb,h,seg],()=>new THREE.CylinderGeometry(rt,rb,h,seg)),m,parent,x,y,z)}
function canvasTexture(text,fg,bg,w=512,h=256,font='bold 57px sans-serif'){let c=document.createElement('canvas');c.width=w;c.height=h;let ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';let lines=text.split('\n');lines.forEach((l,i)=>ctx.fillText(l,w/2,h/2+(i-(lines.length-1)/2)*67,w-25));let t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function sign(parent,text,w,h,x,y,z,rot=0,fg='#fff',bg='#123d55'){let mt=new THREE.MeshStandardMaterial({map:canvasTexture(text,fg,bg),roughness:.78,side:THREE.DoubleSide});let s=mesh(new THREE.PlaneGeometry(w,h),mt,parent,x,y,z,false);s.rotation.y=rot;return s}
function citySurface(kind){
 const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
 let seed=kind==='asphalt'?119:kind==='grass'?211:319;
 const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
 x.fillStyle=kind==='asphalt'?'#565d64':kind==='grass'?'#648b5c':'#b5b1a7';x.fillRect(0,0,256,256);
 for(let i=0;i<18000;i++){
  const px=rnd()*256,py=rnd()*256,r=rnd();
  const a=kind==='asphalt'?(r>.5?'rgba(219,227,225,.13)':'rgba(18,27,31,.17)'):
   kind==='grass'?(r>.5?'rgba(158,194,112,.26)':'rgba(28,76,40,.25)'):
   (r>.5?'rgba(252,244,229,.2)':'rgba(53,59,62,.11)');
  x.fillStyle=a;x.fillRect(px,py,kind==='grass'?1+rnd()*3:1+rnd(),1+rnd()*2);
 }
 if(kind==='paving'){
  x.strokeStyle='rgba(37,45,49,.23)';x.lineWidth=2;
  for(let z=0;z<=256;z+=64){x.beginPath();x.moveTo(0,z);x.lineTo(256,z);x.stroke()}
  for(let z=0;z<256;z+=64)for(let j=0;j<=4;j++){let ax=j*64+(Math.floor(z/64)%2)*32;x.beginPath();x.moveTo(ax,z);x.lineTo(ax,z+64);x.stroke()}
 }
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
 t.repeat.set(...(kind==='asphalt'?[2.2,29]:kind==='grass'?[70,70]:[8,90]));
 return new THREE.MeshStandardMaterial({map:t,roughness:kind==='asphalt'?.93:.99,metalness:0});
}
const asphaltMaterial=citySurface('asphalt'),grassMaterial=citySurface('grass'),pavingMaterial=citySurface('paving');
function ground(){const groundMaterial=grassMaterial;groundMaterial.side=THREE.DoubleSide;const ground=mesh(new THREE.PlaneGeometry(900,900),groundMaterial,scene,0,-.18,0,false);ground.rotation.x=-Math.PI/2;ground.frustumCulled=false;ground.receiveShadow=false;const pl=mesh(new THREE.PlaneGeometry(27,333),mat(0xc2c6bf),scene,-8,-.12,-12,false);pl.rotation.x=-Math.PI/2;const road=mesh(new THREE.PlaneGeometry(23,450),asphaltMaterial,scene,28,-.13,-10,false);road.rotation.x=-Math.PI/2;const west=mesh(new THREE.PlaneGeometry(15,340),mat(0x9b9fa0),scene,-29,-.125,-10,false);west.rotation.x=-Math.PI/2;const pad=mesh(new THREE.PlaneGeometry(19,325),pavingMaterial,scene,-7,-.1,-10,false);pad.rotation.x=-Math.PI/2;
for(let x=-19;x<=4;x+=3){let strip=mesh(new THREE.PlaneGeometry(.024,324),mat(0x8e958e),scene,x,-.086,-10,false);strip.rotation.x=-Math.PI/2}for(let z=-165;z<=137;z+=3){let strip=mesh(new THREE.PlaneGeometry(27,.024),mat(0x979b96),scene,-8,-.083,z,false);strip.rotation.x=-Math.PI/2}
for(let x of [19,26.5,34.2])for(let z=-172;z<145;z+=10){let marking=mesh(new THREE.PlaneGeometry(.22,4.7),line,scene,x,-.107,z,false);marking.rotation.x=-Math.PI/2}for(let z of [-144,-30,50])for(let x=16;x<41;x+=2.4){let m=mesh(new THREE.PlaneGeometry(1.25,6),line,scene,x,-.103,z,false);m.rotation.x=-Math.PI/2}
for(let z=-160;z<142;z+=12){let tile=mesh(new THREE.PlaneGeometry(.45,1.7),mat(0xa9b2a3),scene,-8,-.072,z,false);tile.rotation.x=-Math.PI/2}for(let x of [14.8,41.3]){cube(x,.1,-10,.4,.3,341,mat(0xe3d4a9))}
// plaza landscaping strips and trees on western edge
for(let z=-130;z<112;z+=34){cube(-21,.18,z,2.5,.4,16,mat(0x9a9c8e));cube(-21,.43,z,2.13,.13,15.4,mat(0x5f9d64));for(let n=-1;n<=1;n++)tree(-21,.7,z+n*4,1.0)} }
const sceneryTreeLocations=[];function tree(x,y,z,s=1){sceneryTreeLocations.push([x,z]);cylinder(x,y+2.2*s,z,.23*s,.29*s,4.3*s,mat(0x795747),scene);for(let [dx,dy,dz,sc] of [[0,5.2,0,2.1],[1.2,4.1,-.4,1.45],[-1.2,4.55,.5,1.5]]){ball(x+dx*s,y+dy*s,z+dz*s,sc*s,mat(0x418a67),scene,10)}}
function cylinderBank(x,z){cube(x,.24,z,2,.48,4.3,mat(0x95988d));for(let n=-1;n<=1;n++)ball(x+.3,.94,z+n*1.1,.71,mat(0x4c9c70),scene,10)}
function buildings(){for(let side of [-1,1])for(let i=0;i<13;i++){let z=-164+i*24,randn=rand(i*9+side*47),h=21+randn*38,w=19+rand(i*20)*7;let x=side===1?58:-51;let body=cube(x,h/2,z,w,h,18,mat([0xc5d0d0,0xc3c9c6,0xdedbd1,0x98b4c0,0xc8c2bb][i%5]));body.castShadow=i%2===0;cube(x,h+.6,z,w+1.2,1.2,19,mat(0x697a7e));let frontage=side===1?x-w/2-.12:x+w/2+.12;let winMat=mat(i%2===0?0x588296:0x6a8991,.2,.48);for(let y=4;y<h-2;y+=5.8){for(let q=-6.0;q<=6;q+=6){cube(frontage,y,z+q,.09,1.85,1.65,winMat)}}if(i%3===0){cube(frontage,2,z, .24,3,11,mat(0x365d69));sign(scene,i%2?'카페 · 서울':'광화문 CITY',7,1.6,frontage+(side===1?-.2:.2),4,z,side===1?-Math.PI/2:Math.PI/2,'#ffffff','#28596d')}}
// landmark-adjacent architecture silhouettes
cube(-47,13,-46,24,26,30,mat(0xd5d5ca));cube(-47,27,-46,25,2,30,mat(0x758786));cube(-45,6,-91,22,12,25,mat(0xbcbfbd));cube(-45,13,-91,24,2,27,mat(0x586e79));
for(let x of [-27,12])for(let z=-155;z<115;z+=30){let h=cylinder(x,3.8,z,.11,.15,7.6,mat(0x697a81));cube(x,7.6,z,.25,.3,1.5,mat(0x5f7580));cube(x,7.45,z+.8,1,.24,.6,mat(0xffe9b5))}}
function gate(){let root=new THREE.Group();root.position.set(-5,0,-170);scene.add(root);const stone=mat(0xaaa99e),red=mat(0x8e3f35),mint=mat(0x27534a),roof=mat(0x213f3b),plaster=mat(0xe5d8b9);cube(0,.7,0,47,1.4,15,stone,root);for(let x of [-19,-14,-9,-4,4,9,14,19])for(let z of [-4.6,4.6])cylinder(x,5.45,z,.41,.47,8.1,red,root);cube(0,9.3,0,47,2.1,15,plaster,root);cube(0,11.4,0,51,2.1,17,mint,root);let bigRoof=mesh(new THREE.ConeGeometry(1,1,4),roof,root,0,0,0);root.remove(bigRoof);for(let layer of [0,1]){let yy=layer?19.3:11.8,ww=layer?43:53,dd=layer?12:20;let roofBase=cube(0,yy,0,ww,1,dd,roof,root);for(let s of [-1,1]){let slope=cube(0,yy+.9,s*dd*.26,ww,1.2,dd*.62,roof,root);slope.rotation.x=s*.25}for(let x=-ww/2+1;x<=ww/2-1;x+=2.4){cube(x,yy+.22,-dd/2-.3,.24,.4,.2,mat(0x273b33),root);cube(x,yy+.22,dd/2+.3,.24,.4,.2,mat(0x273b33),root)}}cube(0,15.1,0,44,5,13,plaster,root);for(let x=-18;x<20;x+=4)for(let z of [-5,5])cylinder(x,15.2,z,.29,.3,5,red,root);for(let x of [-12,0,12]){cube(x,4.6,8,7.4,6.2,.38,mat(0x322f2a),root);cube(x,8.7,8.05,7.4,.6,.5,red,root)}sign(root,'광 화 문',11,2,0,8.7,8.35,0,'#efe1ad','#174b37');for(let x of [-24,24]){cube(x,3.7,0,5,6,13,stone,root)}for(let i=0;i<14;i++){cube(-5,.3,15+i*.6,20,.14,.34,mat(0xb8b3aa))}
}

// Cultural landmark enhancement: Gwanghwamun's traditional tiled roof, dancheong bands,
// brick palace wall and spacious forecourt. Stylized original geometry, not a survey model.
function improveGwanghwamun(){
 const root=new THREE.Group();root.position.set(-5,0,-170);scene.add(root);
 const tile=mat(0x233c39,.68), tile2=mat(0x35544d,.73), trim=mat(0x2d8272),trimGold=mat(0xbaac72),red=mat(0x9f4b3e),stone=mat(0xc2bcaa);
 // Raised eaves + repeating layered roof tiles which remain fast due to shared geometry instancing.
 for(let layer=0;layer<2;layer++){
  const y=layer?21.0:13.3, span=layer?39:48;
  for(let x=-span/2;x<=span/2;x+=1.42){
   for(let z of [-7.5,7.5]){
    const zval=layer?z*.83:z;
    let ridge=cube(x,y+Math.pow(Math.abs(x)/(span/2),2)*1.0,zval,.48,.3,.75,((Math.round(x*2)+layer)%3===0)?tile2:tile,root);
    ridge.rotation.z=(x>0?1:-1)*.08;
   }
  }
  for(let xx of [-span/2,span/2])for(let zz of [-8.6,8.6])ball(xx,y+.85,zz,.51,trimGold,root,8);
  cube(0,y-.32,8.7,span, .21,.32, trim,root);
  cube(0,y-.56,8.82,span,.14,.30,trimGold,root);
 }
 // Colorful painted dancheong beams framing the authentic gate facade.
 for(let y of [7.7,8.25,15.0,16.0]){
  cube(0,y,7.5,42,.17,.36,y%2<1?trim:trimGold,root);
 }
 for(let x=-17;x<=17;x+=4){cube(x,8.8,8.0,.31,1.0,.32,red,root)}
 // Palace stone wall behind gate and watch roofs; plaza remains traversable along central approach.
 for(let side of [-1,1]){
  cube(side*48,3,-178,43,6.0,4.0,stone,scene);
  cube(side*48,6.22,-178,46,.46,4.7,tile2,scene);
  for(let a=0;a<12;a++)cube(side*48-19+a*3.4,6.52,-178,1.42,.48,4.8,tile,scene);
 }
 // Historic Korean courtyard lantern-style fixtures and tactile plaza pattern.
 for(let x of [-23,12])for(let z of [-150,-119]){
  cylinder(x,1.5,z,.22,.32,3,stone,scene);
  cube(x,3.07,z,1.2,.42,1.2,tile,scene);
  cube(x,2.75,z,.92,.42,.92,mat(0xffe1a3),scene);
  cube(x,3.52,z,1.5,.17,1.5,tile2,scene);
 }
}
improveGwanghwamun();

function pedestal(x,z,baseText){let root=new THREE.Group();root.position.set(x,0,z);scene.add(root);cube(0,.6,0,10,1.2,8,mat(0x8a918f),root);cube(0,1.6,0,8.5,1,7.1,mat(0xb0b0a4),root);cube(0,2.5,0,7.7,.9,6.4,mat(0x90948b),root);sign(root,baseText,6.7,1.0,0,1.74,3.61,0,'#2d3d3c','#bbb9a9');return root}
function statueKing(){let r=pedestal(-5.8,-96,'세 종 대 왕');cylinder(0,5.2,.1,1.4,1.7,4.3,gold,r);ball(0,8.4,-.2,1.04,gold,r,14);cube(0,5.2,.28,3.7,1.45,2.7,gold,r);cube(0,4,.9,4.2,1.25,2.5,gold,r);for(let sx of [-1,1]){cylinder(sx*1.7,6.4,-.1,.46,.56,2.1,gold,r);ball(sx*1.7,5.42,-.25,.49,gold,r)}cube(0,5.7,2.4,2,.25,1.3,mat(0xdbbc75),r);for(let i=0;i<4;i++)cube(-2.4,4+i*.52,1.95,.45,.16,2,gold,r);cylinder(0,8.75,-.4,1.16,.91,.6,gold,r);}
function statueAdmiral(){let r=pedestal(-5.8,-43,'이 순 신');cube(0,6.4,0,2.1,6.4,2,bronze,r);cube(0,5.1,.1,2.7,2.3,1.95,bronze,r);cylinder(0,9.9,-.1,.85,.9,1.25,bronze,r);cube(0,10.7,-.12,1.75,.5,1.2,bronze,r);cube(-1.45,8.2,-.1,.66,3.6,.66,bronze,r);cube(1.45,8.2,-.2,.66,3.7,.66,bronze,r);cylinder(1.73,10.8,-.22,.13,.13,6.7,gold,r);cube(1.73,14.2,-.2,.9,.35,.28,gold,r);for(let i=0;i<4;i++)cube(0,7.6-i*.55,-1.13,1.75,.1,.1,mat(0x7d8378),r)}
function plaza(){ground();buildings();gate();statueKing();statueAdmiral();for(let z=-133;z<116;z+=24){cylinderBank(6.9,z);if(z>-118)tree(9,0,z+10,.95)}for(let z of [-74,-58,-23,0,26,52,79]){cube(-19,.3,z,1.7,.6,2.2,mat(0xc6bfac));cube(-19,.8,z,1.5,.35,2,mat(0x6b9d75))}
// four luminous control circles with banners
for(let [i,z] of ZONES.entries()){let ring=new THREE.Mesh(new THREE.TorusGeometry(z.r,.17,7,100),new THREE.MeshBasicMaterial({color:0xe1c57a,transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;ring.position.set(z.x,.13,z.z);scene.add(ring);z.ring=ring;let beacon=new THREE.Group();beacon.position.set(z.x+z.r-1,0,z.z);scene.add(beacon);cylinder(0,3,0,.12,.15,6,mat(0xc4c8c5),beacon);cube(.67,5.05,0,1.3,.8,.10,mat(0xd7c485),beacon);z.beacon=beacon;}
// temporary event stage and Korean road furniture
cube(-26,1.2,52,12,2.3,9,mat(0x52637a));cube(-26,6.5,52,13,.5,10,mat(0x385a61));for(let x of [-31,-21])for(let z of [48,56])cylinder(x,4,z,.22,.22,7,mat(0x536c74));sign(scene,'광화문 점령전\n시민광장',9,3,-26,3.8,56.1,0,'#fff','#15475c');for(let z of [-125,-65,-8,55]){sign(scene,'광화문광장',8,2,-22,3.3,z,Math.PI/2,'#ffffff','#3e6d69')} }
plaza();

// Reference: Seoul Metropolitan Government Gwanghwamun Square guide (north at negative Z).
// Place identities and street/greenery proportions are simplified game geometry, not photogrammetry.
function buildGwanghwamunSiteDetails(){
 const glasswall=new THREE.MeshStandardMaterial({color:0x64899c,roughness:.15,metalness:.48});
 const lightGlass=new THREE.MeshStandardMaterial({color:0xaac9d0,roughness:.18,metalness:.28});
 const limestone=mat(0xcac5b6), trim=mat(0x475d65),steel=mat(0x596674),woodgrain=mat(0x806447);
 function civicBuilding(label,x,z,w,h,d,{body=0xc7d0cd,accent=0x3c4d55,columns=0,glass=false}={}){
  const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);
  cube(0,h/2,0,w,h,d,glass?glasswall:mat(body),g);
  cube(0,h+.45,0,w+1,.9,d+1,mat(accent),g);
  const doorZ=z<-30?d/2+.15:d/2+.15;
  cube(0,2.55,doorZ,Math.min(8,w*.55),5.1,.12,glasswall,g);
  for(let floor=4;floor<h-1;floor+=4.8){
   cube(0,floor,d/2+.09,w-1,.1,.23,mat(accent),g);
   for(let xj=-w/2+1.8;xj<w/2-1;xj+=3.15){cube(xj,floor+1.6,d/2+.13,1.65,2.3,.12,lightGlass,g)}
  }
  if(columns>0){for(let col=0;col<columns;col++){
   const xx=(col-(columns-1)/2)*(w-3)/Math.max(1,columns-1);
   cube(xx,3.55,d/2+.8,.62,7.1,.65,limestone,g);
  }}
  sign(g,label,Math.min(w-2,15),1.3,0,7.6,d/2+1.2,0,'#eef7f4','#304958');
  return g;
 }
 // Western: Seoul Government Complex, Sejong Center, Sejongno Park, Hyundai Marine.
 civicBuilding('정부서울청사',-52,-133,29,39,23,{body:0xbabdb8,accent:0x727c7b,columns:8});
 civicBuilding('세종문화회관',-52,-66,31,29,26,{body:0xc3bab0,accent:0x77675c,columns:6});
 civicBuilding('현대해상 광화문',-55,36,25,38,19,{glass:true,accent:0x526c74});
 // Eastern: National Museum of Korean Contemporary History, KT, and Kyobo Building.
 civicBuilding('대한민국역사박물관',55,-103,32,34,25,{body:0xbec3be,accent:0x8b8d87,columns:7});
 civicBuilding('KT 광화문',57,-33,30,48,24,{glass:true,accent:0x65747c});
 civicBuilding('교보빌딩',56,44,35,42,26,{body:0xb6bbb3,accent:0x676c68,columns:9});
 // Gwanghwamun Woldae (restored ceremonial stone terrace) and palace frontage.
 cube(-5,.36,-154,30,.72,29,limestone);
 for(const z of [-155,-151,-147,-143,-139])cube(-5,.73,z,23,.16,.7,mat(0xd7d4c6));
 for(const xx of [-20,10])for(const zz of [-158,-151])cube(xx,.95,zz,2.3,1.9,2.3,mat(0xc6c6b7));
 // Western-side long greenery belt and path, like the official square 2022+.
 for(let z=-137;z<111;z+=24){
  cube(-31,.13,z,7.8,.26,15.6,mat(0x8a9b82));
  cube(-31,.27,z,6.4,.1,14.5,mat(0x6e976e));
  for(const dx of [-2.1,2.1])tree(-31+dx,0,z+(dx>0?3:-2),.7);
  // curved-looking seating pods
  for(let i=0;i<2;i++)cube(-26,.42,z+i*2,1.6,.32,.58,woodgrain);
 }
 // Reflecting fountains: distinctive Admiral Yi and King Sejong square features.
 for(const [xx,zz,ww,ll] of [[-6,-32,11,9],[-6,-106,12,6]]){
  cube(xx,.12,zz,ww,.24,ll,mat(0xb5bcb8));
  cube(xx,.255,zz,ww-.55,.05,ll-.55,mat(0x78bacc,.14,.14));
  for(let k=-3;k<=3;k++){
   let spray=cylinder(xx+k*.94,.65,zz,.026,.045,.85+Math.abs(k)*.07,mat(0xc9ecf3),scene,6);
   spray.castShadow=false;
  }
 }
 // Promenade features: paths, wall lights, small reflecting structures.
 for(const z of [-116,-82,-49,-16,15,48,80]){
  cube(-19,.085,z,6,.17,2,limestone);
  cube(-35,1.15,z,1.7,2.3,1.4,steel);
  cube(-35,2.65,z,1.9,.15,1.6,lightGlass);
 }
 // Anchor visual signage; users will find the named real-side facades from ground level.
 sign(scene,'광화문광장 · 세종대로',20,1.7,5,8,-10,Math.PI/2,'#e9f7f7','#2b565d');
}
buildGwanghwamunSiteDetails();
// Static-only batching: fewer GPU draw calls without altering the avatar, vehicle or editing scene graph.
function batchStaticScene(){scene.updateMatrixWorld(true);const batches=new Map();scene.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||!o.geometry||!o.material||Array.isArray(o.material)||o.material.map||o===ZONES[0].ring||o===ZONES[1].ring||o===ZONES[2].ring||o===ZONES[3].ring)return;const parent=o.parent;if(!parent||parent.userData?.interactive||o.userData?.interactive)return;let key=o.geometry.uuid+':'+o.material.uuid;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(o)});let merged=0;for(let batch of batches.values()){if(batch.length<3)continue;const ins=new THREE.InstancedMesh(batch[0].geometry,batch[0].material,batch.length);ins.castShadow=false;ins.receiveShadow=false;ins.frustumCulled=false;batch.forEach((obj,i)=>{ins.setMatrixAt(i,obj.matrixWorld);obj.parent.remove(obj)});ins.instanceMatrix.needsUpdate=true;ins.computeBoundingSphere();scene.add(ins);merged+=batch.length}console.info('Static instancing:',merged,'meshes batched')}
batchStaticScene();
const edgeBrowser=/Edg\//.test(navigator.userAgent);let qualityMode='auto',adaptiveRatio=edgeBrowser?.68:.88,lastPerfTune=0,qualityAvgFPS=60;
if(edgeBrowser)document.documentElement.classList.add('edge-perf');
function qualitySetting(q){
 if(!['auto','low','medium','high'].includes(q))q='auto';
 qualityMode=q;
 const ratio=q==='auto'?adaptiveRatio:q==='low'?.60:q==='medium'?.92:1.25;
 renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));
 renderer.setSize(innerWidth,innerHeight,false);
 const shadows=q==='high';renderer.shadowMap.enabled=shadows;sun.castShadow=shadows;
 if(shadows){sun.shadow.mapSize.set(1024,1024);sun.shadow.map?.dispose();sun.shadow.map=null}
 $('#quality').value=q;
 try{sessionStorage.setItem('gwang_quality',q)}catch{}
}
qualitySetting((()=>{try{return sessionStorage.getItem('gwang_quality')}catch{return null}})()||'auto');$('#quality').onchange=e=>qualitySetting(e.target.value);
// optional real CC0 Kenney building glb, from documented CC0 public model mirror
const assetLoader=new GLTFLoader();let loadedCC0=0;
// Quaternius Animated Human CC0 — real rig, authoritative model file bundled in GitHub assets.
// Sandboxed HTML previews are often served at a different HTTPS origin. A root-relative URL
// points to that origin and returns 404. Retry GitHub CDN URLs, not just file://.
let humanGltf=null, humanLoadPromise=null, humanLoadReady=false;
const RESOURCE_BASE='https://raw.githubusercontent.com/pxh1527/gwanghwamun-control/main/';
const RESOURCE_CDN='https://cdn.jsdelivr.net/gh/pxh1527/gwanghwamun-control@main/';
function resourceCandidates(path){
 const origin=location.origin;
 const out=[];
 if(['http:','https:'].includes(location.protocol) && !/chatgpt|sandbox|openai|usercontent|files\.oai/i.test(location.host)){
   out.push(new URL(path,location.href).href);
 }
 out.push(RESOURCE_CDN+path,RESOURCE_BASE+path);
 return [...new Set(out)];
}
function loadGLBWithRetry(path,onSuccess,onFailure){
 const urls=resourceCandidates(path);let attempt=0;
 function next(){if(attempt>=urls.length){onFailure?.();return}
   const url=urls[attempt++];assetLoader.load(url,onSuccess,undefined,e=>{console.warn('GLB retry',attempt,path,e?.message||e);next()});
 }next();
}
// All actors — the local player, NPCs and online players — share ONE animation rig.
// Their skinned scenes are cloned independently so SkeletonUtils can animate each without cross-contamination.
// Compute Quaternius torso yaw in BODY-LOCAL coordinates. The rig's root
// orientation differs in its exported animation clips, so one static yaw
// correction produces sideways/backwards running.
function alignHumanTorsoToForward(u,instant=false,dt=1/60){
 const body=u.humanBody;
 if(!body)return 0;
 const left=body.getObjectByName('LeftShoulder'),right=body.getObjectByName('RightShoulder');
 if(!left||!right)return body.rotation.y;
 body.updateWorldMatrix(true,true);
 const a=body.worldToLocal(left.getWorldPosition(new THREE.Vector3()));
 const b=body.worldToLocal(right.getWorldPosition(new THREE.Vector3()));
 // Anatomical left - right vector: +X when humanoid faces +Z.
 const lateral=a.sub(b);
 // The torso forward basis is the 90° rotated shoulder vector (-dz,dx).
 const fx=-lateral.z,fz=lateral.x;
 if(Math.hypot(fx,fz)<.015)return body.rotation.y;
 const goal=Math.atan2(fx,-fz);
 const delta=Math.atan2(Math.sin(goal-body.rotation.y),Math.cos(goal-body.rotation.y));
 body.rotation.y+=delta*(instant?1:Math.min(1,dt*15));
 return body.rotation.y;
}
function upgradeAvatarToHuman(actor){
 if(!humanGltf||!actor?.avatar||actor.avatar.userData.humanBody||actor.avatar.userData.humanFailed)return false;
 try {
 const root=actor.avatar,body=cloneSkinnedModel(humanGltf.scene);
 body.name='CC0_Animated_Human';
 body.traverse(o=>{if(o.isMesh||o.isSkinnedMesh){o.frustumCulled=false;o.castShadow=false;o.receiveShadow=true}});
 body.updateMatrixWorld(true);
 let bounds=new THREE.Box3().setFromObject(body);
 let height=bounds.getSize(new THREE.Vector3()).y;
 if(!Number.isFinite(height)||height<.01){console.warn('Invalid human bounds',height);return false}
 const targetHeight=3.35;
 body.scale.setScalar(targetHeight/height);
 body.rotation.set(0,0,0);
 body.updateMatrixWorld(true);
 bounds.setFromObject(body);
 let c=bounds.getCenter(new THREE.Vector3());
 body.position.set(-c.x,-bounds.min.y,-c.z);
 root.add(body);
 root.updateMatrixWorld(true);
 const u=root.userData;
 u.humanBody=body;
 u.humanMixer=new THREE.AnimationMixer(body);
 u.humanActions={};
 for(const clip of humanGltf.animations||[]){
  const action=u.humanMixer.clipAction(clip);
  const name=clip.name.toLowerCase();
  if(name==='punch'){
   action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
   action.timeScale=Math.max(1,clip.duration/.3);
  }else if(name==='run')action.timeScale=Math.max(.85,clip.duration/.68);
  else if(name==='walk')action.timeScale=Math.max(.8,clip.duration/1.05);
  u.humanActions[name]=action;
 }
 u.humanAttackSerial=-1;
 const idle=u.humanActions.idle||Object.values(u.humanActions)[0];
 if(idle){idle.reset().play();u.humanActive=idle;u.humanMixer.update(1/60)}
 // Quaternius animations rotate the Hips differently in Idle/Walk/Run.
 // The toes can point sideways while stepping, so compute forward from the
 // LEFT/RIGHT SHOULDER BASIS for each *animated* pose instead.
 // The heading of the avatar root always represents movement into -Z.
 const correction=alignHumanTorsoToForward(u,true);
 const correctBounds=new THREE.Box3().setFromObject(body);
 const center=correctBounds.getCenter(new THREE.Vector3());
 body.position.x-=center.x;
 body.position.z-=center.z;
 body.position.y-=correctBounds.min.y;
 u.humanFaceDebug={correctionDeg:Math.round(correction*180/Math.PI),technique:'animated-shoulder-basis'};
 // Procedural proxy has the wrong proportions; hide it for ALL human actors.
 if(u.torso)u.torso.visible=false;
 if(u.legs)u.legs.forEach(leg=>leg.visible=false);
 // Subtle colored team band below the avatar, not a blocky full-body replacement.
 if(actor.team&&TEAM[actor.team]){
  const ringGeo=new THREE.RingGeometry(.62,.72,24);
  const band=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:TEAM[actor.team].color,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));
  band.rotation.x=-Math.PI/2;band.position.y=.055;band.renderOrder=2;
  root.add(band);u.humanTeamRing=band;
 }
 u.humanReady=true;
 return true;
 }catch(err){console.error('Human upgrade failed',actor?.id||actor?.name,err);gwangReportError('인체형 적용 실패: '+(err?.message||err));const u=actor?.avatar?.userData;if(u){u.humanFailed=true;if(u.humanBody){u.humanBody.removeFromParent();u.humanBody=null}if(u.torso)u.torso.visible=true;if(u.legs)for(const leg of u.legs)leg.visible=true}return false}
}
function upgradePlayerToHuman(){
 if(!PLAYER?.avatar||!started)return;
 if(upgradeAvatarToHuman(PLAYER)){
  $('#loadStatus').textContent='✓ 인체형 모델: 주인공·NPC 동일 적용';
  $('#humanStatus').textContent='3D 인체형: 전체 캐릭터 적용';
  $('#humanStatus').style.color='#7ef6d6';
 }
}
function upgradeAllHumans(){
 if(!humanGltf)return;
 if(started)upgradePlayerToHuman();
 for(const n of npcs)upgradeAvatarToHuman(n);
 for(const p of remotes.values())upgradeAvatarToHuman(p);
 $('#humanStatus').textContent='3D 인체형: 주인공·NPC 공통 모델 준비 완료';
}
function startLoadingHuman(){
 $('#humanStatus').textContent='3D 인체형: 다운로드 중…';
 loadGLBWithRetry('assets/characters/human_animated.glb',gltf=>{
  if(!gltf.animations?.length){$('#humanStatus').textContent='3D 인체형: 애니메이션 없음';return}
  humanGltf=gltf;humanLoadReady=true;
  try{upgradeAllHumans()}catch(err){console.error('Human batch fallback',err);gwangReportError('인체형 일괄 적용 실패: '+(err?.message||err))}
 },()=>{
  $('#humanStatus').textContent='3D 인체형 로딩 실패 · 네트워크/모델 주소 확인';
  console.error('Human GLB failed at all asset sources');
 });
}
startLoadingHuman();
function animateHumanAvatar(p,dt){
 const u=p.avatar?.userData;if(!u?.humanBody)return false;
 try {
 const actions=u.humanActions;
 const phase=p.attack>0?'punch':p.y>.15?'jump':p.moving?(p.sprinting?'run':'walk'):'idle';
 const next=actions[phase]||actions.idle||Object.values(actions)[0];
 const serial=p.attackSerial||0;
 if(phase==='punch' && u.humanAttackSerial!==serial){
  u.humanAttackSerial=serial;
  if(next){next.stop();next.reset().setEffectiveWeight(1).play();
   if(u.humanActive&&u.humanActive!==next)u.humanActive.fadeOut(.07);
   u.humanActive=next;}
 }else if(next&&next!==u.humanActive){
  next.reset().setEffectiveWeight(1).play();
  if(u.humanActive)next.crossFadeFrom(u.humanActive,phase==='idle'?.085:.095,true);
  u.humanActive=next;
 }
 u.humanMixer.update(dt);
 alignHumanTorsoToForward(u,false,dt);
 if(p.attack>0)p.attack=Math.max(0,p.attack-dt);
 return true;
 }catch(err){console.error('Human animation failed',p?.id,err);gwangReportError('인체형 모션 오류: '+(err?.message||err));if(u.humanBody){u.humanBody.visible=false;u.humanBody=null}if(u.torso)u.torso.visible=true;if(u.legs)for(const leg of u.legs)leg.visible=true;u.humanFailed=true;return false}
}

function loadCC0Building(url,x,z,targetHeight){assetLoader.load(url,(g)=>{let model=g.scene;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());if(size.y<.001)return;model.scale.setScalar(targetHeight/size.y);bounds.setFromObject(model);let center=bounds.getCenter(new THREE.Vector3());model.position.set(x-center.x,-bounds.min.y,z-center.z);scene.add(model);loadedCC0++;$('#loadStatus').textContent='✓ CC0 건물 3D 에셋 '+loadedCC0+'개 불러옴';},undefined,()=>{$('#loadStatus').textContent='기본 맵 준비 완료 · 외부 3D 모델은 인터넷 연결 필요';});}
loadGLBWithRetry('assets/buildings/building-d.glb',g=>{const model=g.scene;const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3());if(size.y>.1){model.scale.setScalar(27/size.y);bounds.setFromObject(model);const cen=bounds.getCenter(new THREE.Vector3());model.position.set(55-cen.x,-bounds.min.y,-13-cen.z);scene.add(model)}},()=>{});
loadGLBWithRetry('assets/buildings/building-n.glb',g=>{const model=g.scene;const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3());if(size.y>.1){model.scale.setScalar(28/size.y);bounds.setFromObject(model);const cen=bounds.getCenter(new THREE.Vector3());model.position.set(-54-cen.x,-bounds.min.y,30-cen.z);scene.add(model)}},()=>{});
// Kenney Car Kit models are CC0-1.0. The verified filenames are from the
// public tge-assets catalog. These external downloads are optional: the fully
// driveable transparent-window fallback always remains if the CDN is blocked.
const KENNEY_ASSET_HOST=location.protocol==='file:'?'https://raw.githubusercontent.com/pxh1527/gwanghwamun-control/main/assets/vehicles/':'/assets/vehicles/';
let kenneyCarsLoaded=0;
function applyKenneyCarAsset(car,model){
 // Distinct GLB models load into a separate group; the driver and cabin never get cleared.
 if(!car||!model)return;
 const instance=model.clone(true);
 let bbox=new THREE.Box3().setFromObject(instance),sz=bbox.getSize(new THREE.Vector3());
 if(!Number.isFinite(sz.x)||sz.x<.001||sz.y<.001||sz.z<.001)return;
 // Kenney Car Kit sedan and SUV front-wheel axle is at local +Z.
 // The visual vehicle holder is rotated PI (procedural cars were built facing -Z),
 // so rotate the GLB back PI to make its real front wheels point +Z in world space.
 instance.rotation.y=0; // Kenney front wheels/bonnet at +Z: exactly vehicle +Z
 bbox.setFromObject(instance);sz=bbox.getSize(new THREE.Vector3());
 instance.scale.setScalar(Math.min(2.7/sz.x,2.23/sz.y,5.1/sz.z));
 bbox.setFromObject(instance);const center=bbox.getCenter(new THREE.Vector3());
 instance.position.set(-center.x,-bbox.min.y,-center.z);
 car.visual.add(instance);car.assetBody=instance;
 // Do not hide the whole fallback cabin: glass + driver must remain visible.
 // Keep the shell while user uses real assets, because it has functioning see-through windows.
 instance.visible=true;
 car.fallbackShell.visible=false;
 instance.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;o.frustumCulled=false;
   if(/glass|window|windscreen|windshield/i.test(o.name)&&o.material){
      o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.3;o.material.depthWrite=false;
   }
 }});
 kenneyCarsLoaded++;
 $('#loadStatus').textContent='✓ CC0 차량 3D 모델 '+kenneyCarsLoaded+'대 적용 · 유리창/운전자 표시';
}
function loadKenneyCarModels(){
 const modelNames=['sedan','suv','sedan','sedan','suv','suv'];
 modelNames.forEach((name,i)=>loadGLBWithRetry('assets/vehicles/'+name+'.glb',
    gltf=>applyKenneyCarAsset(cars[i],gltf.scene),
    ()=>{console.info('CC0 car model retry exhausted',name)}));
}
// Loaded only after car objects are created (below).
// avatar: deliberately faces LOCAL -Z; rotation follows heading, not camera position
const SKINS=[0xf3c6a6,0xc59570,0x8b5e42],HAIRS=[0x20252a,0x6b4434,0xe0b978];
function avatarData(d){return {team:d.team||'blue',gender:d.gender||'male',hair:Math.floor(d.hair||0),skin:Math.floor(d.skin||0),hairColor:Math.floor(d.hairColor||0)}}
function makeAvatar(d){d=avatarData(d);let root=new THREE.Group();let torso=new THREE.Group();root.add(torso);const coat=mat(TEAM[d.team].color),pants=mat(d.team==='white'?0x384355:0x293647),shoe=mat(0xf3f0e8),skinmat=mat(SKINS[d.skin]||SKINS[0]),hm=mat(HAIRS[d.hairColor]||HAIRS[0]);let narrow=d.gender==='female'?0.84:1.04;let body=cube(0,1.61,0,narrow,1.42,.53,coat,torso);if(d.gender==='female')cube(0,.9,0,1.15,.34,.6,coat,torso);let neck=cylinder(0,2.44,0,.14,.14,.25,skinmat,torso);const head=new THREE.Group();head.position.set(0,2.85,0);torso.add(head);let skull=ball(0,0,0,.51,skinmat,head,24);let haircap=ball(0,.29,.045,.54,hm,head,22);haircap.scale.set(1,.51,1);for(let side of [-1,1]){ball(side*.16,.20,-.41,.19,hm,head,11);ball(side*.43,-.015,0,.115,skinmat,head,10)}
if(d.hair===1){let t=cube(.22,.42,-.34,.28,.2,.55,hm,head);t.rotation.z=.31}else if(d.hair===2){for(let side of [-1,1]){let long=ball(side*.43,-.32,.17,.23,hm,head,12);long.scale.y=2.4}}else if(d.hair===3){for(let i=0;i<12;i++){let a=i*2*Math.PI/12;ball(Math.cos(a)*.36,.41,Math.sin(a)*.35,.19,hm,head,10)}}
for(let side of [-1,1]){let eye=ball(side*.177,.03,-.467,.091,mat(0xfffcf8),head,14);eye.scale.set(1,.80,.35);ball(side*.177,-.001,-.512,.044,mat(0x222b33),head,12);let brow=cube(side*.177,.165,-.475,.21,.03,.045,hm,head);brow.rotation.z=side*.08}
ball(0,-.11,-.502,.095,skinmat,head,12).scale.set(.8,1.15,.67);cube(0,-.274,-.45,.19,.035,.024,mat(0x965d57),head);
const arms=[],legs=[];for(let s of [-1,1]){let arm=new THREE.Group();arm.position.set(s*(.55*narrow+.08),2.2,0);torso.add(arm);cube(0,-.43,0,.29,.87,.32,coat,arm);ball(0,-.9,-.01,.18,skinmat,arm);arms.push(arm);let leg=new THREE.Group();leg.position.set(s*.29,.91,0);root.add(leg);cube(0,-.48,0,.39,.96,.43,pants,leg);cube(0,-.97,-.12,.43,.18,.69,shoe,leg);legs.push(leg)}
if(d.team==='white'){const badge=sign(torso,'자유와혁신\nYOON AGAIN',.86,.48,0,1.75,-.283,Math.PI,'#192634','#f3f5f3');badge.material.depthWrite=false;ball(-.29,2.1,-.29,.09,mat(0x2748af),torso)}else{const patch=sign(torso,TEAM[d.team].name,.7,.23,0,1.78,-.284,Math.PI,'#ffffff','#315068')}
root.traverse(child=>{if(child.isMesh){child.frustumCulled=false;child.matrixAutoUpdate=true;}});
root.visible=true;root.matrixAutoUpdate=true;
const shadow=mesh(new THREE.CircleGeometry(.67,22),new THREE.MeshBasicMaterial({color:0x102c31,transparent:true,opacity:.18,depthWrite:false}),root,0,.023,0,false);shadow.rotation.x=-Math.PI/2;shadow.frustumCulled=false;root.userData={head,torso,arms,legs,data:d,shadow};return root}
function addNPC(i){let t=TEAMS[i%4];let x=-17+rand(i+24)*22,z=-145+rand(i*7+63)*240;// NPCs stand at designated sidewalks and no longer march between control points.
 x=i%2===0?-35:11;z=-110+Math.floor(i/2)*85;
 let n={id:'npc'+i,team:t,name:'광장NPC '+(i+1),x,z,y:0,vx:0,vz:0,vy:0,hp:100,stamina:100,hunger:100,walk:rand(i)*2,attack:0,stun:0,heading:rand(i*4)*6,brain:0,goal:Math.floor(rand(i+32)*4),avatar:null,gender:i%2?'female':'male',hair:i%4,skin:i%3,hairColor:i%3,isNPC:true,down:0,cooldown:0};n.baseX=n.x;n.baseZ=n.z;n.avatar=makeAvatar(n);upgradeAvatarToHuman(n);scene.add(n.avatar);n.avatar.position.set(n.x,0,n.z);npcs.push(n)}for(let i=0;i<6;i++)addNPC(i);
// NPCs never switch to Minecraft-style cubes: render nearby fully rigged humans,
// cull distant characters entirely to avoid GPU stalls and visual popping.
function updateNPCLOD(){ /* visibility handled by updateNPC, without block proxies */ }

function makeSeatOccupant(car){
 const driver=new THREE.Group();car.visual.add(driver);driver.position.set(.50,0,.57);driver.rotation.y=Math.PI;driver.visible=false;
 const jacket=mat(0x587b99),face=mat(0xd6a47f),hair=mat(0x303037);
 cube(0,1.39,.08,.62,.52,.48,jacket,driver);
 ball(0,1.90,.08,.31,face,driver,14);
 const hairTop=ball(0,2.10,.12,.29,hair,driver,12);hairTop.scale.set(1,.40,1);
 for(const dx of [-.19,.19]){ball(dx,1.94,-.19,.052,mat(0xffffff),driver,9);ball(dx,1.94,-.22,.022,mat(0x242631),driver,8)}
 for(const dx of [-.38,.38]){let arm=cube(dx,1.35,-.28,.17,.26,.3,jacket,driver);arm.rotation.x=-.5}
 car.driverModel=driver;
 const steering=new THREE.Group();car.visual.add(steering);steering.position.set(.50,1.38,1.23);steering.rotation.y=Math.PI;
 let wheel=cylinder(0,0,0,.30,.30,.04,carRubber,steering,18);wheel.rotation.x=Math.PI/2;
 cylinder(0,0,0,.055,.055,.07,carChrome,steering,12).rotation.x=Math.PI/2;
}
function makeCarBody(car){
 const p=car.visual;const shell=new THREE.Group();p.add(shell);shell.rotation.y=Math.PI;car.fallbackShell=shell; // Only legacy procedural body was modeled -Z forward
 const paint=mat([0xe9eeee,0x226196,0x417d68,0xcac0aa,0xc2d0dc,0x596a84][car.index%6],.34,.34);
 // Body below windows; windshield / side / rear windows are see-through.
 cube(0,.80,0,2.72,.88,5.10,paint,shell);
 cube(0,1.25,-1.91,2.45,.15,1.10,paint,shell); // hood
 cube(0,2.21,-.37,2.31,.19,2.97,paint,shell); // roof
 cube(0,1.26,-.37,2.60,.15,2.98,paint,shell); // window sill
 for(const sx of [-1,1]){
  for(const zz of [-1.80,1.02]){
   const post=cube(sx*1.13,1.74,zz,.15,.96,.16,paint,shell);
   post.rotation.x=zz<0?.16:-.16;
  }
  cube(sx*1.16,1.77,-.38,.045,.58,2.46,carGlass,shell);
  cube(sx*1.19,1.52,-.36,.12,.075,2.48,carChrome,shell);
  cube(sx*1.17,1.98,-.36,.10,.075,2.48,paint,shell);
  cube(sx*1.23,1.48,-1.36,.24,.14,.47,paint,shell); // mirror
  for(const zz of [-1.62,1.65]){
   let tire=cylinder(sx*1.34,.49,zz,.53,.53,.38,carRubber,shell,18);tire.rotation.z=Math.PI/2;
   let rim=cylinder(sx*1.55,.49,zz,.26,.26,.39,carChrome,shell,16);rim.rotation.z=Math.PI/2;
  }
  cube(sx*.82,1.00,-2.59,.40,.22,.08,new THREE.MeshBasicMaterial({color:0xfffaf0}),shell); // bright white headlights = front
  cube(sx*.82,.92,2.59,.39,.20,.08,new THREE.MeshBasicMaterial({color:0xb31919}),shell); // red tail lights = rear
 }
 cube(0,1.76,-1.84,2.22,.87,.035,carGlass,shell);
 cube(0,1.74,1.14,2.20,.86,.035,carGlass,shell);
 // seats inside the open window band, visible through transparent glass.
 for(const sx of [-.56,.56]){
  cube(sx,1.05,-.42,.64,.24,.74,carSeat,p);
  cube(sx,1.39,.02,.64,.61,.18,carSeat,p);
  cube(sx,1.73,.08,.34,.25,.28,carSeat,p);
 }
 makeSeatOccupant(car);
}
function addCar(x,z,i){
 const v={id:'car'+i,index:i,x,z,yaw:Math.PI,speed:0,vx:0,vz:0,drifting:false,driftEnergy:0,driver:null,lastHit:new Map(),obj:new THREE.Group(),visual:new THREE.Group(),driverModel:null,fallbackShell:null,assetBody:null};
 v.obj.add(v.visual);v.visual.rotation.y=0; // Unified transform: W drives exactly where bonnet (+Z) points
 scene.add(v.obj);makeCarBody(v);v.obj.position.set(x,0,z);v.obj.rotation.y=v.yaw;cars.push(v);
}
addCar(29,57,0);addCar(33,-17,1);addCar(31,-110,2);addCar(25,89,3);addCar(-12,68,4);addCar(18,16,5);
loadKenneyCarModels();
// Interactive street furniture and an editable electronic billboard.
const interactables=[];function addInteractive(kind,x,z,action){let o=new THREE.Group();o.position.set(x,0,z);scene.add(o);o.userData.interactive=true;interactables.push({kind,x,z,action,object:o,range:kind==='돌무더기'?2.2:kind==='나무'?2.65:kind==='의자'?2.8:3.6});let m=mat(kind==='나무'?0x4c926a:kind==='음식점'?0xc87f55:0x536b79);if(kind==='의자'){cube(0,.82,0,3,.22,.75,mat(0xa77953),o);cube(0,1.4,.3,3,1,.19,mat(0xa77953),o);for(let dx of [-1.15,1.15])cube(dx,.43,0,.17,.86,.67,mat(0x485969),o)}else if(kind==='나무'){cylinder(0,1.25,0,.24,.3,2.5,mat(0x73523c),o);ball(0,3.3,0,1.5,m,o,10)}else if(kind==='편의점'||kind==='음식점'){cube(0,1.6,0,5,3.2,3.2,mat(0xd1dbd7),o);cube(0,2.7,-1.63,4.8,.85,.12,mat(kind==='편의점'?0x247fc1:0xf39b5e),o);sign(o,kind==='편의점'?'광장24 편의점':'세종 식당',4.2,.6,0,2.7,-1.72,Math.PI,'#ffffff',kind==='편의점'?'#126aa5':'#9c502c')}else if(kind==='돌무더기'){for(let j=0;j<9;j++){let stone=ball((rand(j+x)-.5)*2.1,.23,(rand(j+z)-.5)*1.7,.27+rand(j+24)*.12,mat(0x828b90),o,9);stone.scale.y=.65}let pad=mesh(new THREE.CircleGeometry(1.45,20),new THREE.MeshBasicMaterial({color:0x85918f,transparent:true,opacity:.17,side:THREE.DoubleSide}),o,0,.028,0,false);pad.rotation.x=-Math.PI/2}else{cube(0,.65,0,2,1.3,1,m,o)}return o}
for(let z of [-128,-83,-51,-10,45,91]){addInteractive('의자',-17,z,'rest');addInteractive('나무',-24,z+5,'branch')}
// Use the exact positions of the trees built into the plaza geometry, not invisible virtual markers.
for(const [x,z] of sceneryTreeLocations)interactables.push({kind:'나무',x,z,action:'branch',range:2.65,scenery:true});
addInteractive('편의점',-33,21,'shop');addInteractive('음식점',-33,-36,'food');
for(const [x,z] of [[-19,12],[-25,-69],[-20,-119],[-21,89],[15,40]]){let r=addInteractive('돌무더기',x,z,'stones');r.children.forEach(o=>{});} 
// Texture-based LED board: no external media playback required.
const boardGroup=new THREE.Group();boardGroup.position.set(-26,0,53);boardGroup.userData.interactive=true;scene.add(boardGroup);for(let v of [-4.8,4.8])cylinder(v,5,0,.27,.33,10,mat(0x29394b),boardGroup);cube(0,8.5,0,11,6,.55,mat(0x11202f),boardGroup);const screenCanvas=document.createElement('canvas');screenCanvas.width=1024;screenCanvas.height=512;const screenCtx=screenCanvas.getContext('2d');const screenTex=new THREE.CanvasTexture(screenCanvas);screenTex.colorSpace=THREE.SRGBColorSpace;const faceScreen=mesh(new THREE.PlaneGeometry(10.3,5.3),new THREE.MeshBasicMaterial({map:screenTex,side:THREE.DoubleSide}),boardGroup,0,8.5,.32,false);addInteractive('전광판',-26,59,'billboard');
function paintBillboard(){const c=screenCtx;c.fillStyle='#07263f';c.fillRect(0,0,1024,512);let grad=c.createLinearGradient(0,0,1024,512);grad.addColorStop(0,'#0b4152');grad.addColorStop(1,'#102f67');c.fillStyle=grad;c.fillRect(12,12,1000,488);if(boardImage){try{c.drawImage(boardImage,220,35,580,380)}catch{}}else{c.fillStyle='#68ffe1';c.font='900 46px sans-serif';c.textAlign='center';c.fillText('GWANGHWAMUN LIVE',512,125);c.fillStyle='#ffffff';c.font='bold 36px sans-serif';for(let [i,line] of boardText.match(/.{1,22}/gu)?.slice(0,3).entries()||[])c.fillText(line,512,210+i*56)}c.fillStyle='#a4f1ee';c.font='bold 22px sans-serif';c.fillText('광화문 시민광장 · 게임 속 가상 전광판',512,478);screenTex.needsUpdate=true;$('#screenMessage').textContent='전광판: '+boardText}
paintBillboard();
function makeProp(d){const id=String(d.id||'local'+Math.random());if(props.has(id))return;const group=new THREE.Group();group.position.set(d.x,0,d.z);group.userData.interactive=true;scene.add(group);let type=d.kind;if(type==='의자'){cube(0,.65,0,2,.24,.8,mat(0xa87955),group);cube(0,1.14,.37,2,.9,.14,mat(0xa87955),group)}else if(type==='나무'){cylinder(0,1.5,0,.27,.34,3,mat(0x765941),group);ball(0,3.4,0,1.55,mat(0x4f9c69),group,10)}else if(type==='화분'){cube(0,.36,0,2,.7,1.6,mat(0xaaa89e),group);ball(0,1.2,0,.95,mat(0x4a9967),group,10)}else if(type==='바리케이드'){cube(0,.55,0,3.3,1.1,.24,mat(0xb4bab4),group);for(let v of [-1,0,1])cube(v,.58,-.17,.3,.65,.04,mat(0xf9bd68),group)}else if(type==='가로등'){cylinder(0,3.1,0,.12,.17,6.2,mat(0x6a7883),group);ball(0,6.3,0,.36,mat(0xffe8a4),group,10)}else if(type==='팻말'){cylinder(0,1.5,0,.09,.11,3,mat(0xddd6c5),group);cube(0,3.3,0,2.9,1.2,.18,mat(0xf1f2eb),group);sign(group,(d.text||'시민광장').slice(0,32),2.7,.9,0,3.3,-.12,Math.PI,'#1a3648','#e7f0ee')}else cube(0,.55,0,1.5,1.1,1.5,mat(0x8f998f),group);props.set(id,{...d,id,group});if(type==='나무'||type==='의자')interactables.push({kind:type,x:d.x,z:d.z,action:type==='나무'?'branch':'rest',range:2.65,propId:id,object:group})}
function removeProp(id){let o=props.get(id);if(!o)return;scene.remove(o.group);o.group.traverse(v=>{if(v.isMesh&&v.material?.map&&v.material.map!==screenTex){v.material.map.dispose();v.material.dispose()}});props.delete(id);for(let i=interactables.length-1;i>=0;i--)if(interactables[i].propId===id)interactables.splice(i,1)}
// Invalid X/Y/Z or velocity used to propagate into the camera, culling every mesh.
// Keep the last finite coordinate *per axis*, so one bad knockback cannot erase the scene.
const lastSafePlayer={x:0,y:0,z:62,heading:0};
let positionFixCount=0;
function ensurePlayerFinite(where='frame'){
 let repaired=false;
 const spawnXY=TEAM[team]?.spawn||[0,62];
 const defaults={x:lastSafePlayer.x,y:lastSafePlayer.y,z:lastSafePlayer.z,heading:lastSafePlayer.heading};
 const bounds={x:[-43,43],y:[0,25],z:[-161,125],heading:[-1e6,1e6]};
 for(const k of ['x','y','z','heading']){
  if(!Number.isFinite(PLAYER[k])){
   console.warn('Invalid PLAYER coordinate recovered:',where,k,PLAYER[k]);
   PLAYER[k]=Number.isFinite(defaults[k])?defaults[k]:(k==='x'?spawnXY[0]:k==='z'?spawnXY[1]:0);
   repaired=true;
  }
  PLAYER[k]=clamp(PLAYER[k],bounds[k][0],bounds[k][1]);
 }
 for(const k of ['vx','vy','vz'])if(!Number.isFinite(PLAYER[k])||Math.abs(PLAYER[k])>150){
  console.warn('Invalid player velocity recovered:',where,k,PLAYER[k]);PLAYER[k]=0;repaired=true;
 }
 if(!Number.isFinite(cam.yaw)||!Number.isFinite(orbitYaw)){resetCamera();repaired=true}
 if(repaired){positionFixCount++;PLAYER.vx=PLAYER.vz=0;sticks.x=Number.isFinite(sticks.x)?sticks.x:0;sticks.y=Number.isFinite(sticks.y)?sticks.y:0;
  if(positionFixCount<=1)console.warn('좌표 계산 오류 자동 방어됨',where,positionFixCount);
 }
 for(const k of ['x','y','z','heading'])lastSafePlayer[k]=PLAYER[k];
}
function spawn(){let start=TEAM[team].spawn;PLAYER.x=start[0];PLAYER.z=start[1];PLAYER.y=0;PLAYER.hp=PLAYER.maxHp;PLAYER.stamina=PLAYER.maxStamina;PLAYER.hunger=100;PLAYER.vx=PLAYER.vy=PLAYER.vz=0;PLAYER.stun=0;PLAYER.car=null;if(inCar){inCar.driver=null;inCar=null}if(PLAYER.avatar)scene.remove(PLAYER.avatar);PLAYER.avatar=makeAvatar({team,gender,hair,skin,hairColor});upgradePlayerToHuman();weaponDisplay=null;syncWeaponAppearance();scene.add(PLAYER.avatar);PLAYER.avatar.position.set(PLAYER.x,0,PLAYER.z);PLAYER.heading=0;cam.yaw=PLAYER.heading;orbitYaw=cam.yaw;ensurePlayerFinite('spawn');deadUntil=0;$('#respawn').style.display='none'}
function send(data){if(ws&&ws.readyState===1)ws.send(JSON.stringify(data))}
function connect(){if(location.protocol==='file:')return;try{ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/play');ws.onopen=()=>{send({t:'join',name:nick,team,gender,hair,skin,hairColor});};ws.onmessage=e=>{let d;try{d=JSON.parse(e.data)}catch{return}processNet(d)};ws.onclose=()=>{online=false;$('#online').textContent='로컬 체험';remotes.forEach(p=>scene.remove(p.avatar));remotes.clear()}}catch(e){online=false}}
function processNet(d){if(d.t==='vehicleCollision'&&inCar?.id===d.car){inCar.x=d.x;inCar.z=d.z;inCar.yaw=d.heading;inCar.speed=inCar.vx=inCar.vz=0;PLAYER.x=d.x;PLAYER.z=d.z;collisionStats.hits++;}if(d.t==='inventory'){inventoryPacket(d);if(d.notice)toast(d.notice)}if(d.t==='welcome'){online=true;selfId=d.id;$('#online').textContent='멀티플레이 접속';$('#population').textContent=d.players.length;for(let p of d.players)if(p.id!==selfId)addRemote(p);if(d.zones){d.zones.forEach((z,i)=>Object.assign(zoneState[i],z))}if(d.scores)scores=d.scores;if(d.props)for(let item of d.props)makeProp(item);if(d.billboard){boardText=d.billboard.text||boardText;boardImage=null;if(d.billboard.image){let image=new Image();image.onload=()=>{boardImage=image;paintBillboard()};image.src=d.billboard.image}else paintBillboard()}if(d.inventory)inventoryPacket(d.inventory);toast('서버에 연결되었습니다!')}if(d.t==='join')addRemote(d.player);if(d.t==='leave'){let p=remotes.get(d.id);if(p){scene.remove(p.avatar);remotes.delete(d.id)}for(let v of cars)if(v.driver===d.id)v.driver=null}if(d.t==='move'){let p=remotes.get(d.id);if(p){p.targetX=d.x;p.targetZ=d.z;p.heading=d.heading;p.hp=d.hp;p.hunger=d.hunger;p.stamina=d.stamina;p.attack=d.attack?0.3:p.attack;p.car=d.car||null;for(let v of cars){if(d.car===v.id){v.driver=d.id;v.x=d.x;v.z=d.z;v.yaw=d.heading}else if(v.driver===d.id)v.driver=null}}}if(d.t==='count')$('#population').textContent=d.count;if(d.t==='chat')chat(d.name,d.text);if(d.t==='zones'){d.zones.forEach((z,i)=>Object.assign(zoneState[i],z));scores=d.scores}if(d.t==='damage'){if(d.id===selfId){damage(0,d.dx||0,d.dz||0,d.power||0,true);PLAYER.hp=d.hp;PLAYER.vy=Math.max(PLAYER.vy,d.up||0)}else{let p=remotes.get(d.id);if(p){p.hp=d.hp;p.vx=(d.dx||0)*(d.power||6);p.vz=(d.dz||0)*(d.power||6);p.vy=d.up||0;p.stun=.32}}}if(d.t==='hit'){let p=remotes.get(d.id);if(p){p.attack=.36;p.attackSerial=(p.attackSerial||0)+1}}if(d.t==='ko'&&d.id===selfId){PLAYER.hp=0;fall()}if(d.t==='respawn'&&d.id===selfId){spawn();if(d.inventory)inventoryPacket(d.inventory)}if(d.t==='propAdd'){makeProp(d.prop)}if(d.t==='propRemove'){removeProp(d.id)}if(d.t==='billboard'){boardText=String(d.text||'광화문 점령전');boardImage=null;if(d.image){let im=new Image();im.onload=()=>{boardImage=im;paintBillboard()};im.src=d.image}else paintBillboard()}if(d.t==='rock'){if(d.id!==selfId)rockProjectile(d.x,d.z,d.dx,d.dz,false)}if(d.t==='carTaken'){let c=cars.find(c=>c.id===d.car);if(c){c.driver=d.to;if(d.to===selfId){inCar=c;PLAYER.x=c.x;PLAYER.z=c.z;PLAYER.avatar.visible=false;cam.yaw=c.yaw+Math.PI;orbitYaw=cam.yaw;toast('🚗 차량 인수 성공 · W/↑ 전진 · Space 브레이크')}else if(d.from===selfId&&inCar===c){inCar=null;PLAYER.x=c.x+3.5;PLAYER.z=c.z;PLAYER.avatar.visible=true;toast('다른 플레이어가 차량을 차지했습니다')}}}if(d.t==='staffRole'){localRole=d.role||'guest';$('#adminRole').textContent='접속 권한: '+localRole}}
function addRemote(p){if(remotes.has(p.id))return;let o={...p,id:p.id,targetX:p.x,targetZ:p.z,vx:0,vz:0,vy:0,y:0,stun:0,attack:0,walk:0,heading:p.heading||0};o.avatar=makeAvatar(o);upgradeAvatarToHuman(o);scene.add(o.avatar);remotes.set(p.id,o)}
function damage(amount,dx,dz,power=6,remoteOnly=false){if(!started||PLAYER.hp<=0)return;dx=Number.isFinite(dx)?clamp(dx,-1,1):0;dz=Number.isFinite(dz)?clamp(dz,-1,1):0;power=Number.isFinite(power)?clamp(power,0,20):0;if(!remoteOnly)PLAYER.hp=clamp(PLAYER.hp-amount,0,PLAYER.maxHp);PLAYER.vx+=dx*power;PLAYER.vz+=dz*power;PLAYER.vy=Math.max(PLAYER.vy,Math.min(7,power*.38));PLAYER.stun=.32;hitFlash=.2;if(PLAYER.hp<=0)fall()}
function fall(){if(deadUntil>0)return;deadUntil=now+3.3;$('#respawn').style.display='block';toast('HP가 0이 되어 리스폰합니다');if(inCar){inCar.driver=null;inCar=null}}
function attack(){if(!started||PLAYER.hp<=0||inCar||attackCooldown>0||PLAYER.stamina<3)return;attackCooldown=.32;PLAYER.attack=.36;PLAYER.attackSerial=(PLAYER.attackSerial||0)+1;PLAYER.stamina-=3;let fx=-Math.sin(PLAYER.heading),fz=-Math.cos(PLAYER.heading);let hit=0;for(let n of npcs){if(n.hp<=0)continue;let dx=n.x-PLAYER.x,dz=n.z-PLAYER.z,d=Math.hypot(dx,dz);if(d<2.65&&(dx*fx+dz*fz)/Math.max(d,.001)>.25){let vecX=dx/(d||1),vecZ=dz/(d||1);npcDamage(n,(PLAYER.weapon==='axe'?38:PLAYER.weapon==='club'?30:20)+PLAYER.power,vecX,vecZ,PLAYER.weapon==='fist'?7:9);hit++}}if(online){send({t:'attack',heading:PLAYER.heading,weapon:PLAYER.weapon});}toast(hit?'⚔️ '+(PLAYER.weapon==='fist'?'주먹':LOOT[PLAYER.weapon].name)+' 적중!':'⚔️ '+(PLAYER.weapon==='fist'?'주먹 공격':LOOT[PLAYER.weapon].name+' 공격'));}
function npcDamage(n,amount,dx,dz,power){if(n.hp<=0)return;n.hp=Math.max(0,n.hp-amount);n.vx+=dx*power;n.vz+=dz*power;n.vy=power*.35;n.stun=.55;if(n.hp<=0){n.down=now+15;if(!online)offlineKnockout(n);}}
function eat(){if(!started||PLAYER.hp<=0)return;if(PLAYER.food<=0){toast('간식이 없습니다 · 편의점에서 코인으로 사세요');return}if(online){send({t:'eat'});return}PLAYER.food--;PLAYER.hunger=clamp(PLAYER.hunger+38,0,100);PLAYER.hp=clamp(PLAYER.hp+8,0,PLAYER.maxHp);toast('🍙 김밥을 먹었습니다 · 포만감 회복')}
function use(){if(!started||PLAYER.hp<=0)return;if(inCar){if(online)send({t:'carExit'});inCar.driver=null;PLAYER.x=inCar.x+Math.cos(inCar.yaw)*3.3;PLAYER.z=inCar.z-Math.sin(inCar.yaw)*3.3;inCar=null;PLAYER.avatar.visible=true;toast('차량에서 내렸습니다');return}let nearest=null,best=4.5;for(let c of cars){let d=Math.hypot(PLAYER.x-c.x,PLAYER.z-c.z);if(d<best&&!c.driver){nearest=c;best=d}}let near=findInteract();if(near&&(!nearest||Math.hypot(PLAYER.x-near.x,PLAYER.z-near.z)<best)){activateInteract(near);return}if(!nearest){toast('가까운 상호작용 물체가 없습니다');return}inCar=nearest;nearest.driver=selfId||'local';nearest.speed=0;PLAYER.avatar.visible=false;cam.yaw=nearest.yaw+Math.PI;orbitYaw=cam.yaw;toast('🚙 W/↑ 전진 · Shift 터보 · Space 브레이크 · Ctrl 드리프트')}
function moveEntity(e,dt){if(!Number.isFinite(e.vx))e.vx=0;if(!Number.isFinite(e.vz))e.vz=0;if(!Number.isFinite(e.vy))e.vy=0;e.vy=(e.vy||0)-22*dt;e.y=(e.y||0)+e.vy*dt;if(e.y<0){e.y=0;e.vy=0}e.x=clamp(e.x+(e.vx||0)*dt,-43,43);e.z=clamp(e.z+(e.vz||0)*dt,-161,125);e.vx*=Math.exp(-6.5*dt);e.vz*=Math.exp(-6.5*dt);e.stun=Math.max(0,(e.stun||0)-dt)}
function hitVehicles(dt){for(let car of cars){if(!car.driver)continue;let speed=Math.abs(car.speed);if(speed<3.7)continue;const dirX=Math.sin(car.yaw),dirZ=Math.cos(car.yaw);for(let n of npcs){if(n.hp<=0)continue;let d=Math.hypot(n.x-car.x,n.z-car.z),lastHit=car.lastHit.get(n.id)||0;if(d<2.2&&now-lastHit>.95){car.lastHit.set(n.id,now);npcDamage(n,Math.round(Math.min(70,speed*3.7)),dirX,dirZ,Math.min(13,speed*.95));car.speed*=.72}}if(!inCar||car!==inCar){let d=Math.hypot(PLAYER.x-car.x,PLAYER.z-car.z);if(d<2.2&&now-(car.lastHit.get('self')||0)>1){car.lastHit.set('self',now);damage(Math.round(speed*3),dirX,dirZ,Math.min(12,speed))}}}}
function updateNPC(dt){for(const n of npcs){
 if(n.hp<=0){n.avatar.visible=false;if(now>n.down){n.hp=100;n.x=n.baseX;n.z=n.baseZ;n.y=0;n.vx=n.vz=n.vy=0}continue}
 // Only react to player attacks or vehicle collisions. No wandering and no automatic punching.
 moveEntity(n,dt);n.moving=Math.hypot(n.vx||0,n.vz||0)>.4;
 if(n.moving)n.walk+=dt*1.2;
 const dist=Math.hypot(n.x-PLAYER.x,n.z-PLAYER.z);
 const visibleDist=dist<(qualityMode==='high'?48:qualityMode==='medium'?39:qualityMode==='low'?22:33);
 n.avatar.visible=visibleDist;
 if(visibleDist){if(humanLoadReady&&!n.avatar.userData.humanBody&&!n.avatar.userData.humanFailed)upgradeAvatarToHuman(n);n.avatar.position.set(n.x,n.y,n.z);n.avatar.rotation.y=n.heading;try{animateAvatar(n,dt)}catch(err){n.avatar.visible=false;console.error('NPC render skipped',n.id,err)}}
 }}
function animateAvatar(p,dt){
 if(!p.avatar)return;
 if(animateHumanAvatar(p,dt))return;
 const u=p.avatar.userData;
 // Locomotion is driven by actual moving state, NOT the accumulated walk-clock.
 // A one-frame stop keeps the phase but eases the pose back to idle instead of snapping.
 let moveWeight=Number.isFinite(p.motionWeight)?p.motionWeight:(p.moving?1:0);
 const target=p.moving?1:0;
 moveWeight=lerp(moveWeight,target,Math.min(1,dt*(p.moving?13:9)));
 p.motionWeight=moveWeight;
 const gait=p.walk||0, stride=Math.sin(gait*8.6), landing=Math.abs(Math.cos(gait*8.6));
 const sprinting=!!p.sprinting;
 const amplitude=moveWeight*(sprinting?1.0:.62), ease=Math.min(1,dt*16);
 for(let i=0;i<2;i++){
  const side=i===0?1:-1;
  u.legs[i].rotation.x=lerp(u.legs[i].rotation.x,stride*amplitude*side,ease);
  u.legs[i].rotation.z=lerp(u.legs[i].rotation.z,side*.035*moveWeight,ease);
  u.arms[i].rotation.x=lerp(u.arms[i].rotation.x,-stride*amplitude*side*.7,ease);
  u.arms[i].rotation.z=lerp(u.arms[i].rotation.z,-side*.09,ease);
 }
 u.torso.position.y=lerp(u.torso.position.y,moveWeight*(sprinting?.12:.08)*landing+.018*Math.sin(now*2.4),ease);
 u.torso.rotation.y=lerp(u.torso.rotation.y,.035*stride*moveWeight,ease);
 u.torso.rotation.x=lerp(u.torso.rotation.x,(p.stun>0?-.40:sprinting?.12:.018),ease);
 if(p.attack>0){p.attack=Math.max(0,p.attack-dt);const a=Math.sin(Math.min(1,(1-p.attack/.22))*Math.PI);u.arms[1].rotation.x=2.35*a;u.torso.rotation.z=.1*a}
 else u.torso.rotation.z=lerp(u.torso.rotation.z,0,ease);
 if(p.cheer>0){u.arms[0].rotation.x=-2.3;u.arms[1].rotation.x=-2.3;p.cheer=Math.max(0,p.cheer-dt)}
 u.head.rotation.z=p.stun>0?.12*Math.sin(now*18):.018*Math.sin(now*1.4);
}
function updateCapture(dt){if(online)return;for(let i=0;i<ZONES.length;i++){
 const z=ZONES[i],v=zoneState[i],counts={blue:0,red:0,green:0,white:0};
 // Stationary NPCs do not capture zones or contest a real player.
 if(started&&PLAYER.hp>0&&!inCar&&Math.hypot(PLAYER.x-z.x,PLAYER.z-z.z)<z.r)counts[team]++;
 const active=TEAMS.filter(t=>counts[t]>0);
 if(active.length===1){const leader=active[0];if(v.lead!==leader){v.lead=leader;v.progress=0}
 v.progress=Math.min(100,v.progress+CAPTURE_PERCENT_PER_PERSON_PER_SECOND*counts[leader]*dt);
 if(v.progress>=100&&v.owner!==leader){v.owner=leader;toast(TEAM[leader].name+' 진영이 '+z.name+' 점령!')}}
 // If two factions are standing in the same area, capture pauses (no passive decay).
 if(v.owner)scores[v.owner]+=dt*.12
}}
function updateUI(){for(let t of TEAMS)$('#sc_'+t).textContent=Math.floor(scores[t]);for(let [i,v] of zoneState.entries()){let owner=v.owner?TEAM[v.owner].name:'중립',el=$('#zoneOwner'+i),b=$('#zoneFill'+i);el.textContent=owner+' '+(v.progress<1?v.progress.toFixed(3):v.progress.toFixed(2))+'%';el.style.color=v.owner?TEAM[v.owner].css:'#d9c28a';b.style.width=v.progress+'%';b.style.background=v.owner?TEAM[v.owner].css:v.lead?TEAM[v.lead].css:'#d9c28a';ZONES[i].ring.material.color.set(v.owner?TEAM[v.owner].color:0xe1c57a)}
for(let [selector,num] of [['hp',PLAYER.hp],['sp',PLAYER.stamina],['food',PLAYER.hunger]]){let b=$('#'+selector+'Bar');b.style.width=clamp(num/(selector==='hp'?PLAYER.maxHp:selector==='sp'?PLAYER.maxStamina:100)*100,0,100)+'%';$('#'+selector+'N').textContent=(selector==='food'?Math.ceil(Math.max(0,num)-1e-9):Math.floor(Math.max(0,num)))+' / '+(selector==='hp'?PLAYER.maxHp:selector==='sp'?PLAYER.maxStamina:100)}$('#xp').textContent='🍙 간식 '+PLAYER.food+'개 · 1키 먹기';$('#economy').firstChild.textContent='🪙 '+PLAYER.coins+' 코인 · 🌿 가지 '+PLAYER.branches+' · 🪨 돌 '+PLAYER.stones+'\n';$('#economy').childNodes[2].textContent='🥊 '+(PLAYER.weapon==='fist'?'맨손':LOOT[PLAYER.weapon]?.name)+' · 생존 '+Math.floor(PLAYER.aliveSeconds/60)+'분 · 성장 '+PLAYER.skillPoints+'p ';$('#materials').textContent='🌿 가지 '+PLAYER.branches+' · 🪨 돌 '+PLAYER.stones;$('#growthInfo').textContent='포인트 '+PLAYER.skillPoints+'p | 체력 '+PLAYER.maxHp+' · 힘 +'+PLAYER.power+' · 기력 '+PLAYER.maxStamina;let closest=cars.find(c=>Math.hypot(c.x-PLAYER.x,c.z-PLAYER.z)<4.5&&!c.driver);let near=findInteract();$('#context').style.display=inCar||closest||near?'block':'none';$('#context').textContent=inCar?'[E] 하차 · ↑ 전진 / ↓ 후진 · Shift 가속 · Space 브레이크 · Ctrl 드리프트':closest?'[E] 자동차 운전하기':near?'[E] '+near.kind+' 상호작용':''}
const mapCtx=$('#map').getContext('2d');function minimap(){let c=mapCtx,w=400,h=448;c.clearRect(0,0,w,h);c.fillStyle='#395d60';c.fillRect(0,0,w,h);c.fillStyle='#b0bbb0';c.fillRect(116,0,140,h);c.fillStyle='#59636e';c.fillRect(255,0,85,h);c.fillStyle='#ddd6ba';c.fillRect(127,0,110,h);c.fillStyle='#6d9e7e';for(let i=0;i<6;i++)c.fillRect(126,i*77,9,53);const proj=(x,z)=>[180+x*2.4,235+(z+52)*1.41];for(let z of ZONES){let [x,y]=proj(z.x,z.z),v=zoneState[ZONES.indexOf(z)];c.beginPath();c.arc(x,y,z.r*1.6,0,Math.PI*2);c.fillStyle=v.owner?TEAM[v.owner].css+'55':'#ffde8f55';c.fill();c.strokeStyle=v.owner?TEAM[v.owner].css:'#f4d89a';c.lineWidth=2;c.stroke()}for(let n of npcs){if(n.hp<=0)continue;let [x,y]=proj(n.x,n.z);c.fillStyle=TEAM[n.team].css;c.fillRect(x-2,y-2,4,4)}for(let p of remotes.values()){let [x,y]=proj(p.x,p.z);c.fillStyle=TEAM[p.team].css;c.fillRect(x-3,y-3,6,6)}for(let car of cars){let [x,y]=proj(car.x,car.z);c.fillStyle='#f7ffff';c.fillRect(x-3,y-5,6,10)}let [px,py]=proj(PLAYER.x,PLAYER.z);c.beginPath();c.arc(px,py,7,0,Math.PI*2);c.fillStyle='#faffff';c.fill();c.lineWidth=3;c.strokeStyle='#55eaca';c.stroke();c.font='bold 14px system-ui';c.textAlign='center';c.fillStyle='#192e30';c.fillText('광화문',165,18);c.fillText('N ↑',365,18);ensurePlayerFinite('minimap');$('#coords').textContent='좌표 '+Math.round(PLAYER.x)+', '+Math.round(PLAYER.z)+' · '+(inCar?'🚙 운전 중':'도보')}

// SAT (separating axis theorem) for rotated 2.9m x 5.5m car rectangles.
// Both stationary cars and other drivers obstruct the player's car.
function carOverlap(a,b){
 const arx=Math.cos(a.yaw),arz=-Math.sin(a.yaw),afx=Math.sin(a.yaw),afz=Math.cos(a.yaw);
 const brx=Math.cos(b.yaw),brz=-Math.sin(b.yaw),bfx=Math.sin(b.yaw),bfz=Math.cos(b.yaw);
 const dx=b.x-a.x,dz=b.z-a.z;
 let overlap=Infinity,bestX=0,bestZ=0;
 for(const [ax,az] of [[arx,arz],[afx,afz],[brx,brz],[bfx,bfz]]){
  const along=Math.abs(dx*ax+dz*az);
  const ra=1.42*Math.abs(arx*ax+arz*az)+2.72*Math.abs(afx*ax+afz*az);
  const rb=1.42*Math.abs(brx*ax+brz*az)+2.72*Math.abs(bfx*ax+bfz*az);
  const d=ra+rb-along;
  if(d<=0)return null;
  if(d<overlap){overlap=d;const direction=(dx*ax+dz*az)>=0?-1:1;bestX=ax*direction;bestZ=az*direction}
 }
 return {depth:overlap,x:bestX,z:bestZ};
}
const collisionStats={hits:0,last:null};
function advanceCarWithCollisions(car,dt){
 let remaining=Math.max(1,Math.ceil(Math.hypot(car.vx,car.vz)*dt/.42));
 const step=dt/remaining;
 for(let i=0;i<remaining;i++){
  const oldX=car.x,oldZ=car.z;
  car.x=clamp(car.x+car.vx*step,-37,38);
  car.z=clamp(car.z+car.vz*step,-158,117);
  let hit=null;
  for(const other of cars){if(other===car)continue;
   if(Math.hypot(other.x-car.x,other.z-car.z)>6.3)continue;
   const info=carOverlap(car,other);if(info){hit={other,info};break}
  }
  if(hit){
   car.x=oldX;car.z=oldZ;
   // Stop engine thrust when touching a blocking car, preventing interpenetration.
   car.vx*=-.12;car.vz*=-.12;car.speed=0;
   car.drifting=false;
   if(now-(car.lastImpactAt||-10)>.8){
    car.lastImpactAt=now;collisionStats.hits++;collisionStats.last=hit.other.id;
    if(car===inCar)toast('🚗 차량 충돌! 속도가 감소했습니다');
   }
   break;
  }
  if((car.x===-37||car.x===38)&&Math.abs(car.vx)>0)car.vx=0;
  if((car.z===-158||car.z===117)&&Math.abs(car.vz)>0)car.vz=0;
 }
}
function updateCars(dt){
 for(const car of cars){
  if(!Number.isFinite(car.x)||!Number.isFinite(car.z)||!Number.isFinite(car.yaw)||!Number.isFinite(car.speed)||!Number.isFinite(car.vx)||!Number.isFinite(car.vz)){
   car.x=Number.isFinite(car.x)?car.x:25;car.z=Number.isFinite(car.z)?car.z:57;
   car.yaw=Number.isFinite(car.yaw)?car.yaw:0;car.speed=0;car.vx=0;car.vz=0;
  }
  if(car===inCar){
   const throttle=(keys.KeyW||keys.ArrowUp||sticks.y<-.35?1:0)-(keys.KeyS||keys.ArrowDown||sticks.y>.35?1:0);
   const steer=(keys.KeyA||keys.ArrowLeft||sticks.x<-.4?1:0)-(keys.KeyD||keys.ArrowRight||sticks.x>.4?1:0);
   const turbo=!!(keys.ShiftLeft||keys.ShiftRight||sticks.run);
   const braking=!!keys.Space;
   const drift=!!(keys.ControlLeft||keys.ControlRight)&&Math.abs(car.speed)>6.5&&!braking;
   car.drifting=drift;
   const targetTop=turbo?43:25;
   const engineAccel=turbo?44:27;
   if(throttle>0&&car.speed<0&&Math.abs(car.speed)<2)car.speed=0;
   if(throttle<0&&car.speed>0&&Math.abs(car.speed)<2)car.speed=0;
   if(braking){
    const loss=48*dt;
    car.speed=Math.abs(car.speed)<=loss?0:car.speed-Math.sign(car.speed)*loss;
   }else if(throttle>0){
    car.speed=Math.min(targetTop,car.speed+engineAccel*dt);
   }else if(throttle<0){
    car.speed=Math.max(-12.5,car.speed-24*dt);
   }else{
    car.speed*=Math.exp(-(drift?.42:1.85)*dt);
    if(Math.abs(car.speed)<.045)car.speed=0;
   }
   const turning=Math.min(1,Math.abs(car.speed)/9);
   const steerGain=(drift?2.85:1.85)*turning;
   car.yaw+=(steer||0)*dt*steerGain*(car.speed<0?-1:1);
   car.yaw=Math.atan2(Math.sin(car.yaw),Math.cos(car.yaw));
   // In Three.js +Z is explicitly the positive vehicle-forward axis.
   // Kenney's named front wheels are at local Z>0; car.visual faces +Z too.
   const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw); // yaw=PI faces the historic gate (north, -Z); W moves along the bonnet
   car.lastForwardX=fx;car.lastForwardZ=fz;
   const track=drift?1.1:(braking?13.5:8.8);
   const blend=1-Math.exp(-track*dt);
   car.vx+=(fx*car.speed-car.vx)*blend;
   car.vz+=(fz*car.speed-car.vz)*blend;
   if(braking){car.vx*=Math.exp(-3.0*dt);car.vz*=Math.exp(-3.0*dt)}
   advanceCarWithCollisions(car,dt);
   PLAYER.x=car.x;PLAYER.z=car.z;PLAYER.heading=car.yaw;PLAYER.y=0;
   // Chase camera tracks the rear of the vehicle without crossing its cabin.
   const desiredCamYaw=car.yaw+Math.PI;
   const yawDelta=Math.atan2(Math.sin(desiredCamYaw-cam.yaw),Math.cos(desiredCamYaw-cam.yaw));
   if(!cam.drag)cam.yaw+=yawDelta*Math.min(1,dt*2.4);
  }else{car.drifting=false;car.vx*=Math.exp(-6*dt);car.vz*=Math.exp(-6*dt)}
  car.obj.position.set(car.x,0,car.z);car.obj.rotation.y=car.yaw;
// When occupied, display the see-through modeled cabin and seated driver.
// When empty, the real CC0 GLB body is used when available.
if(car.assetBody){car.assetBody.visible=!car.driver;car.fallbackShell.visible=!!car.driver;}
if(car.driverModel){car.driverModel.visible=!!car.driver; if(car.driver&&car.driverModel.children[0])car.driverModel.children[0].material=mat(car.driver===selfId||car.driver==='local'?TEAM[team].color:0x587b99)}}}
function updateThirdPersonCamera(dt){
 const yaw=safeDirection(cam.yaw);
 cam.yaw=yaw;cam.pitch=clamp(safeScalar(cam.pitch,.4),.30,.77);
 cam.dist=clamp(safeScalar(cam.dist,12),inCar?11:9,inCar?22:17);
 // Perspective stays above the character; no interpolation of camera POSITION across body.
 const targetYaw=yaw;
 const angleDelta=Math.atan2(Math.sin(targetYaw-orbitYaw),Math.cos(targetYaw-orbitYaw));
 orbitYaw=safeDirection(orbitYaw+angleDelta*Math.min(1,dt*12));
 const targetX=safeScalar(PLAYER.x,playerMovement.lastX),targetY=safeScalar(PLAYER.y,0),targetZ=safeScalar(PLAYER.z,playerMovement.lastZ);
 const radius=cam.dist*Math.cos(cam.pitch);
 const height=targetY+3.5+cam.dist*Math.sin(cam.pitch);
 camera.position.set(targetX+Math.sin(orbitYaw)*radius,Math.max(targetY+5,height),targetZ+Math.cos(orbitYaw)*radius);
 camera.up.set(0,1,0);
 // Reset rotation each frame before lookAt: a previous nonfinite quaternion cannot persist.
 camera.quaternion.identity();
 camera.lookAt(targetX,targetY+2.05,targetZ);
 camera.updateMatrixWorld(true);
}
window.__GWANG_DEBUG__={get player(){return PLAYER},get npcs(){return npcs},get cars(){return cars},get world(){return scene},get camera(){return camera},get renderer(){return renderer},get driver(){return inCar},get locomotion(){return playerMovement},get collision(){return collisionStats},get forward(){return inCar?{x:Math.sin(inCar.yaw),z:Math.cos(inCar.yaw)}:null},get avatarRig(){return {playerModel:!!PLAYER.avatar?.userData?.humanBody,avatarHeading:PLAYER.heading,cameraYaw:cam.yaw,orientation:PLAYER.avatar?.userData?.humanFaceDebug,npcs:npcs.map(n=>({name:n.name,human:!!n.avatar?.userData?.humanBody}))}},resetCamera};
// V4.8: single writer for player movement. Render model/camera only READ finalized coordinates.
const safeScalar=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const safeAxis=(value)=>clamp(safeScalar(value),-1,1);
const safeDirection=(value)=>Math.atan2(Math.sin(safeScalar(value)),Math.cos(safeScalar(value)));
const playerMovement={lastX:PLAYER.x,lastY:0,lastZ:PLAYER.z,frames:0,badInputs:0,animationFrames:0};
function stepPlayerWalking(dt){
 // Hard boundary: never calculate physics on an invalid position.
 if(!Number.isFinite(PLAYER.x)||!Number.isFinite(PLAYER.z)||!Number.isFinite(PLAYER.y)){
  PLAYER.x=playerMovement.lastX;PLAYER.y=playerMovement.lastY;PLAYER.z=playerMovement.lastZ;
  PLAYER.vx=PLAYER.vy=PLAYER.vz=0;playerMovement.badInputs++;
 }
 const mx=safeAxis(((keys.KeyD||keys.ArrowRight)?1:0)-((keys.KeyA||keys.ArrowLeft)?1:0)+safeAxis(sticks.x));
 const mz=safeAxis(((keys.KeyS||keys.ArrowDown)?1:0)-((keys.KeyW||keys.ArrowUp)?1:0)+safeAxis(sticks.y));
 const len=Math.hypot(mx,mz);
 const sprint=!!(keys.ShiftLeft||keys.ShiftRight||sticks.run)&&PLAYER.stamina>2&&PLAYER.hunger>0;
 const speed=sprint?12:5.7;
 const moveAllowed=len>.05&&safeScalar(PLAYER.stun)<=0;
 PLAYER.moving=moveAllowed;PLAYER.sprinting=moveAllowed&&sprint;
 if(moveAllowed){
  const ax=mx/len,az=mz/len;
  // Movement is relative to CAMERA heading, using a finite scalar yaw.
  const yaw=safeDirection(cam.yaw);
  const dx=ax*Math.cos(yaw)+az*Math.sin(yaw);
  const dz=-ax*Math.sin(yaw)+az*Math.cos(yaw);
  const nextX=PLAYER.x+dx*speed*dt;
  const nextZ=PLAYER.z+dz*speed*dt;
  if(Number.isFinite(nextX)&&Number.isFinite(nextZ)){
   PLAYER.x=clamp(nextX,-38,40);PLAYER.z=clamp(nextZ,-158,118);
   PLAYER.heading=safeDirection(Math.atan2(-dx,-dz));
   // W/Up moves into the scene, with the CAMERA behind the avatar's back.
   // When the user is NOT dragging the camera and only presses forward, align
   // follow yaw to the actual heading (rather than keeping an old side angle).
   if(!cam.drag&&mz<-.9&&Math.abs(mx)<.05){
    const a=Math.atan2(Math.sin(PLAYER.heading-cam.yaw),Math.cos(PLAYER.heading-cam.yaw));
    cam.yaw=safeDirection(cam.yaw+a*Math.min(1,dt*14));
   }
   PLAYER.walk+=dt*(sprint?2.38:1.24);
  }else playerMovement.badInputs++;
  if(sprint)PLAYER.stamina=Math.max(0,PLAYER.stamina-13*dt);
 }
 // Physics (vertical jump, knockback) is processed once, without driving animation visibility.
 moveEntity(PLAYER,dt);
 if(!sprint)PLAYER.stamina=Math.min(PLAYER.maxStamina,PLAYER.stamina+(PLAYER.hunger<12?3:12)*dt);
 if(!online){
  PLAYER.hunger=Math.max(0,PLAYER.hunger-dt*HUNGER_PER_SECOND);
  offlineSurvival(dt);
  if(PLAYER.hunger===0)PLAYER.hp=Math.max(0,PLAYER.hp-dt*1.7);
  if(PLAYER.hp===0)fall();
 }
}
function syncLocalAvatar(dt){
 const a=PLAYER.avatar;
 if(!a||!started)return;
 // The local avatar is ALWAYS rendered when on foot; NPC distance/LOD never applies to it.
 const finite=Number.isFinite(PLAYER.x)&&Number.isFinite(PLAYER.y)&&Number.isFinite(PLAYER.z)&&Number.isFinite(PLAYER.heading);
 if(!finite){
  PLAYER.x=playerMovement.lastX;PLAYER.y=playerMovement.lastY;PLAYER.z=playerMovement.lastZ;PLAYER.heading=0;
  PLAYER.vx=PLAYER.vy=PLAYER.vz=0;playerMovement.badInputs++;
 }
 a.position.set(PLAYER.x,PLAYER.y,PLAYER.z);
 a.rotation.set(0,safeDirection(PLAYER.heading),0);
 a.visible=!inCar;
 if(!inCar){animateAvatar(PLAYER,dt);playerMovement.animationFrames++}
 a.updateMatrixWorld(true);
 playerMovement.lastX=PLAYER.x;playerMovement.lastY=PLAYER.y;playerMovement.lastZ=PLAYER.z;
 playerMovement.frames++;
}
function tickPlayer(dt){
 if(!started)return;
 if(PLAYER.hp<=0){if(now>deadUntil&&!online)spawn();return}
 if(inCar){
  PLAYER.moving=false;PLAYER.sprinting=false;
  PLAYER.stamina=Math.min(PLAYER.maxStamina,PLAYER.stamina+7*dt);
  if(!online)PLAYER.hunger=Math.max(0,PLAYER.hunger-dt*HUNGER_PER_SECOND);
 }else stepPlayerWalking(dt);
}
const carHUD=document.createElement('div');carHUD.id='carSpeedometer';carHUD.style.cssText='display:none;position:fixed;left:50%;bottom:105px;transform:translateX(-50%);z-index:6;min-width:255px;padding:12px 16px;border-radius:14px;background:#09243ad9;color:#fff;font:900 14px system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px #0008;pointer-events:none';document.body.appendChild(carHUD);
function refreshCarHUD(){if(!inCar){carHUD.style.display='none';return}carHUD.style.display='block';carHUD.textContent='🚘 '+Math.round(Math.hypot(inCar.vx||0,inCar.vz||0)*3.6)+' km/h · W/↑ 보닛 방향 전진 · '+(keys.Space?'브레이크':inCar.drifting?'💨 드리프트':keys.ShiftLeft||keys.ShiftRight?'⚡ 터보':'일반 주행');}
const clock=new THREE.Clock();let frame=0,fpsClock=0;
function loop(){
 let dt=clamp(safeScalar(clock.getDelta(),.016),0,.04);
 ensurePlayerFinite('start');
 now+=dt;
 attackCooldown=Math.max(0,attackCooldown-dt);
 hitFlash=Math.max(0,hitFlash-dt);
 tickPlayer(dt);
 updateCars(dt);
 refreshCarHUD();
 ensurePlayerFinite('after simulation');
 syncLocalAvatar(dt);
 updateNPC(dt);
 updateNPCLOD();
 hitVehicles(dt);
 updateCapture(dt);
 updateRocks(dt);
 for(let p of remotes.values()){
  p.targetX=safeScalar(p.targetX,p.x);p.targetZ=safeScalar(p.targetZ,p.z);
  p.x=lerp(p.x,p.targetX,Math.min(1,dt*9));p.z=lerp(p.z,p.targetZ,Math.min(1,dt*9));
  p.vy=safeScalar(p.vy)-23*dt;p.y=Math.max(0,safeScalar(p.y)+p.vy*dt);if(p.y===0)p.vy=0;
  p.avatar.position.set(p.x,p.y,p.z);p.avatar.rotation.y=safeDirection(p.heading);
  p.avatar.visible=!p.car&&Math.hypot(p.x-PLAYER.x,p.z-PLAYER.z)<(qualityMode==='auto'||qualityMode==='low'?60:100);
  p.moving=Math.hypot(p.targetX-p.x,p.targetZ-p.z)>.028;p.sprinting=false;
  if(p.moving)p.walk+=dt*1.3;p.stun=Math.max(0,p.stun-dt);
  p.x+=safeScalar(p.vx)*dt;p.z+=safeScalar(p.vz)*dt;
  p.vx=safeScalar(p.vx)*Math.exp(-6*dt);p.vz=safeScalar(p.vz)*Math.exp(-6*dt);
  if(p.avatar.visible)animateAvatar(p,dt);
 }
 if(online&&now-lastSend>.08){lastSend=now;send({t:'move',x:PLAYER.x,z:PLAYER.z,heading:PLAYER.heading,stamina:PLAYER.stamina,hunger:PLAYER.hunger,car:inCar?.id||null})}
ensurePlayerFinite('before rendering');updateThirdPersonCamera(dt);renderer.render(scene,camera);fpsClock+=dt;frame++;if(fpsClock>=1){const fps=frame/fpsClock;
$('#fps').textContent=Math.round(fps)+' FPS · '+renderer.info.render.calls+' calls';
qualityAvgFPS=qualityAvgFPS*.65+fps*.35;
if(started&&qualityMode==='auto'&&now-lastPerfTune>4.5){
 const before=adaptiveRatio;
 if(qualityAvgFPS<42)adaptiveRatio=Math.max(.50,adaptiveRatio-.11);
 else if(qualityAvgFPS>57)adaptiveRatio=Math.min(edgeBrowser?.84:1.0,adaptiveRatio+.04);
 if(Math.abs(before-adaptiveRatio)>.025){
  renderer.setPixelRatio(Math.min(devicePixelRatio,adaptiveRatio));
  renderer.setSize(innerWidth,innerHeight,false);
 }
 lastPerfTune=now;
}
fpsClock=0;frame=0}if(now-lastHudTick>.15){lastHudTick=now;updateUI()}if(now-lastMapTick>.3){lastMapTick=now;minimap()}}
let renderFaults=0;
renderer.setAnimationLoop(()=>{try{loop();if(renderFaults){renderFaults=0;gfxMessage.style.display='none'}}catch(err){renderFaults++;if(renderFaults===1){gwangReportError('3D 렌더 오류: '+(err?.message||err));console.error('광화문 그래픽 오류',err);showGraphicsStatus('⚠ 화면 출력 오류: '+String(err?.message||err).slice(0,150)+' · C키로 시점을 복구하거나 새로고침하세요.')}}});
function findInteract(){if(inCar)return null;let pick=null,dist=Infinity;
 for(const a of interactables){
  // Only visible objects or confirmed world trees are eligible; no interaction from empty ground.
  if(!a.scenery&&(!a.object||!a.object.parent||!a.object.visible))continue;
  const targetX=a.object?a.object.position.x:a.x,targetZ=a.object?a.object.position.z:a.z;
  const d=Math.hypot(PLAYER.x-targetX,PLAYER.z-targetZ);
  if(d<=a.range&&d<dist){pick=a;dist=d}
 }
 return pick}
function activateInteract(a){if(online){send({t:'interact',action:a.action,x:a.x,z:a.z});return}if(a.action==='rest'){PLAYER.hp=clamp(PLAYER.hp+14,0,PLAYER.maxHp);PLAYER.stamina=clamp(PLAYER.stamina+30,0,PLAYER.maxStamina);toast('🪑 잠시 쉬었습니다 · 체력 +14, 기력 +30')}else if(a.action==='branch'){PLAYER.branches++;toast('🌳 나뭇가지 +1 · 제작에 사용')}else if(a.action==='stones'){PLAYER.stones+=2;toast('🪨 돌멩이 +2')}else if(a.action==='shop'){if(PLAYER.coins<15){toast('🏪 간식 2개: 15코인 필요');return}PLAYER.coins-=15;PLAYER.food=Math.min(9,PLAYER.food+2);toast('🏪 15코인으로 간식 2개 구매')}else if(a.action==='food'){if(PLAYER.coins<20){toast('🍲 식사 가격 20코인');return}PLAYER.coins-=20;PLAYER.hunger=Math.min(100,PLAYER.hunger+52);PLAYER.hp=Math.min(PLAYER.maxHp,PLAYER.hp+15);toast('🍲 20코인으로 따뜻한 식사')} else if(a.action==='billboard')toast(boardText)}
function rockProjectile(x,z,dx,dz,local=true){let obj=ball(x,1.65,z,.22,mat(0x83847b),scene,9);rockShots.push({obj,x,z,y:1.65,dx,dz,life:0,local,hit:new Set()})}
function throwRock(){if(!started||inCar||rockCooldown>0||PLAYER.hp<=0||PLAYER.stamina<7)return;if(PLAYER.stones<1){toast('돌멩이가 없습니다 · 돌무더기에서 채집하세요');return}rockCooldown=.8;PLAYER.stamina-=7;if(!online)PLAYER.stones--;let dx=-Math.sin(PLAYER.heading),dz=-Math.cos(PLAYER.heading);rockProjectile(PLAYER.x+dx,PLAYER.z+dz,dx,dz);if(online)send({t:'throw',heading:PLAYER.heading});toast('🪨 돌을 던졌습니다')}
function updateRocks(dt){rockCooldown=Math.max(0,rockCooldown-dt);for(let i=rockShots.length-1;i>=0;i--){let s=rockShots[i];s.life+=dt;s.x+=s.dx*22*dt;s.z+=s.dz*22*dt;s.y=1.65+6.5*s.life-5.6*s.life*s.life;s.obj.position.set(s.x,s.y,s.z);s.obj.rotation.x+=dt*8;if(s.local){for(let n of npcs){if(n.hp>0&&!s.hit.has(n.id)&&Math.hypot(n.x-s.x,n.z-s.z)<1.0&&Math.abs(n.y+2-s.y)<2){npcDamage(n,12+PLAYER.power,s.dx,s.dz,5);s.hit.add(n.id);s.life=9;break}}}if(Math.hypot(s.x+26,s.z-53)<7&&s.y>3&&s.y<12&&s.life>.2){toast('📺 전광판에 돌이 부딪쳤습니다');s.life=9}if(s.life>2.3||s.y<0){scene.remove(s.obj);rockShots.splice(i,1)}}}
function takeCar(){if(!started||inCar||PLAYER.hp<=0)return;let nearest=null,dist=4.7;for(let v of cars){let d=Math.hypot(v.x-PLAYER.x,v.z-PLAYER.z);if(d<dist&&v.driver){dist=d;nearest=v}}if(!nearest){toast('가까이 있는 탑승 차량이 없습니다');return}if(online){send({t:'takeCar',id:nearest.id});toast('🚗 차량 인수를 요청했습니다')}else{nearest.driver=null;use();toast('🚙 차량을 인수했습니다')}}
for(let k of TOOL_TYPES){let b=document.createElement('button');b.textContent=k;b.onclick=()=>{toolType=k;$$('#toolChoices button').forEach(e=>e.classList.toggle('sel',e===b))};$('#toolChoices').appendChild(b)}$('#toolChoices button').click();
function showTools(){let open=!$('#tools').classList.contains('open');$('#tools').classList.toggle('open',open);document.body.classList.toggle('build-mode',open)}$('#closeTools').onclick=showTools;
function placeProp(){if(!started)return;let dx=-Math.sin(PLAYER.heading),dz=-Math.cos(PLAYER.heading),x=Math.round((PLAYER.x+dx*4)/2)*2,z=Math.round((PLAYER.z+dz*4)/2)*2,prop={id:'local'+Date.now(),kind:toolType,x,z,text:$('#buildText').value.slice(0,32),owner:selfId||'guest'};if(online)send({t:'propAdd',prop});else if(props.size<40)makeProp(prop);else toast('로컬 제작 물건은 40개까지 가능합니다')}
$('#craftClub').onclick=()=>craftWeapon('club');$('#craftAxe').onclick=()=>craftWeapon('axe');$('#growthBtn').onclick=()=>$('#growth').classList.toggle('open');$$('#growth [data-up]').forEach(b=>b.onclick=()=>upgradeStat(b.dataset.up));$('#placeProp').onclick=placeProp;function deleteNear(){let arr=[...props.values()].filter(p=>p.owner===(selfId||'guest')).sort((a,b)=>Math.hypot(a.x-PLAYER.x,a.z-PLAYER.z)-Math.hypot(b.x-PLAYER.x,b.z-PLAYER.z));if(!arr.length||Math.hypot(arr[0].x-PLAYER.x,arr[0].z-PLAYER.z)>8){toast('8m 안에 있는 내 제작물이 없습니다');return}let p=arr[0];if(online)send({t:'propRemove',id:p.id});else removeProp(p.id)}$('#deleteProp').onclick=deleteNear;
$('#cameraReset').onclick=()=>{resetCamera();if(started)toast('📷 카메라 시점 복구 완료')};$('#adminToggle').onclick=()=>$('#adminPanel').classList.toggle('open');$('#closeAdmin').onclick=()=>$('#adminPanel').classList.remove('open');
async function adminPost(endpoint,body){try{let r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)});let d=await r.json();if(!r.ok)throw Error(d.error||'요청 실패');return d}catch(e){$('#adminFeedback').textContent=e.message;return null}}
$('#adminLogin').onclick=async()=>{let d=await adminPost('/api/admin/login',{password:$('#adminPassword').value});if(d){localRole=d.role;$('#adminRole').textContent='권한: '+d.role;$('#adminPassword').value='';if(online)send({t:'roleRefresh'})}};
$('#staffJoin').onclick=async()=>{let d=await adminPost('/api/staff/redeem',{code:$('#adminPassword').value});if(d){localRole=d.role;$('#adminRole').textContent='권한: '+d.role;$('#adminPassword').value='';if(online)send({t:'roleRefresh'})}};
$('#inviteStaff').onclick=async()=>{let d=await adminPost('/api/admin/invite',{role:'moderator'});if(d)$('#inviteResult').textContent='초대코드 (한 번만 표시): '+d.code};
$('#publishScreen').onclick=async()=>{let text=$('#billboardText').value.trim();if(!text)return;let d=await adminPost('/api/admin/billboard',{text});if(d)$('#adminFeedback').textContent='전광판 문구가 게시됐습니다'};
$('#publishPicture').onclick=()=>{const file=$('#billboardFile').files[0];if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>150000){$('#adminFeedback').textContent='PNG/JPEG/WEBP, 최대 150KB만 가능합니다';return}let reader=new FileReader();reader.onload=async()=>{let d=await adminPost('/api/admin/billboard',{text:$('#billboardText').value.slice(0,90)||'광화문광장',image:reader.result});if(d)$('#adminFeedback').textContent='이미지 전광판이 게시됐습니다'};reader.readAsDataURL(file)};
function jump(){if(!started||PLAYER.hp<=0||inCar||PLAYER.y>.03)return;PLAYER.vy=10.8}function onKeyDown(e){if(e.target.closest('input,select')||$('#tools').classList.contains('open')&&!['KeyB','KeyP'].includes(e.code)||$('#adminPanel').classList.contains('open')&&e.code!=='Escape')return;if(['Space','ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys[e.code]=true;if(!started||e.repeat)return;if(e.code==='KeyC')resetCamera();if(e.code==='KeyJ')throwRock();if(e.code==='Digit2')equipWeapon('fist');if(e.code==='Digit3')equipWeapon('club');if(e.code==='Digit4')equipWeapon('axe');if(e.code==='KeyU')$('#growth').classList.toggle('open');if(e.code==='KeyE')use();if(e.code==='Digit1')eat();if(e.code==='Space'&&!inCar)jump();if(e.code==='Enter'){e.preventDefault();$('#chatInput').focus()}if(e.code==='KeyF'){PLAYER.cheer=1.1;toast('🙌 응원!')}if(e.code==='KeyB')showTools();if(e.code==='KeyP')placeProp();if(e.code==='KeyG')takeCar()}
window.addEventListener('keydown',onKeyDown);
window.addEventListener('keyup',e=>{
 keys[e.code]=false;
 // Stop local ground locomotion as soon as ALL walk keys are released.
 if(!keys.KeyW&&!keys.KeyA&&!keys.KeyS&&!keys.KeyD&&!keys.ArrowUp&&!keys.ArrowDown&&!keys.ArrowLeft&&!keys.ArrowRight&&Math.hypot(sticks.x,sticks.y)<.05){
  PLAYER.moving=false;PLAYER.sprinting=false;
 }
});
function clearMovementKeys(){keys={};cam.drag=false;sticks.x=0;sticks.y=0;sticks.run=false;PLAYER.moving=false;PLAYER.sprinting=false}
window.addEventListener('blur',clearMovementKeys);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearMovementKeys()});

const cvs=renderer.domElement;
cvs.addEventListener('contextmenu',e=>e.preventDefault());
cvs.addEventListener('pointerdown',e=>{
 if(!started)return;
 if(e.pointerType!=='touch'&&e.button===0){e.preventDefault();attack();return}
 if(e.pointerType==='touch'||e.button===2||e.button===1){
  cam.drag=true;cam.px=e.clientX;cam.py=e.clientY;cvs.setPointerCapture(e.pointerId);
 }
});cvs.addEventListener('pointermove',e=>{if(!cam.drag)return;cam.yaw-=(e.clientX-cam.px)*.006;cam.pitch=clamp(cam.pitch+(e.clientY-cam.py)*.004,.27,.84);cam.px=e.clientX;cam.py=e.clientY});cvs.addEventListener('pointerup',()=>cam.drag=false);cvs.addEventListener('pointercancel',()=>cam.drag=false);cvs.addEventListener('lostpointercapture',()=>cam.drag=false);cvs.addEventListener('wheel',e=>{cam.dist=clamp(cam.dist+Math.sign(e.deltaY)*1.1,6,18)},{passive:true});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false)});
let touchId=null;const j=$('#joy'),kn=$('#knob');function joyMove(e){let r=j.getBoundingClientRect(),x=(e.clientX-(r.left+r.width/2))/(r.width/2),y=(e.clientY-(r.top+r.height/2))/(r.height/2),l=Math.max(1,Math.hypot(x,y));sticks.x=Number.isFinite(x/l)?x/l:0;sticks.y=Number.isFinite(y/l)?y/l:0;kn.style.transform=`translate(${sticks.x*32}px,${sticks.y*32}px)`}j.addEventListener('pointerdown',e=>{touchId=e.pointerId;j.setPointerCapture(e.pointerId);joyMove(e)});j.addEventListener('pointermove',e=>{if(e.pointerId===touchId)joyMove(e)});for(let ev of ['pointerup','pointercancel'])j.addEventListener(ev,()=>{sticks.x=sticks.y=0;touchId=null;kn.style.transform='' });$('#mHit').onclick=attack;$('#mUse').onclick=use;$('#mEat').onclick=eat;$('#mJump').onclick=jump;$('#mRun').addEventListener('pointerdown',()=>sticks.run=true);for(let ev of ['pointerup','pointercancel','pointerleave'])$('#mRun').addEventListener(ev,()=>sticks.run=false);
$$('.teamBtn').forEach(b=>b.onclick=()=>{$$('.teamBtn').forEach(e=>e.classList.toggle('sel',b===e));team=b.dataset.team});try{let profile=JSON.parse(localStorage.getItem('gwang_profile')||'null');if(profile){$('#nick').value=profile.nick||'';for(let f of ['gender','hair','skin','hairColor'])if(profile[f]!==undefined)$('#'+f).value=profile[f];if(TEAM[profile.team]){$$('.teamBtn').find(b=>b.dataset.team===profile.team)?.click()}}}catch{}$('#loadStatus').textContent='V5.5 · 모델별 오류 복구 · 3D 시작 오류 진단';$('#startPlay').onclick=()=>{nick=($('#nick').value.trim()||'광장 시민').slice(0,14);gender=$('#gender').value;hair=Number($('#hair').value);skin=Number($('#skin').value);hairColor=Number($('#hairColor').value);PLAYER.team=team;PLAYER.food=3;try{localStorage.setItem('gwang_profile',JSON.stringify({nick,gender,hair,skin,hairColor,team}))}catch{}spawn();started=true;upgradePlayerToHuman();$('#start').classList.add('hidden');connect();toast('광화문 점령전에 입장했습니다!')};
window.addEventListener('unhandledrejection',e=>{console.warn('3D asset load issue:',e.reason)});

window.__gwangEngineReady=true;
window.dispatchEvent(new Event('gwang-ready'));
}catch(err){
 window.__gwangEngineReady=false;console.error('[게임 초기화 실패]',err);
 if(typeof window.gwangReportError==='function')window.gwangReportError('초기화 오류: '+(err?.stack||err?.message||err));
 const panel=document.querySelector('#loadErr');if(panel)panel.style.display='grid';
 const label=document.querySelector('#loadStatus');if(label)label.textContent='3D 실행 실패: '+String(err?.message||err);
}
