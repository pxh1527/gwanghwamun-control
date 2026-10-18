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
const zones=ZONES.map(()=>({owner:null,lead:null,progress:0}));const scores={blue:0,red:0,green:0,white:0};
const vehicles=new Map(Object.entries(CARSPAWN).map(([id,[x,z]])=>[id,{id,x,z,heading:0,driver:null,lastHit:new Map()}]));
const num=(v,lo,hi,def=0)=>{let n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):def};
function frame(data,opcode=1){let b=Buffer.isBuffer(data)?data:Buffer.from(String(data));if(b.length>65535)return Buffer.alloc(0);let h;if(b.length<=125){h=Buffer.from([0x80|opcode,b.length])}else{h=Buffer.alloc(4);h[0]=0x80|opcode;h[1]=126;h.writeUInt16BE(b.length,2)}return Buffer.concat([h,b])}
function send(c,d){if(c.socket.writable&&!c.socket.destroyed&&c.socket.writableLength<1024*1024){let data=frame(JSON.stringify(d));if(data.length)c.socket.write(data)}}
function broadcast(d,except){for(let p of clients.values())if(p.joined&&p!==except)send(p,d)}
function publicPlayer(c){return {id:c.id,name:c.name,team:c.team,gender:c.gender,hair:c.hair,skin:c.skin,hairColor:c.hairColor,x:c.x,z:c.z,heading:c.heading,hp:c.hp,stamina:c.stamina,hunger:c.hunger,car:c.car}}
function count(){let c=[...clients.values()].filter(x=>x.joined).length;broadcast({t:'count',count:c})}
function respawn(c){let [x,z]=SPAWNS[c.team];c.x=x;c.z=z;c.hp=100;c.stamina=100;c.hunger=100;c.car=null;c.deadUntil=0;send(c,{t:'respawn',id:c.id});broadcast({t:'move',...publicPlayer(c)})}
function hurt(c,damage,dx,dz,power,origin){if(c.hp<=0||Date.now()<c.invulnerableUntil)return;let n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;c.hp=Math.max(0,c.hp-damage);send(c,{t:'damage',id:c.id,hp:c.hp,dx,dz,power,up:Math.min(7,power*.34),source:origin});broadcast({t:'damage',id:c.id,hp:c.hp,dx,dz,power,up:Math.min(7,power*.34),source:origin},c);if(c.hp<=0){c.deadUntil=Date.now()+3400;send(c,{t:'ko',id:c.id});c.invulnerableUntil=c.deadUntil+1200;}}
function releaseCar(c){if(!c.car)return;let car=vehicles.get(c.car);if(car&&car.driver===c.id)car.driver=null;c.car=null}
function updateMove(c,d){let now=Date.now();if(now-c.lastMove<55)return;let elapsed=Math.max(.06,Math.min((now-c.lastMove)/1000,.25));c.lastMove=now;
if(c.hp<=0)return;
let rawX=num(d.x,-38,40,c.x),rawZ=num(d.z,-158,118,c.z);let carID=typeof d.car==='string'?d.car:null;let wantsCar=carID&&vehicles.has(carID)?carID:null;
if(wantsCar!==c.car){releaseCar(c);if(wantsCar){let car=vehicles.get(wantsCar);if(!car.driver&&Math.hypot(car.x-c.x,car.z-c.z)<7.5){car.driver=c.id;c.car=wantsCar}}}
let maxSpeed=c.car?27:12.5;let moveDist=Math.hypot(rawX-c.x,rawZ-c.z),bound=maxSpeed*elapsed+3;
if(moveDist>bound){rawX=c.x+(rawX-c.x)*bound/moveDist;rawZ=c.z+(rawZ-c.z)*bound/moveDist}
c.x=rawX;c.z=rawZ;c.heading=num(d.heading,-Math.PI*20,Math.PI*20,c.heading);c.stamina=num(d.stamina,0,100,c.stamina);c.hunger=num(d.hunger,0,100,c.hunger);
if(c.car){let car=vehicles.get(c.car);car.x=c.x;car.z=c.z;car.heading=c.heading;checkCarCollision(c,car,now)}
broadcast({t:'move',...publicPlayer(c)},c);
}
function checkCarCollision(driver,car,now){let speed=Math.hypot(car.x-(car.prevX??car.x),car.z-(car.prevZ??car.z))/Math.max(.06,(now-(car.prevAt??now-70))/1000);car.prevX=car.x;car.prevZ=car.z;car.prevAt=now;if(speed<3.9)return;for(let p of clients.values()){if(p===driver||!p.joined||p.hp<=0||p.car)continue;if(Math.hypot(p.x-car.x,p.z-car.z)>2.4)continue;let last=car.lastHit.get(p.id)||0;if(now-last<1300)continue;car.lastHit.set(p.id,now);let dx=p.x-car.x,dz=p.z-car.z;hurt(p,Math.round(Math.min(60,speed*2.4)),dx,dz,Math.min(13,speed*.7),'car')}}
function handleMessage(c,str){let d;try{d=JSON.parse(str)}catch{return}if(!d||typeof d!=='object'||Array.isArray(d))return;let now=Date.now();
if(d.t==='roleRefresh'){c.role=roleOf(c.req);send(c,{t:'staffRole',role:c.role});return}
if(d.t==='join'&&!c.joined){c.name=String(d.name||'광장 시민').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,14)||'광장 시민';c.team=TEAMS.has(d.team)?d.team:'blue';c.gender=d.gender==='female'?'female':'male';c.hair=Math.round(num(d.hair,0,3));c.skin=Math.round(num(d.skin,0,2));c.hairColor=Math.round(num(d.hairColor,0,2));[c.x,c.z]=SPAWNS[c.team];c.hp=100;c.stamina=100;c.hunger=100;c.heading=0;c.car=null;c.joined=true;send(c,{t:'welcome',id:c.id,players:[...clients.values()].filter(p=>p.joined).map(publicPlayer),zones,scores,props:[...props.values()],billboard});send(c,{t:'staffRole',role:c.role});broadcast({t:'join',player:publicPlayer(c)},c);count();return}
if(!c.joined)return;
if(d.t==='move'){updateMove(c,d)}else if(d.t==='attack'){
if(c.hp<=0||c.car||now-c.lastAttack<510||c.stamina<8)return;c.lastAttack=now;c.stamina=Math.max(0,c.stamina-9);
let heading=num(d.heading,-Math.PI*20,Math.PI*20,c.heading),fx=-Math.sin(heading),fz=-Math.cos(heading);broadcast({t:'hit',id:c.id});for(let p of clients.values()){if(!p.joined||p===c||p.hp<=0||p.car)continue;let dx=p.x-c.x,dz=p.z-c.z,dist=Math.hypot(dx,dz);if(dist>2.8||dist<.001)continue;let front=(dx*fx+dz*fz)/dist;if(front<.23)continue;hurt(p,20,dx,dz,8,'fist')}}
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
 if(c.hp<=0||c.car||now-(c.lastThrow||0)<850||c.stamina<7)return;c.lastThrow=now;c.stamina-=7;
 let a=c.heading,dx=-Math.sin(a),dz=-Math.cos(a);broadcast({t:'rock',id:c.id,x:c.x+dx,z:c.z+dz,dx,dz},c);
 // Simplified server-checked projectile corridor; damage not trusted from clients.
 for(let p of clients.values()){if(p===c||!p.joined||p.hp<=0||p.car)continue;let px=p.x-c.x,pz=p.z-c.z,forward=px*dx+pz*dz,side=Math.abs(px*dz-pz*dx);if(forward>2&&forward<15&&side<1.35){hurt(p,12,dx,dz,5,'rock');break}}
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
function updateZones(){let dt=.5;for(let i=0;i<ZONES.length;i++){let z=ZONES[i],v=zones[i],counts={blue:0,red:0,green:0,white:0};for(let c of clients.values())if(c.joined&&c.hp>0&&Math.hypot(c.x-z.x,c.z-z.z)<z.r)counts[c.team]++;let ordered=Object.keys(counts).filter(t=>counts[t]>0).sort((a,b)=>counts[b]-counts[a]);if(ordered.length&&counts[ordered[0]]>(counts[ordered[1]]||0)){let leader=ordered[0];if(v.lead!==leader){v.lead=leader;v.progress=Math.max(0,v.progress-18)}if(v.owner&&v.owner!==leader){v.progress=Math.max(0,v.progress-dt*13*(1+counts[leader]*.12));if(v.progress===0)v.owner=null}else{v.progress=Math.min(100,v.progress+dt*10*(1+counts[leader]*.15));if(v.progress>=100&&v.owner!==leader)v.owner=leader}}else v.progress=Math.max(0,v.progress-dt*.9);if(v.owner)scores[v.owner]+=.12*dt}broadcast({t:'zones',zones,scores})}
setInterval(updateZones,500);
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
if(clients.size>=80){socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');return}let key=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+key+'\r\n\r\n');let c={socket,req,ip,role:roleOf(req),id:crypto.randomUUID(),joined:false,name:'',team:'blue',x:0,z:60,hp:100,lastMove:0,lastChat:0,lastAttack:0,car:null,stamina:100,hunger:100,buffer:Buffer.alloc(0),invulnerableUntil:0};clients.set(c.id,c);socket.setNoDelay(true);socket.on('data',data=>parseFrames(c,data));if(head.length)parseFrames(c,head);let leave=()=>{if(!clients.has(c.id))return;clients.delete(c.id);releaseCar(c);if(c.joined){broadcast({t:'leave',id:c.id});count()}};socket.on('close',leave);socket.on('error',leave)});
server.listen(PORT,'0.0.0.0',()=>console.log(`광화문 점령전 V4 : http://localhost:${PORT}`));