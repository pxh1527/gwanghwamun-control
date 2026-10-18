'use strict';
// Small HTTP + WebSocket server: area control, bounded combat, vehicle occupancy.
// No third-party npm dependencies. This is a prototype, not production anti-cheat infrastructure.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PORT=Number(process.env.PORT)||3000,ROOT=__dirname;
// Operators are authenticated only by server-side environment variable.
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'';
const sessions=new Map(),staffInvites=new Map(),props=new Map(),limits=new Map();
let billboard={text:'광화문 점령전 · 서로 존중하는 플레이',image:null};
const SAVEFILE=path.resolve(process.env.GAME_DATA_FILE||path.join(ROOT,'game-data.json'));
try{const state=JSON.parse(fs.readFileSync(SAVEFILE,'utf8'));if(Array.isArray(state.props)){for(let p of state.props.slice(0,120))if(p&&p.id&&p.kind)props.set(p.id,p)}if(state.billboard&&typeof state.billboard.text==='string')billboard={text:state.billboard.text.slice(0,90),image:typeof state.billboard.image==='string'?state.billboard.image.slice(0,210000):null}}catch{}
let saveTimer=null;function scheduleSave(){if(saveTimer)return;saveTimer=setTimeout(()=>{saveTimer=null;let tmp=SAVEFILE+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify({props:[...props.values()],billboard}));fs.renameSync(tmp,SAVEFILE)}catch(e){console.warn('game data not persistent:',e.message)}},1700)}

const clients=new Map();
const cookieToken=req=>String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('gw_staff='))?.slice(9)||'';
const roleOf=req=>sessions.get(cookieToken(req))?.role||'guest';
const sameSecret=(a,b)=>{let aa=crypto.createHash('sha256').update(String(a)).digest(),bb=crypto.createHash('sha256').update(String(b)).digest();return crypto.timingSafeEqual(aa,bb)};
const ipOf=req=>String(req.socket.remoteAddress||'unknown');
function rate(ip,key,limit,interval){let now=Date.now(),k=ip+':'+key,v=limits.get(k)||{at:now,n:0};if(now-v.at>interval){v.at=now;v.n=0}v.n++;limits.set(k,v);return v.n<=limit}
function jsonReply(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
function setAuth(res,role,req){const token=crypto.randomBytes(32).toString('base64url');sessions.set(token,{role,at:Date.now()});res.setHeader('Set-Cookie',`gw_staff=${token}; Path=/; HttpOnly; SameSite=Strict${req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);return role}
setInterval(()=>{let cutoff=Date.now()-86400000;for(let [k,v] of sessions)if(v.at<cutoff)sessions.delete(k);for(let [k,v] of limits)if(v.at<Date.now()-3600000)limits.delete(k);for(let [k,v] of staffInvites)if(v.expires<Date.now())staffInvites.delete(k)},600000).unref();
const TEAMS=new Set(['blue','red','green','white']);
const SPAWNS={blue:[-13,62],red:[10,62],green:[-19,-112],white:[18,12]};
const ZONES=[{x:-5.8,z:-43,r:12},{x:-5.8,z:-96,r:13},{x:-5,z:-152,r:13},{x:-5,z:32,r:16}];
const CARSPAWN={car0:[29,57],car1:[33,-17],car2:[31,-110],car3:[25,89],car4:[-12,68],car5:[18,16]};
const CAPTURE_RATE=1/300; // one real human = 1 percentage point per 300 seconds
const zones=ZONES.map(()=>({owner:null,lead:null,progress:0}));const scores={blue:0,red:0,green:0,white:0};
const vehicles=new Map(Object.entries(CARSPAWN).map(([id,[x,z]])=>[id,{id,x,z,heading:0,driver:null,lastHit:new Map()}]));
const num=(v,lo,hi,def=0)=>{let n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):def};
function frame(data,opcode=1){let b=Buffer.isBuffer(data)?data:Buffer.from(String(data));if(b.length>65535)return Buffer.alloc(0);let h;if(b.length<=125){h=Buffer.from([0x80|opcode,b.length])}else{h=Buffer.alloc(4);h[0]=0x80|opcode;h[1]=126;h.writeUInt16BE(b.length,2)}return Buffer.concat([h,b])}
function send(c,d){if(c.socket.writable&&!c.socket.destroyed&&c.socket.writableLength<1024*1024){let data=frame(JSON.stringify(d));if(data.length)c.socket.write(data)}}
function broadcast(d,except){for(let p of clients.values())if(p.joined&&p!==except)send(p,d)}
function inventory(c){return {coins:c.coins,branches:c.branches,stones:c.stones,food:c.food,weapons:c.weapons,weapon:c.weapon,maxHp:c.maxHp,maxStamina:c.maxStamina,power:c.power,skillPoints:c.skillPoints,hp:c.hp,stamina:c.stamina,hunger:c.hunger,aliveSeconds:c.aliveSeconds,wellFedSeconds:c.wellFedSeconds}}
function syncInventory(c,notice=''){send(c,{t:'inventory',...inventory(c),notice})}
function rewardKnockout(victim,attacker){if(!attacker||attacker===victim||attacker.team===victim.team||attacker.hp<=0)return;if(Date.now()-(victim.lastPaidKO||0)<45000)return;victim.lastPaidKO=Date.now();attacker.coins=Math.min(99999,attacker.coins+25);syncInventory(attacker,'🪙 적군 제압 보상 +25코인')}
function publicPlayer(c){return {id:c.id,name:c.name,team:c.team,gender:c.gender,hair:c.hair,skin:c.skin,hairColor:c.hairColor,x:c.x,z:c.z,heading:c.heading,hp:c.hp,stamina:c.stamina,hunger:c.hunger,car:c.car}}
function count(){let c=[...clients.values()].filter(x=>x.joined).length;broadcast({t:'count',count:c})}
function respawn(c){let [x,z]=SPAWNS[c.team];c.x=x;c.z=z;c.hp=c.maxHp;c.stamina=c.maxStamina;c.hunger=100;c.car=null;c.deadUntil=0;send(c,{t:'respawn',id:c.id,inventory:inventory(c)});broadcast({t:'move',...publicPlayer(c)})}
function hurt(c,damage,dx,dz,power,origin,attacker=null){if(c.hp<=0||Date.now()<c.invulnerableUntil)return;let n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;c.hp=Math.max(0,c.hp-damage);send(c,{t:'damage',id:c.id,hp:c.hp,dx,dz,power,up:Math.min(7,power*.34),source:origin});broadcast({t:'damage',id:c.id,hp:c.hp,dx,dz,power,up:Math.min(7,power*.34),source:origin},c);if(c.hp<=0){c.deadUntil=Date.now()+3400;send(c,{t:'ko',id:c.id});c.invulnerableUntil=c.deadUntil+1200;rewardKnockout(c,attacker);}}
function releaseCar(c){if(!c.car)return;let car=vehicles.get(c.car);if(car&&car.driver===c.id)car.driver=null;c.car=null}
function updateMove(c,d){let now=Date.now();if(now-c.lastMove<55)return;let elapsed=Math.max(.06,Math.min((now-c.lastMove)/1000,.25));c.lastMove=now;
if(c.hp<=0)return;
let rawX=num(d.x,-38,40,c.x),rawZ=num(d.z,-158,118,c.z);let carID=typeof d.car==='string'?d.car:null;let wantsCar=carID&&vehicles.has(carID)?carID:null;
if(wantsCar!==c.car){releaseCar(c);if(wantsCar){let car=vehicles.get(wantsCar);if(!car.driver&&Math.hypot(car.x-c.x,car.z-c.z)<7.5){car.driver=c.id;c.car=wantsCar}}}
let maxSpeed=c.car?27:(c.stamina<=0?5.6:12.5);let moveDist=Math.hypot(rawX-c.x,rawZ-c.z),bound=maxSpeed*elapsed+3;
if(moveDist>bound){rawX=c.x+(rawX-c.x)*bound/moveDist;rawZ=c.z+(rawZ-c.z)*bound/moveDist}
if(!c.car&&moveDist>6*elapsed){c.stamina=Math.max(0,c.stamina-(moveDist-6*elapsed)*1.2)}
c.x=rawX;c.z=rawZ;c.heading=num(d.heading,-Math.PI*20,Math.PI*20,c.heading);// Stamina and hunger are server-managed, not blindly copied from the browser.

if(c.car){let car=vehicles.get(c.car);car.x=c.x;car.z=c.z;car.heading=c.heading;checkCarCollision(c,car,now)}
broadcast({t:'move',...publicPlayer(c)},c);
}
function checkCarCollision(driver,car,now){let speed=Math.hypot(car.x-(car.prevX??car.x),car.z-(car.prevZ??car.z))/Math.max(.06,(now-(car.prevAt??now-70))/1000);car.prevX=car.x;car.prevZ=car.z;car.prevAt=now;if(speed<3.9)return;for(let p of clients.values()){if(p===driver||!p.joined||p.hp<=0||p.car)continue;if(Math.hypot(p.x-car.x,p.z-car.z)>2.4)continue;let last=car.lastHit.get(p.id)||0;if(now-last<1300)continue;car.lastHit.set(p.id,now);let dx=p.x-car.x,dz=p.z-car.z;hurt(p,Math.round(Math.min(60,speed*2.4)),dx,dz,Math.min(13,speed*.7),'car')}}
function handleMessage(c,str){let d;try{d=JSON.parse(str)}catch{return}if(!d||typeof d!=='object'||Array.isArray(d))return;let now=Date.now();
if(d.t==='roleRefresh'){c.role=roleOf(c.req);send(c,{t:'staffRole',role:c.role});return}
if(d.t==='join'&&!c.joined){c.name=String(d.name||'광장 시민').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,14)||'광장 시민';c.team=TEAMS.has(d.team)?d.team:'blue';c.gender=d.gender==='female'?'female':'male';c.hair=Math.round(num(d.hair,0,3));c.skin=Math.round(num(d.skin,0,2));c.hairColor=Math.round(num(d.hairColor,0,2));[c.x,c.z]=SPAWNS[c.team];c.hp=c.maxHp;c.stamina=c.maxStamina;c.hunger=100;c.heading=0;c.car=null;c.joined=true;send(c,{t:'welcome',id:c.id,players:[...clients.values()].filter(p=>p.joined).map(publicPlayer),zones,scores,props:[...props.values()],billboard,inventory:inventory(c)});send(c,{t:'staffRole',role:c.role});broadcast({t:'join',player:publicPlayer(c)},c);count();return}
if(!c.joined)return;
if(d.t==='interact'){
 const action=String(d.action||''),x=num(d.x,-45,45,999),z=num(d.z,-170,125,999);
 const fixtures={branch:[...[-128,-83,-51,-10,45,91].map(t=>[-24,t+5])],stones:[[-19,12],[-25,-69],[-20,-119],[-21,89],[15,40]],shop:[[-33,21]],food:[[-33,-36]],rest:[...[-128,-83,-51,-10,45,91].map(t=>[-17,t])]};
 if(!fixtures[action]||c.hp<=0||c.car||Math.hypot(c.x-x,c.z-z)>5.5||!fixtures[action].some(([fx,fz])=>Math.hypot(fx-x,fz-z)<.3))return;
 if((action==='branch'||action==='stones')&&now-(c.lastGather||0)<10000){syncInventory(c,'⏳ 채집은 10초마다 할 수 있습니다');return}
 if(action==='branch'){c.branches=Math.min(99,c.branches+1);c.lastGather=now}
 else if(action==='stones'){c.stones=Math.min(99,c.stones+2);c.lastGather=now}
 else if(action==='shop'){if(c.coins<15){syncInventory(c,'🏪 간식 가격 15코인');return}c.coins-=15;c.food=Math.min(9,c.food+2)}
 else if(action==='food'){if(c.coins<20){syncInventory(c,'🍲 식사 가격 20코인');return}c.coins-=20;c.hunger=Math.min(100,c.hunger+52);c.hp=Math.min(c.maxHp,c.hp+15)}
 else if(action==='rest'){if(now-(c.lastRest||0)<6000){syncInventory(c,'🪑 조금 더 쉬세요');return}c.lastRest=now;c.hp=Math.min(c.maxHp,c.hp+14);c.stamina=Math.min(c.maxStamina,c.stamina+30)}
 syncInventory(c,{branch:'🌳 가지 +1',stones:'🪨 돌 +2',shop:'🏪 간식 2개 구매',food:'🍲 식사 완료',rest:'🪑 체력·기력 회복'}[action]);return;
}
if(d.t==='craft'){
 const recipes={club:{branches:2,stones:0},axe:{branches:1,stones:2}},kind=String(d.kind||''),r=recipes[kind];
 if(!r||c.hp<=0||c.weapons[kind])return;
 if(c.branches<r.branches||c.stones<r.stones){syncInventory(c,'제작 재료가 부족합니다');return}
 c.branches-=r.branches;c.stones-=r.stones;c.weapons[kind]=true;c.weapon=kind;syncInventory(c,'⚒️ 무기 제작 완료');return;
}
if(d.t==='equip'){
 const kind=String(d.kind||'');if(!['fist','club','axe'].includes(kind)||kind!=='fist'&&!c.weapons[kind])return;c.weapon=kind;syncInventory(c);return;
}
if(d.t==='eat'){
 if(c.hp<=0||c.food<=0)return;c.food--;c.hunger=Math.min(100,c.hunger+38);c.hp=Math.min(c.maxHp,c.hp+8);syncInventory(c,'🍙 간식을 먹었습니다');return;
}
if(d.t==='upgrade'){
 const stat=String(d.stat||'');if(c.skillPoints<=0||!['health','stamina','power'].includes(stat))return;
 if(stat==='health'&&c.maxHp>=200||stat==='stamina'&&c.maxStamina>=200||stat==='power'&&c.power>=40)return;
 c.skillPoints--;if(stat==='health'){c.maxHp+=20;c.hp=Math.min(c.maxHp,c.hp+20)}else if(stat==='stamina'){c.maxStamina+=15;c.stamina=Math.min(c.maxStamina,c.stamina+15)}else c.power+=4;syncInventory(c,'📈 능력치 강화 성공');return;
}
if(d.t==='move'){updateMove(c,d)}else if(d.t==='attack'){
if(c.hp<=0||c.car||now-c.lastAttack<510||c.stamina<8)return;c.lastAttack=now;c.stamina=Math.max(0,c.stamina-9);
let heading=num(d.heading,-Math.PI*20,Math.PI*20,c.heading),fx=-Math.sin(heading),fz=-Math.cos(heading);broadcast({t:'hit',id:c.id});for(let p of clients.values()){if(!p.joined||p===c||p.team===c.team||p.hp<=0||p.car)continue;let dx=p.x-c.x,dz=p.z-c.z,dist=Math.hypot(dx,dz);if(dist>2.8||dist<.001)continue;let front=(dx*fx+dz*fz)/dist;if(front<.23)continue;hurt(p,(c.weapon==='axe'?38:c.weapon==='club'?30:20)+c.power,dx,dz,8,'fist',c)}}
else if(d.t==='carExit'){releaseCar(c);broadcast({t:'move',...publicPlayer(c)},c)}
else if(d.t==='takeCar'){
 if(c.hp<=0||now-c.lastCarTake<5000)return;
 const car=vehicles.get(d.id);if(!car||Math.hypot(car.x-c.x,car.z-c.z)>5.2)return;c.lastCarTake=now;
 const previous=car.driver;
 if(previous&&previous!==c.id){const previousPlayer=clients.get(previous);if(previousPlayer){previousPlayer.car=null;previousPlayer.x=car.x+3.5;previousPlayer.z=car.z;send(previousPlayer,{t:'carTaken',car:car.id,from:previous,to:c.id})}}
 releaseCar(c);car.driver=c.id;c.car=car.id;car.prevX=car.x;car.prevZ=car.z;car.prevAt=Date.now();
 c.x=car.x;c.z=car.z;broadcast({t:'carTaken',car:car.id,from:previous,to:c.id});send(c,{t:'carTaken',car:car.id,from:previous,to:c.id});broadcast({t:'move',...publicPlayer(c)},c)
 }
else if(d.t==='throw'){
 if(c.hp<=0||c.car||now-(c.lastThrow||0)<850||c.stamina<7||c.stones<1)return;c.lastThrow=now;c.stamina-=7;c.stones--;syncInventory(c);
 let a=c.heading,dx=-Math.sin(a),dz=-Math.cos(a);broadcast({t:'rock',id:c.id,x:c.x+dx,z:c.z+dz,dx,dz},c);
 // Simplified server-checked projectile corridor; damage not trusted from clients.
 for(let p of clients.values()){if(p===c||!p.joined||p.team===c.team||p.hp<=0||p.car)continue;let px=p.x-c.x,pz=p.z-c.z,forward=px*dx+pz*dz,side=Math.abs(px*dz-pz*dx);if(forward>2&&forward<15&&side<1.35){hurt(p,12+c.power,dx,dz,5,'rock',c);break}}
 }
else if(d.t==='propAdd'){
 if(now-(c.lastBuild||0)<1100)return;c.lastBuild=now;let dprop=d.prop;if(!dprop||typeof dprop!=='object')return;
 const types=new Set(['의자','나무','화분','바리케이드','팻말','가로등','상자']);const kind=String(dprop.kind||'');const x=num(dprop.x,-38,40,999),z=num(dprop.z,-158,118,999);
 if(!types.has(kind)||x===999||z===999||Math.hypot(c.x-x,c.z-z)>11)return;
 if([...props.values()].filter(q=>q.owner===c.id).length>=15||props.size>=120)return;
 if(ZONES.some(q=>Math.hypot(q.x-x,q.z-z)<5))return;
 const prop={id:crypto.randomUUID(),owner:c.id,kind,x:Math.round(x),z:Math.round(z),text:String(dprop.text||'').replace(/[<>]/g,'').slice(0,32)};
 props.set(prop.id,prop);scheduleSave();broadcast({t:'propAdd',prop});send(c,{t:'propAdd',prop});
 }
else if(d.t==='propRemove'){
 const q=props.get(String(d.id||''));if(!q||q.owner!==c.id&&c.role==='guest')return;
 if(Math.hypot(c.x-q.x,c.z-q.z)>12&&c.role==='guest')return;props.delete(q.id);scheduleSave();broadcast({t:'propRemove',id:q.id});send(c,{t:'propRemove',id:q.id});
 }
else if(d.t==='chat'){if(now-c.lastChat<500)return;c.lastChat=now;const s=typeof d.text==='string'?d.text.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120):'';if(s)broadcast({t:'chat',name:c.name,team:c.team,text:s},c)}
}
function parseFrames(c,data){c.buffer=Buffer.concat([c.buffer,data]);if(c.buffer.length>33000){c.socket.destroy();return}while(c.buffer.length>=2){let b0=c.buffer[0],b1=c.buffer[1],op=b0&15;if(!(b0&0x80)||!(b1&0x80)){c.socket.destroy();return}let len=b1&127,off=2;if(len===126){if(c.buffer.length<4)return;len=c.buffer.readUInt16BE(2);off=4}if(len===127||len>8192){c.socket.destroy();return}if(c.buffer.length<off+4+len)return;let mask=c.buffer.subarray(off,off+4);off+=4;let payload=Buffer.from(c.buffer.subarray(off,off+len));c.buffer=c.buffer.subarray(off+len);for(let i=0;i<len;i++)payload[i]^=mask[i%4];if(op===8){c.socket.end();return}if(op===9){c.socket.write(frame(payload,10));continue}if(op!==1)continue;handleMessage(c,payload.toString('utf8'))}}
function updateZones(){const dt=.5;for(let i=0;i<ZONES.length;i++){
 const zone=ZONES[i],state=zones[i],counts={blue:0,red:0,green:0,white:0};
 for(const c of clients.values())if(c.joined&&c.hp>0&&!c.car&&Math.hypot(c.x-zone.x,c.z-zone.z)<zone.r)counts[c.team]++;
 const active=Object.keys(counts).filter(t=>counts[t]>0);
 if(active.length===1){const leader=active[0];if(state.lead!==leader){state.lead=leader;state.progress=0}
 state.progress=Math.min(100,state.progress+counts[leader]*dt*CAPTURE_RATE);
 if(state.progress>=100)state.owner=leader;
 }
 // Contested territory: progress freezes. Neutral empty territory: no automatic progress or decay.
 if(state.owner)scores[state.owner]+=.12*dt;
 }broadcast({t:'zones',zones,scores})}
setInterval(updateZones,500);
setInterval(()=>{for(const c of clients.values())if(c.joined&&c.hp>0){
 c.aliveSeconds++;c.hunger=Math.max(0,c.hunger-(c.car?.075:.36));
 if(c.hunger>=20)c.wellFedSeconds++;
 if(c.wellFedSeconds>=300){c.wellFedSeconds-=300;c.skillPoints++;syncInventory(c,'🌱 건강하게 5분 생존! 성장 포인트 +1')}
 if(c.hunger<=0){c.hp=Math.max(0,c.hp-1.7);if(c.hp===0){c.deadUntil=Date.now()+3400;c.invulnerableUntil=c.deadUntil+1200;send(c,{t:'ko',id:c.id})}}
 // Replenish stamina conservatively between actions.
 c.stamina=Math.min(c.maxStamina,c.stamina+8);
 if(c.aliveSeconds%3===0)syncInventory(c);
 }},1000);
setInterval(()=>{let now=Date.now();for(let c of clients.values())if(c.joined&&c.hp<=0&&c.deadUntil&&now>=c.deadUntil){releaseCar(c);respawn(c)}},250);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.md':'text/plain; charset=utf-8','.json':'application/json'};
const server=http.createServer((req,res)=>{let route;try{route=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return}if(route==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');return}
const allowedRoutes=new Set(['/api/admin/login','/api/staff/redeem','/api/admin/invite','/api/admin/billboard']);
if(req.method==='POST'&&allowedRoutes.has(route)){
 let ip=ipOf(req);if(!rate(ip,'api',24,60000)){jsonReply(res,429,{error:'요청이 너무 많습니다'});return}
 const origin=String(req.headers.origin||'');if(origin){try{if(new URL(origin).host!==req.headers.host){jsonReply(res,403,{error:'잘못된 접근 경로'});return}}catch{jsonReply(res,403,{error:'접근 거부'});return}}
 let chunks=[],size=0;req.on('data',part=>{size+=part.length;if(size>230000){req.destroy();return}chunks.push(part)});
 req.on('end',()=>{let d;try{d=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{jsonReply(res,400,{error:'잘못된 요청 형식'});return}
 if(route==='/api/admin/login'){
  if(!rate(ip,'login',6,60000)){jsonReply(res,429,{error:'로그인 시도 제한'});return}
  if(!ADMIN_PASSWORD||String(ADMIN_PASSWORD).length<12){jsonReply(res,503,{error:'운영자 비밀번호를 환경변수 ADMIN_PASSWORD(12자 이상)로 설정하세요'});return}
  if(!sameSecret(d.password,ADMIN_PASSWORD)){jsonReply(res,403,{error:'비밀번호를 확인하세요'});return}
  let role=setAuth(res,'owner',req);jsonReply(res,200,{role});return;
 }
 if(route==='/api/staff/redeem'){
  const code=String(d.code||''),invite=staffInvites.get(code);if(!invite||invite.expires<Date.now()){jsonReply(res,403,{error:'유효하지 않거나 만료된 초대코드'});return}
  staffInvites.delete(code);let role=setAuth(res,invite.role,req);jsonReply(res,200,{role});return;
 }
 let role=roleOf(req);if(!['owner','moderator'].includes(role)){jsonReply(res,403,{error:'운영자 인증이 필요합니다'});return}
 if(route==='/api/admin/invite'){if(role!=='owner'){jsonReply(res,403,{error:'소유자만 초대 가능합니다'});return}let code=crypto.randomBytes(18).toString('base64url');staffInvites.set(code,{role:'moderator',expires:Date.now()+3600000});jsonReply(res,200,{code,expiresInMinutes:60});return}
 if(route==='/api/admin/billboard'){
  const str=String(d.text||'').replace(/[<>]/g,'').slice(0,90);
  let pic=null;if(d.image){pic=String(d.image);if(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(pic)||pic.length>210000){jsonReply(res,400,{error:'허용되지 않는 이미지이거나 150KB를 초과합니다'});return}}
  billboard={text:str||'광화문 점령전',image:pic};scheduleSave();broadcast({t:'billboard',...billboard});jsonReply(res,200,{ok:true});return
 }
 jsonReply(res,404,{error:'not found'})
 });return
 }if(req.method!=='GET'||!['/','/index.html','/README.md'].includes(route)){res.writeHead(404);res.end('not found');return}let file=route==='/'?'/index.html':route;fs.readFile(path.join(ROOT,file),(err,b)=>{if(err){res.writeHead(500);res.end('Unable to read file');return}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'public, max-age=600','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(b)})});
server.on('upgrade',(req,socket,head)=>{if(req.url!=='/play'||String(req.headers.upgrade).toLowerCase()!=='websocket'||!req.headers['sec-websocket-key']){socket.destroy();return}const origin=String(req.headers.origin||'');if(origin){try{let u=new URL(origin);let host=String(req.headers.host||'');if(u.host!==host){socket.destroy();return}}catch{socket.destroy();return}}
let ip=ipOf(req);if(!rate(ip,'upgrade',30,60000)||[...clients.values()].filter(c=>c.ip===ip).length>=6){socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');return}
if(clients.size>=80){socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');return}let key=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');let c={socket,req,ip,role:roleOf(req),id:crypto.randomUUID(),joined:false,name:'',team:'blue',x:0,z:60,hp:100,lastMove:0,lastChat:0,lastAttack:0,car:null,stamina:100,hunger:100,coins:0,branches:0,stones:0,food:3,weapons:{club:false,axe:false},weapon:'fist',maxHp:100,maxStamina:100,power:0,skillPoints:0,aliveSeconds:0,wellFedSeconds:0,lastPaidKO:0,lastGather:0,buffer:Buffer.alloc(0),invulnerableUntil:0};clients.set(c.id,c);socket.setNoDelay(true);socket.on('data',data=>parseFrames(c,data));if(head.length)parseFrames(c,head);let leave=()=>{if(!clients.has(c.id))return;clients.delete(c.id);releaseCar(c);if(c.joined){broadcast({t:'leave',id:c.id});count()}};socket.on('close',leave);socket.on('error',leave)});
server.listen(PORT,'0.0.0.0',()=>console.log(`광화문 점령전 V4 : http://localhost:${PORT}`));
