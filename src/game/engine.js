
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeWeapon, makeOptic, makeOperative, setOperativeWeapon, animateOperatives, surfaceTexture, soldierReady, setTeamMark } from './visuals.js';
import { DEFAULT_INVENTORY, DEFAULT_SETTINGS, SCOPE_IDS, SCOPE_ZOOM } from './data.ts';
import { ARENA, buildArena } from './arena.js';

let gameSettings = { ...DEFAULT_SETTINGS };
let inventoryState = structuredClone(DEFAULT_INVENTORY);
let initialized = false, training = false;
let syncTimer = null;
const post = (type, data = {}) => parent.postMessage({ source: 'erangel-game', type, ...data }, location.origin);


const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const dist2=(ax,az,bx,bz)=>{const dx=ax-bx,dz=az-bz;return dx*dx+dz*dz;};
const TAU=Math.PI*2;

const TEAM_COLORS = [0x3b82f6, 0xef4444];
const TEAM_NAMES  = ['BLUE', 'RED'];
const TEAM_HEX_CSS = ['#3b82f6', '#ef4444'];
const MAP = 220;
const HALF = MAP/2;
const ZONE_INIT_R = 10000;
const TDM = true;

/* ══════ SETTINGS ══════ */
const SETTINGS_KEY = 'dropzone_settings_v6';
const settings = (()=>{
  const s = { blueBots: 0, redBots: 0, bluePlayers: 0, redPlayers: 0, playerTeam: 0, scoreLimit: 40, minutes: 8 };
  try{ Object.assign(s, JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')); }catch(e){}
  s.blueBots = clamp(s.blueBots|0, 0, 12);
  s.redBots = clamp(s.redBots|0, 0, 12);
  s.bluePlayers = clamp(s.bluePlayers|0, 0, 8);
  s.redPlayers = clamp(s.redPlayers|0, 0, 8);
  s.scoreLimit = clamp(s.scoreLimit|0, 10, 80);
  s.minutes = clamp(s.minutes|0, 3, 15);
  s.playerTeam = s.playerTeam === 1 ? 1 : 0;
  return s;
})();
function saveSettings(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch(e){} }
const elRoom = document.getElementById('setRoom');
const elLobbyMsg = document.getElementById('lobbyMsg');
function renderCounts(){
  for(const key of ['blueBots','redBots','bluePlayers','redPlayers','scoreLimit','minutes']){
    const el = document.getElementById('val-'+key);
    if(el) el.textContent = settings[key];
  }
}
renderCounts();
document.querySelectorAll('.teamBtn').forEach(b=>{
  b.classList.toggle('on', parseInt(b.dataset.team) === settings.playerTeam);
  b.addEventListener('click', ()=>{
    selectTeam(parseInt(b.dataset.team));
    saveSettings();
    if(net.connected && !net.started) sendNet({t:'team', team:settings.playerTeam});
  });
});
document.querySelectorAll('[data-step]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(net.connected && !net.isHost) return;
    const key = btn.dataset.step;
    const dir = Number(btn.dataset.dir) || 0;
    const min = Number(btn.dataset.min ?? 0);
    const max = Number(btn.dataset.max ?? 12);
    settings[key] = clamp((Number(settings[key])||0) + dir, min, max);
    renderCounts();
    saveSettings();
    if(net.connected && net.isHost) sendNet({t:'roomSettings', settings: roomSettings()});
  });
});
if(elRoom) elRoom.addEventListener('input', ()=>{ elRoom.value = elRoom.value.toUpperCase().replace(/[^A-Z0-9]/g,''); });

/* ══════ AUDIO ══════ */
const Audio_ = (()=>{
  let ctx=null, noiseBuf=null, master=null;
  function init(){ if(ctx){ ctx.resume(); return; }
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = gameSettings.muted ? 0 : gameSettings.volume / 100; master.connect(ctx.destination);
    const len = ctx.sampleRate*0.5;
    noiseBuf = ctx.createBuffer(1,len,ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  }
  function boom(vol,freq,dur,pan=0){
    if(!ctx) return;
    const src=ctx.createBufferSource(); src.buffer=noiseBuf;
    const flt=ctx.createBiquadFilter(); flt.type='lowpass'; flt.frequency.setValueAtTime(freq,ctx.currentTime);
    flt.frequency.exponentialRampToValueAtTime(Math.max(80,freq*0.15),ctx.currentTime+dur);
    const g=ctx.createGain(); g.gain.setValueAtTime(vol,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+dur);
    const panner=ctx.createStereoPanner(); panner.pan.value=pan; src.connect(flt); flt.connect(g); g.connect(panner); panner.connect(master);
    src.start(); src.stop(ctx.currentTime+dur);
  }
  function tone(vol,freq,dur,type='sine'){
    if(!ctx) return;
    const o=ctx.createOscillator(); o.type=type; o.frequency.value=freq;
    const g=ctx.createGain(); g.gain.setValueAtTime(vol,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+dur);
    o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime+dur);
  }
  return {
    init,
    configure(){ if(master) master.gain.value = gameSettings.muted || document.hidden || paused ? 0 : gameSettings.volume / 100; },
    suspend(){ if(master) master.gain.value=0; },
    shot(kind,vol=1,position=null){
      if(!ctx || !initialized || paused || phase!=='ground' || !player.alive || document.hidden || gameSettings.muted) return;
      let pan=0;
      if(position){
        const distance=player.pos.distanceTo(position);
        if(distance>130) return;
        vol *= Math.pow(1-distance/130, 2);
        const dx=position.x-player.pos.x, dz=position.z-player.pos.z;
        pan=clamp((dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw))/Math.max(1,distance),-.9,.9);
      }
      if(vol<.005) return;
      if(kind==='sniper') boom(.65*vol,3000,.31,pan);
      else if(kind==='shotgun') boom(.55*vol,1900,.24,pan);
      else if(kind==='ar') boom(.38*vol,2400,.13,pan);
      else if(kind==='smg') boom(.25*vol,2900,.085,pan);
      else boom(.28*vol,2600,.1,pan);
    },


    hit(){ tone(0.14,1400,0.05,'square'); },
    head(){ tone(0.2,2200,0.09,'square'); },
    hurt(){ boom(0.3,500,0.16); },
    reload(){ tone(0.1,700,0.05,'square'); setTimeout(()=>tone(0.1,400,0.05,'square'),120); },
    pick(){ tone(0.13,900,0.06,'triangle'); setTimeout(()=>tone(0.13,1300,0.08,'triangle'),70); },
    zone(){ tone(0.08,320,0.5,'sine'); }
  };
})();

/* ══════ RENDERER ══════ */
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb7c3c8, 55, 210);
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 2400);
camera.rotation.order = 'YXZ'; scene.add(camera);

const hemi = new THREE.HemisphereLight(0xd0dbe0, 0x57583f, 2.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3b0, 3.0);
sun.position.set(60,110,40); sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-90; sun.shadow.camera.right=90;
sun.shadow.camera.top=90; sun.shadow.camera.bottom=-90;
sun.shadow.camera.near=1; sun.shadow.camera.far=320;
sun.shadow.bias=-0.0008;
scene.add(sun); scene.add(sun.target);

const sky=new Sky();sky.scale.setScalar(2000);
sky.material.uniforms.turbidity.value=8;
sky.material.uniforms.rayleigh.value=2;
sky.material.uniforms.mieCoefficient.value=.004;
sky.material.uniforms.mieDirectionalG.value=.78;
sky.material.uniforms.sunPosition.value.copy(sun.position).normalize();scene.add(sky);


/* ══════ TERRAIN ══════ */
function terrainHeight(x,z){
  if(Math.abs(x) < ARENA.halfX + 8 && Math.abs(z) < ARENA.halfZ + 8) return 0;
  return Math.sin(x*0.02)*0.35 + Math.cos(z*0.017)*0.28;
}
{
  const seg = 200;
  const g = new THREE.PlaneGeometry(MAP, MAP, seg, seg);
  g.rotateX(-Math.PI/2);
  const p = g.attributes.position;
  const col = new Float32Array(p.count*3);
  const cA = new THREE.Color(0xa3a17d), cB = new THREE.Color(0x7f8862), cD = new THREE.Color(0x8c8065);
  const tmp = new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), z=p.getZ(i);
    const y=terrainHeight(x,z); p.setY(i,y);
    const n = Math.sin(x*0.043)*Math.cos(z*0.037)*0.5+0.5;
    tmp.copy(cA).lerp(cB,n);
    if(y>4.5) tmp.lerp(cD, clamp((y-4.5)/5,0,0.55));
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({vertexColors:true, map:surfaceTexture('ground'), roughness:1}));
  terrain.receiveShadow = true; scene.add(terrain);
}

/* ══════ COLLISION ══════ */
const colliders = [];
const CELL = 25, grid = new Map();
const gkey=(a,b)=>a+'|'+b;
function addCollider(x0,z0,x1,z1,y0,y1){
  const c={x0,z0,x1,z1,y0,y1};
  colliders.push(c);
  const i0=Math.floor(x0/CELL), i1=Math.floor(x1/CELL);
  const j0=Math.floor(z0/CELL), j1=Math.floor(z1/CELL);
  for(let i=i0;i<=i1;i++) for(let j=j0;j<=j1;j++){
    const k=gkey(i,j); let arr=grid.get(k); if(!arr){arr=[];grid.set(k,arr);} arr.push(c);
  }
}
const _tmpC=[];
function nearColliders(x,z,r){
  _tmpC.length=0;
  const i0=Math.floor((x-r)/CELL), i1=Math.floor((x+r)/CELL);
  const j0=Math.floor((z-r)/CELL), j1=Math.floor((z+r)/CELL);
  for(let i=i0;i<=i1;i++) for(let j=j0;j<=j1;j++){
    const arr=grid.get(gkey(i,j)); if(!arr) continue;
    for(const c of arr) if(_tmpC.indexOf(c)<0) _tmpC.push(c);
  }
  return _tmpC;
}
function resolveXZ(pos, radius, yFoot, yHead){
  const list = nearColliders(pos.x,pos.z,radius+2);
  for(let n=0;n<list.length;n++){
    const c=list[n];
    if(yHead < c.y0 || yFoot > c.y1) continue;
    const cx = clamp(pos.x, c.x0, c.x1), cz = clamp(pos.z, c.z0, c.z1);
    let dx = pos.x-cx, dz = pos.z-cz;
    const d2 = dx*dx+dz*dz;
    if(d2 < radius*radius){
      if(d2 > 1e-7){ const d = Math.sqrt(d2); const push = (radius-d)/d; pos.x += dx*push; pos.z += dz*push; }
      else {
        const l=pos.x-c.x0, r=c.x1-pos.x, b=pos.z-c.z0, t=c.z1-pos.z;
        const mn=Math.min(l,r,b,t);
        if(mn===l) pos.x=c.x0-radius; else if(mn===r) pos.x=c.x1+radius;
        else if(mn===b) pos.z=c.z0-radius; else pos.z=c.z1+radius;
      }
    }
  }
}

/* ══════ WORLD ══════ */
const plaster=surfaceTexture('plaster'), tile=surfaceTexture('roof');
const MATS = {
  wall: new THREE.MeshStandardMaterial({color:0xc3bd9f,map:plaster,bumpMap:plaster,bumpScale:.025,roughness:.98}),
  wall2: new THREE.MeshStandardMaterial({color:0x9ca799,map:plaster,roughness:.98}),
  roof: new THREE.MeshStandardMaterial({color:0x986d50,map:tile,bumpMap:tile,bumpScale:.05,roughness:.95}),
  wood: new THREE.MeshStandardMaterial({color:0x756247,map:surfaceTexture('wood'),roughness:.9}),
  metal: new THREE.MeshStandardMaterial({color:0x6b7268,roughness:.6,metalness:.5}),
  crate: new THREE.MeshStandardMaterial({color:0x8d7957,map:surfaceTexture('wood'),roughness:.9}),
  trunk: new THREE.MeshStandardMaterial({color:0x66513d,roughness:1}),
  leaf: new THREE.MeshStandardMaterial({color:0x536947,roughness:1}),
  leaf2: new THREE.MeshStandardMaterial({color:0x697650,roughness:1}),
  rock: new THREE.MeshStandardMaterial({color:0x989782,roughness:1}),
  concrete: new THREE.MeshStandardMaterial({color:0xa7adb1,map:surfaceTexture('concrete'),roughness:.9,metalness:.06}),
  asphalt: new THREE.MeshStandardMaterial({color:0x3c4144,map:surfaceTexture('asphalt'),roughness:.96}),
  containerBlue: new THREE.MeshStandardMaterial({color:0x2d5678,roughness:.48,metalness:.42}),
  containerRed: new THREE.MeshStandardMaterial({color:0x8d3d36,roughness:.5,metalness:.38}),
  containerOlive: new THREE.MeshStandardMaterial({color:0x5d6848,roughness:.55,metalness:.32}),
  hazard: new THREE.MeshStandardMaterial({color:0xd6a23a,roughness:.62,metalness:.12}),
  glass: new THREE.MeshStandardMaterial({color:0xb7e4ee,transparent:true,opacity:.28,roughness:.08,metalness:.2}),
};


const geosByName = {};
const renderChunks=[];
function pushGeo(name,geo){
  geo.computeBoundingBox();
  const center=geo.boundingBox.getCenter(new THREE.Vector3());
  const key=name+'|'+Math.floor(center.x/80)+'|'+Math.floor(center.z/80);
  (geosByName[key] ||= []).push(geo);
}

function addBox(name,w,h,d,x,y,z,collide=true){
  const g=new THREE.BoxGeometry(w,h,d); g.translate(x,y,z); pushGeo(name,g);
  if(collide && h>0.35) addCollider(x-w/2, z-d/2, x+w/2, z+d/2, y-h/2, y+h/2);
}
const worldMeshes = [], buildingSpots = [], floorSurfaces = [], stairRamps = [];
let activeWall='wall';

function walkableHeight(x,z,y){
  let height=terrainHeight(x,z);
  for(const f of floorSurfaces){
    if(x>=f.x0 && x<=f.x1 && z>=f.z0 && z<=f.z1 && y>=f.y-.45) height=Math.max(height,f.y);
  }
  for(const r of stairRamps){
    if(x<r.x0 || x>r.x1 || z<r.z0 || z>r.z1) continue;
    const h=r.y0+(z-r.z0)/(r.z1-r.z0)*(r.y1-r.y0);
    if(y>=h-.55 && y<=h+1.5) height=Math.max(height,h);
  }
  return height;
}


function makeWall(alongX, span, perp, cx, cz, y0, H, t, opening){
  const half = span/2; const parts = [];
  if(!opening){ parts.push({a:-half,b:half,ya:0,yb:H}); }
  else {
    const c = opening.pos*half;
    const a0 = clamp(c-opening.width/2,-half,half), a1 = clamp(c+opening.width/2,-half,half);
    if(opening.type==='door'){
      if(a0>-half+0.01) parts.push({a:-half,b:a0,ya:0,yb:H});
      if(a1< half-0.01) parts.push({a:a1,b:half,ya:0,yb:H});
      if(H>2.2) parts.push({a:a0,b:a1,ya:2.2,yb:H});
    } else {
      if(a0>-half+0.01) parts.push({a:-half,b:a0,ya:0,yb:H});
      if(a1< half-0.01) parts.push({a:a1,b:half,ya:0,yb:H});
      parts.push({a:a0,b:a1,ya:0,yb:1.05});
      if(H>2.25) parts.push({a:a0,b:a1,ya:2.25,yb:H});
    }
  }
  for(const p of parts){
    const len=p.b-p.a; if(len<0.06) continue;
    const h=p.yb-p.ya; if(h<0.05) continue;
    const mid=(p.a+p.b)/2; const y=y0+p.ya+h/2;
    const name = activeWall;
    if(alongX) addBox(name, len, h, t, cx+mid, y, cz+perp);
    else       addBox(name, t, h, len, cx+perp, y, cz+mid);
  }
}
function makeBuilding(cx,cz,w,d){
  const gy=terrainHeight(cx,cz), H=3.25, t=.28, levels=Math.random()<.55?2:3;
  activeWall=Math.random()<.48?'wall':'wall2';
  const b={x:cx,z:cz,w,d,gy,levels,H}; buildingSpots.push(b);
  addBox('wall2',w+.55,.55,d+.55,cx,gy-.2,cz,false);
  const stairX=cx+w/2-1.6, z0=cz-d/2+1.1, z1=cz+d/2-1.1;
  for(let floor=0;floor<levels;floor++){
    const y=gy+floor*H+.08;
    if(floor===0){
      addBox('wood',w,.14,d,cx,y-.07,cz,false);
      floorSurfaces.push({x0:cx-w/2,x1:cx+w/2,z0:cz-d/2,z1:cz+d/2,y});
    } else {
      const leftEnd=stairX-1.05, leftStart=cx-w/2;
      addBox('wood',leftEnd-leftStart,.16,d,(leftStart+leftEnd)/2,y-.08,cz,false);
      floorSurfaces.push({x0:leftStart,x1:leftEnd,z0:cz-d/2,z1:cz+d/2,y});
      addBox('wood',2.7,.16,1.5,stairX,y-.08,cz+d/2-.75,false);
      floorSurfaces.push({x0:leftEnd,x1:cx+w/2,z0:cz+d/2-1.5,z1:cz+d/2,y});
    }
    for(const alongX of [true,false]) for(const side of [-1,1]){
      const span=alongX?w:d, cells=Math.max(3,Math.floor(span/3.4)), cell=span/cells;
      for(let i=0;i<cells;i++){
        const offset=-span/2+cell*(i+.5), front=alongX&&side===-1;
        const door=floor===0&&alongX&&i===Math.floor(cells/2);
        const opening={type:door?'door':'window',pos:0,width:door?1.7:1.35};
        makeWall(alongX,cell,side*(alongX?d:w)/2,alongX?cx+offset:cx,alongX?cz:cz+offset,y,H,t,opening);
        if(!door){
          const wx=alongX?cx+offset:cx+side*w/2, wz=alongX?cz+side*d/2:cz+offset;
          addBox('wood',alongX?1.57:.12,.1,alongX?.12:1.57,wx,y+1.04,wz,false);
          for(const edge of [-1,1]) addBox('wood',alongX?.075:.13,1.27,alongX?.13:.075,wx+(alongX?edge*.7:0),y+1.66,wz+(!alongX?edge*.7:0),false);
        }
      }
    }
    for(const side of [-1,1]){
      addBox('wall2',w+.35,.12,.32,cx,y+H-.04,cz+side*d/2,false);
      addBox('wall2',.32,.12,d+.35,cx+side*w/2,y+H-.04,cz,false);
    }
    if(floor<levels-1){
      stairRamps.push({x0:stairX-.8,x1:stairX+.8,z0,z1,y0:y,y1:y+H});
      for(let i=0;i<20;i++){
        const step=(z1-z0)/20;
        addBox('wood',1.6,.17,step+.025,stairX,y+(i+1)*H/20-.085,z0+(i+.5)*step,false);
      }
      // Both stair edges have visible rails and continuous invisible collision barriers.
      // The barriers follow the ramp's full height so the player cannot slip off mid-climb.
      for(const side of [-1,1]){
        const railX=stairX+side*.85;
        const rail=new THREE.BoxGeometry(.045,.045,Math.hypot(z1-z0,H));
        rail.rotateX(-Math.atan2(H,z1-z0));
        rail.translate(railX,y+H/2+.85,(z0+z1)/2);pushGeo('metal',rail);
        for(let i=0;i<5;i++) addBox('metal',.035,.85,.035,railX,y+i*H/4+.425,z0+i*(z1-z0)/4,false);
        addCollider(railX-.055,z0,railX+.055,z1,y-.1,y+H+1.1);
      }
    }
    addBox('crate',.85,.85,.85,cx-w*.22,y+.425,cz+d*.22);
  }
  const roofY=gy+levels*H+.15, rise=1.7, half=d/2+.65, length=Math.hypot(half,rise);
  for(const side of [-1,1]){
    const g=new THREE.BoxGeometry(w+1.2,.18,length);
    g.rotateX(side*Math.atan2(rise,half)); g.translate(cx,roofY+rise/2,cz+side*half/2); pushGeo('roof',g);
  }
  addBox('wall2',.8,2.1,.8,cx+w*.25,roofY+1.2,cz+d*.18,false);
  if(levels===3){
    const by=gy+H+.08;
    addBox('wall2',w*.48,.16,1.5,cx,by-.08,cz-d/2-.65,false);
    addBox('metal',w*.48,.06,.06,cx,by+.9,cz-d/2-1.35,false);
    for(let i=0;i<6;i++) addBox('metal',.04,.88,.04,cx-w*.24+i*w*.48/5,by+.45,cz-d/2-1.35,false);
  }
}


buildArena({
  addBox, makeWall, floorSurfaces, stairRamps, buildingSpots, scene, THREE, setWall(name){ activeWall = name; },
});
for(const key in geosByName){
  const name=key.split('|')[0],source=geosByName[key];
  const merged=mergeGeometries(source,false);if(!merged)continue;
  for(const geo of source)geo.dispose();
  merged.computeBoundingSphere();
  const mat = MATS[name] || MATS.concrete;
  const mesh=new THREE.Mesh(merged, mat);
  mesh.castShadow = name !== 'glass';
  mesh.receiveShadow = name !== 'glass';
  scene.add(mesh);
  mesh.userData.center=merged.boundingSphere.center;renderChunks.push(mesh);
  if(!['leaf','leaf2','trunk','rock','glass'].includes(name))worldMeshes.push(mesh);
}

/* WEAPONS */
const WEAPONS = {
  P92:    {label:'P92',    ammo:'light', dmg:24, rpm:420, mag:15, spread:0, auto:false, pellets:1, range:110, recoil:0,  snd:'pistol',  model:'pistol'},
  P1911:  {label:'P1911',  ammo:'light', dmg:32, rpm:360, mag:7,  spread:0, auto:false, pellets:1, range:120, recoil:0,  snd:'pistol',  model:'pistol'},
  UMP45:  {label:'UMP45',  ammo:'light', dmg:20, rpm:620, mag:30, spread:0, auto:true,  pellets:1, range:150, recoil:0, snd:'smg',     model:'smg'},
  Vector: {label:'Vector', ammo:'light', dmg:18, rpm:1100,mag:19, spread:0, auto:true,  pellets:1, range:120, recoil:0,  snd:'smg',     model:'smg'},
  M416:   {label:'M416',   ammo:'heavy', dmg:27, rpm:700, mag:30, spread:0, auto:true,  pellets:1, range:260, recoil:0, snd:'ar',      model:'rifle'},
  SCAR:   {label:'SCAR-L', ammo:'heavy', dmg:26, rpm:620, mag:30, spread:0, auto:true,  pellets:1, range:250, recoil:0, snd:'ar',      model:'rifle'},
  M762:   {label:'M762',   ammo:'heavy', dmg:33, rpm:680, mag:30, spread:0, auto:true,  pellets:1, range:240, recoil:0,  snd:'ar',      model:'rifle'},
  AKM:    {label:'AKM',    ammo:'heavy', dmg:35, rpm:600, mag:30, spread:0, auto:true,  pellets:1, range:250, recoil:0, snd:'ar',      model:'rifle'},
  Groza:  {label:'Groza',  ammo:'heavy', dmg:38, rpm:720, mag:30, spread:0, auto:true,  pellets:1, range:230, recoil:0, snd:'ar',      model:'rifle'},
  DP28:   {label:'DP-28',  ammo:'heavy', dmg:36, rpm:520, mag:47, spread:0, auto:true,  pellets:1, range:260, recoil:0,  snd:'ar',      model:'rifle'},
  Mini14: {label:'Mini14', ammo:'heavy', dmg:48, rpm:280, mag:20, spread:0, auto:false, pellets:1, range:380, recoil:0,  snd:'ar',      model:'sniper'},
  KAR98K: {label:'Kar98k', ammo:'heavy', dmg:88, rpm:48,  mag:5,  spread:0, auto:false, pellets:1, range:420, recoil:0,  snd:'sniper',  model:'sniper'},
  AWM:    {label:'AWM',    ammo:'heavy', dmg:135,rpm:35,  mag:5,  spread:0, auto:false, pellets:1, range:520, recoil:0,  snd:'sniper',  model:'sniper'},
  S686:   {label:'S686',   ammo:'shell', dmg:15, rpm:130, mag:2,  spread:0, auto:false, pellets:8, range:42,  recoil:0,  snd:'shotgun', model:'shotgun'},
  S12K:   {label:'S12K',   ammo:'shell', dmg:12, rpm:300, mag:5,  spread:0, auto:true,  pellets:7, range:45,  recoil:0,  snd:'shotgun', model:'shotgun'},
};
const WEAPON_POOL = [
  'P92','P92','P92','P1911','P1911',
  'UMP45','UMP45','Vector','Vector','Vector',
  'M416','M416','M416','SCAR','SCAR','M762','M762',
  'AKM','AKM','Groza','Groza',
  'Mini14','Mini14','KAR98K','KAR98K','AWM',
  'S686','S686','S12K','DP28',
];

/* ══════ VIEWMODEL ══════ */
const vmRoot = new THREE.Group(); camera.add(vmRoot);
const vmMats = {
  body: new THREE.MeshLambertMaterial({color:0x2c2f34}),
  grip: new THREE.MeshLambertMaterial({color:0x1b1d20}),
  accent: new THREE.MeshLambertMaterial({color:0x555a60}),
  wood: new THREE.MeshLambertMaterial({color:0x6a4a2a}),
};
function buildGun(kind){ return makeWeapon(kind,currentSlot()?.scope,currentSlot()?.id); }


let vmModel = null;
function setViewModel(kind){
  if(typeof localOperative!=='undefined')setOperativeWeapon(localOperative,currentSlot()?.id,kind,currentSlot()?.scope);
  if(vmModel){ vmRoot.remove(vmModel); vmModel.traverse(o=>{o.geometry&&o.geometry.dispose();}); }
  vmModel = kind ? buildGun(kind) : null;
  if(vmModel){ vmModel.position.set(0.22,-0.2,-0.42); vmModel.rotation.set(0,0.03,0); vmRoot.add(vmModel); }
}
const muzzle = new THREE.PointLight(0xffcc66, 0, 8); muzzle.position.set(0.22,-0.16,-0.9); camera.add(muzzle);

/* ══════ PLAYER ══════ */
const localOperative=makeOperative(0); scene.add(localOperative);
const player = {
  pos: new THREE.Vector3(0,0,0), vel: new THREE.Vector3(),
  yaw:0, pitch:0, hp:100, onGround:false, crouch:false, sprint:false,
  radius:0.42, eye:1.66,
  slots:[{id:null,mag:0},{id:null,mag:0}], slot:0,
  ammo:{light:0,heavy:0,shell:0}, heals:0,
  nextFire:0, reloadEnd:0, reloading:false,
  recPitch:0, recYaw:0, ads:false, kills:0, alive:true,
  _triggerHeld:false, team: 0, spawnShield: 0,
};
let teamScore = [0, 0];
let matchTimeLeft = 8 * 60;
let matchOver = false;
let matchBooted = false;
let respawnAt = 0;
let phase = 'plane';
let paused = false;

/* ══════ BOTS ══════ */
const botGeo = new THREE.CapsuleGeometry(0.34,0.95,4,8);
const botHeadGeo = new THREE.SphereGeometry(0.23,10,8);
const botGunGeo = new THREE.BoxGeometry(0.07,0.1,0.55);
const bots = [];
const botMeshes = new THREE.Group(); scene.add(botMeshes);
let botIdCounter = 0;
function spawnBot(x,z,team){
  const gy = terrainHeight(x,z);
  const g = new THREE.Group();
  const operative=makeOperative(team); operative.position.y=-1; g.add(operative);
  const body=new THREE.Mesh(botGeo,new THREE.MeshBasicMaterial({visible:false}));
  const head=new THREE.Mesh(botHeadGeo,new THREE.MeshBasicMaterial({visible:false}));
  head.position.y=.55; const gun=new THREE.Group();
  g.add(body,head,gun); g.userData.operative=operative;
  g.position.set(x,gy+1,z); botMeshes.add(g);


  const id = 'b'+(botIdCounter++);
  const bot = {
    id, obj:g, head, body, gun,
    pos:new THREE.Vector3(x,gy,z),
    hp:100, alive:true,
    state:'roam',
    target:new THREE.Vector3(rand(-HALF*0.7,HALF*0.7),0,rand(-HALF*0.7,HALF*0.7)),
    retarget:0, fireAt:0, losTimer:0, hasLOS:false, losTargetKey:null,
    name:(team===0?'BLUE_':'RED_')+randi(100,999),
    speed: rand(2.6,4.2), team,
  };
  bots.push(bot);
  return bot;
}
function clearBots(){ for(const b of bots) botMeshes.remove(b.obj); bots.length = 0; botIdCounter = 0; }

/* ══════ REMOTE PLAYERS ══════ */
const remoteGroup = new THREE.Group(); scene.add(remoteGroup);
const remoteMeshes = new Map();
const remoteRGeo = new THREE.CapsuleGeometry(0.34,0.95,4,8);
const remoteHGeo = new THREE.SphereGeometry(0.23,10,8);
const remoteGGeo = new THREE.BoxGeometry(0.07,0.1,0.55);
function getRemoteMesh(id, team=0){
  if(remoteMeshes.has(id)) return remoteMeshes.get(id);
  const g = new THREE.Group();
  const operative = makeOperative(team);
  operative.position.y = -1;
  g.add(operative);
  remoteGroup.add(g);
  const rec = {group:g, operative, team, target:new THREE.Vector3(), targetYaw:0, seen:false, prev:null};
  remoteMeshes.set(id, rec);
  return rec;
}

/* ══════ LOOT ══════ */
const lootGroup = new THREE.Group(); scene.add(lootGroup);
const lootItems = [];
const lootGeoW = new THREE.BoxGeometry(0.42,0.26,0.42);
const lootGeoA = new THREE.BoxGeometry(0.3,0.2,0.24);

function spawnLoot(x,z,type,data){
  const gy = (data.y ?? terrainHeight(x,z))+.22;
  let mesh;
  if(type==='weapon'){
    mesh=new THREE.Group();
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(.08,.1,.55),MATS.metal); mesh.add(receiver);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(.09,.13,.2),MATS.wood); stock.position.z=.3;mesh.add(stock);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.3,8),MATS.metal);barrel.rotation.x=Math.PI/2;barrel.position.z=-.4;mesh.add(barrel);
    const mag=new THREE.Mesh(new THREE.BoxGeometry(.06,.2,.09),MATS.metal);mag.position.set(0,-.12,-.02);mesh.add(mag);
    mesh.rotation.z=Math.PI/2;

  } else if(type==='scope'){
    mesh=makeOptic(data.id); mesh.scale.setScalar(3);
  } else if(type==='backpack'){
    mesh=new THREE.Mesh(new THREE.BoxGeometry(.38,.5,.25),MATS.wood);
  } else if(type==='ammo'){
    mesh = new THREE.Mesh(lootGeoA, new THREE.MeshLambertMaterial({color:0x6ec9ff, emissive:0x112244, emissiveIntensity:0.3}));
  } else {
    // MEDKIT — white box with red cross on top. unmistakable.
    const grp = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42,0.32,0.42), new THREE.MeshLambertMaterial({color:0xffffff, emissive:0x333333, emissiveIntensity:0.4}));
    grp.add(box);
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.09,0.10), new THREE.MeshLambertMaterial({color:0xff2222, emissive:0xff2222, emissiveIntensity:0.8}));
    c1.position.y = 0.18; grp.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.10,0.09,0.28), new THREE.MeshLambertMaterial({color:0xff2222, emissive:0xff2222, emissiveIntensity:0.8}));
    c2.position.y = 0.18; grp.add(c2);
    mesh = grp;
  }
  mesh.position.set(x,gy,z);
  mesh.traverse(o=>{ if(o.isMesh) o.castShadow = false; });
  lootGroup.add(mesh);
  lootItems.push({mesh,type,data,x,z,baseY:gy,taken:false});
}

/* ══════ ZONE ══════ */
const zoneState = {
  cx:0, cz:0, r:ZONE_INIT_R, nextCx:0, nextCz:0, nextR:ZONE_INIT_R*0.55,
  phase:0, t:0, waitTime:32, shrinkTime:24, shrinking:false,
  dps:[1,2,3,5,8,12], totalPhases:6,
};
const zoneRing = new THREE.Mesh(
  new THREE.CylinderGeometry(1,1,90,96,1,true),
  new THREE.MeshBasicMaterial({color:0x3fa9ff,transparent:true,opacity:0.16,side:THREE.DoubleSide,depthWrite:false})
);
zoneRing.position.y = 40; zoneRing.visible = false; scene.add(zoneRing);
const zoneRingEdge = new THREE.Mesh(
  new THREE.CylinderGeometry(1,1,90,96,1,true),
  new THREE.MeshBasicMaterial({color:0x7fd0ff,transparent:true,opacity:0.55,side:THREE.DoubleSide,wireframe:true,depthWrite:false})
);
zoneRingEdge.position.y=40; zoneRingEdge.visible=false; scene.add(zoneRingEdge);
const zoneGroundRing = new THREE.Mesh(
  new THREE.RingGeometry(0.97,1.0,96),
  new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false})
);
zoneGroundRing.rotation.x = -Math.PI/2; zoneGroundRing.position.y = 0.4; zoneGroundRing.visible=false; scene.add(zoneGroundRing);
function newZoneTarget(){
  const z = zoneState;
  if(z.r < 8){ z.nextR = 0; return; }
  z.nextR = Math.max(0, z.r * 0.55);
  const maxOff = Math.max(0, z.r - z.nextR) * 0.75;
  const a = rand(0,TAU), d = rand(0,maxOff);
  z.nextCx = z.cx + Math.cos(a)*d;
  z.nextCz = z.cz + Math.sin(a)*d;
}
newZoneTarget();
function updateZoneVisuals(){
  const rr = Math.max(0.5, zoneState.r);
  zoneRing.position.set(zoneState.cx, 40, zoneState.cz); zoneRing.scale.set(rr, 1, rr);
  zoneRingEdge.position.set(zoneState.cx, 40, zoneState.cz); zoneRingEdge.scale.set(rr, 1, rr);
  zoneGroundRing.position.set(zoneState.cx, terrainHeight(zoneState.cx,zoneState.cz)+0.6, zoneState.cz);
  zoneGroundRing.scale.setScalar(Math.max(0.5,zoneState.nextR));
  zoneGroundRing.visible = zoneState.nextR > 1;
}

/* ══════ WEAPON HELPERS ══════ */
function currentWeapon(){ const s = player.slots[player.slot]; return s && s.id ? WEAPONS[s.id] : null; }
function currentSlot(){ return player.slots[player.slot]; }
function switchSlot(i){
  if(!initialized || paused || i===player.slot) return; if(!player.slots[i]?.id) return;
  player.slot = i; player.reloading = false; player.ads = false;
  scopeLatched = false; updateScopeUI(); setViewModel(currentWeapon()?.model); refreshWeaponUI(); Audio_.reload();
}
function reload(){
  const w = currentWeapon(); const s = currentSlot();
  if(!w || !s) return; if(s.mag >= w.mag) return;
  const need = w.mag - s.mag; const have = player.ammo[w.ammo];
  if(have <= 0) return;
  const take = Math.min(need, have);
  player.ammo[w.ammo] -= take; s.mag += take;
  player.reloading = true; player.reloadEnd = performance.now() + 1400;
  Audio_.reload(); refreshWeaponUI();
}

/* ══════ COMBAT ══════ */
const _ray = new THREE.Raycaster();
function castWorldDistance(origin, dir, maxDist){
  let best = maxDist;
  if(worldMeshes.length){
    _ray.set(origin, dir); _ray.far = maxDist; _ray.near = 0;
    const hits = _ray.intersectObjects(worldMeshes, false);
    if(hits.length) best = Math.min(best, hits[0].distance);
  }
  const step = 1.6, lim = Math.min(best, maxDist);
  for(let t=step; t<lim; t+=step){
    const px = origin.x+dir.x*t, py = origin.y+dir.y*t, pz = origin.z+dir.z*t;
    if(py < terrainHeight(px,pz)){ best = t; break; }
  }
  return best;
}
function raySphere(ox,oy,oz, dx,dy,dz, cx,cy,cz, r){
  const ocx=cx-ox, ocy=cy-oy, ocz=cz-oz;
  const t = ocx*dx+ocy*dy+ocz*dz; if(t<0) return -1;
  const d2 = (ocx*ocx+ocy*ocy+ocz*ocz) - t*t; const r2 = r*r;
  if(d2>r2) return -1;
  return t - Math.sqrt(r2-d2);
}
function fireOnce(){
  if(!initialized || paused || phase!=='ground' || !player.alive) return;
  const now = performance.now();
  const w = currentWeapon(); const s = currentSlot();
  if(!w || !s) return;
  if(player.reloading && now < player.reloadEnd) return;
  if(now < player.nextFire) return;
  if(s.mag <= 0){ reload(); return; }
  player.nextFire = now + 60000/w.rpm; s.mag--;
  Audio_.shot(w.snd, 0.9);
  muzzle.intensity = 3.5;
  const rk = w.recoil * (player.ads?0.55:1) * (player.crouch?0.7:1);
  player.recPitch += rk*0.012; player.recYaw += rand(-1,1)*rk*0.006;
  vmKick = Math.min(1, vmKick + 0.8);
  const cameraOrigin=camera.getWorldPosition(new THREE.Vector3());
  const cameraDirection=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  const aimPoint=cameraOrigin.clone().addScaledVector(cameraDirection,castWorldDistance(cameraOrigin,cameraDirection,w.range));
  const origin=player.pos.clone().add(new THREE.Vector3(0,player.crouch?1.05:1.5,0));
  const baseDir=aimPoint.sub(origin).normalize();
  if(net.connected) sendNet({t:'shoot',d:{ox:origin.x,oy:origin.y,oz:origin.z,dx:baseDir.x,dy:baseDir.y,dz:baseDir.z,len:w.range,weapon:s.id}});

  const spread = w.spread * (player.ads?0.35:1) * (player.crouch?0.75:1) * (player.sprint?1.9:1);
  let hitAny = false;
  const worldLimit = w.range;
  for(let p=0;p<w.pellets;p++){
    const dir = baseDir.clone();
    if(spread>0 || w.pellets>1){
      dir.x += rand(-spread,spread); dir.y += rand(-spread,spread); dir.z += rand(-spread,spread);
      dir.normalize();
    }
    const wallDist = castWorldDistance(origin, dir, worldLimit);
    let bestT = wallDist, bestBot = null, bestRemote = null, headshot = false;
    for(const b of bots){
      if(!b.alive || b.team === player.team) continue;
      const bx=b.pos.x, by=b.pos.y+1.0, bz=b.pos.z;
      const tBody = raySphere(origin.x,origin.y,origin.z, dir.x,dir.y,dir.z, bx,by,bz, 0.55);
      const tHead = raySphere(origin.x,origin.y,origin.z, dir.x,dir.y,dir.z, bx,by+0.55,bz, 0.30);
      let t=-1, isHead=false;
      if(tHead>=0 && tHead<wallDist){ t=tHead; isHead=true; }
      else if(tBody>=0 && tBody<wallDist){ t=tBody; }
      if(t>=0 && t<bestT){ bestT=t; bestBot=b; bestRemote=null; headshot=isHead; }
    }
    for(const [pid, rp] of net.remotePlayers){
      if(!rp.alive || rp.team === player.team) continue;
      const rx=rp.x, ry=rp.y+1.0, rz=rp.z;
      const tBody = raySphere(origin.x,origin.y,origin.z, dir.x,dir.y,dir.z, rx,ry,rz, 0.55);
      const tHead = raySphere(origin.x,origin.y,origin.z, dir.x,dir.y,dir.z, rx,ry+0.55,rz, 0.30);
      let t=-1, isHead=false;
      if(tHead>=0 && tHead<wallDist){ t=tHead; isHead=true; }
      else if(tBody>=0 && tBody<wallDist){ t=tBody; }
      if(t>=0 && t<bestT){ bestT=t; bestBot=null; bestRemote={id:pid}; headshot=isHead; }
    }
    if(bestBot){
      hitAny = true;
      const dmg = w.dmg * (headshot?2.6:1);
      damageBot(bestBot, dmg, headshot);
      spawnTracer(origin, dir, bestT, 0xffcc55);
    } else if(bestRemote){
      hitAny = true;
      const dmg = w.dmg * (headshot?2.6:1);
      netHitPlayer(bestRemote.id, dmg, headshot);
      spawnTracer(origin, dir, bestT, 0xffcc55);
    } else {
      spawnTracer(origin, dir, Math.min(wallDist, worldLimit), 0xffffff);
    }
  }
  if(hitAny){ Audio_.hit(); flashHitmarker(); }
  refreshWeaponUI();
}
function damageBot(b, dmg, head, killerTeam=player.team, creditLocal=true){
  if(!b.alive || matchOver) return;
  if(net.connected && !net.isHost){
    sendNet({t:'hitBot', d:{botId:b.id, dmg, head, team:player.team}});
    return;
  }
  b.hp -= dmg;
  if(head && creditLocal) Audio_.head();
  if(b.hp <= 0){
    b.alive=false; b.hp=0;
    b.respawnAt = performance.now() + 3000;
    b.obj.rotation.z = Math.PI/2 * (Math.random()<0.5?1:-1);
    b.obj.position.y = terrainHeight(b.pos.x,b.pos.z)+0.34;
    if(creditLocal) player.kills++;
    addKillFeed(`${creditLocal?'YOU':TEAM_NAMES[killerTeam]||'TEAM'} ✕ ${b.name}${head?' ⌖':''}`, TEAM_HEX_CSS[killerTeam] || '#ffd54a');
    awardScore(killerTeam);
    updateAliveCount();
  }
}
const tracers = [];
function spawnTracer(origin, dir, len, color){
  const end = origin.clone().addScaledVector(dir, len);
  const g = new THREE.BufferGeometry().setFromPoints([origin.clone(), end]);
  const m = new THREE.LineBasicMaterial({color, transparent:true, opacity:0.85});
  const line = new THREE.Line(g,m); scene.add(line);
  tracers.push({line, life:0.09});
}

/* ══════ HUD ══════ */
const $ = id=>document.getElementById(id);
const elHpFill=$('hpfill'), elHpText=$('hptext'), elMag=$('mag'), elRes=$('res'),
      elWName=$('wname'), elAlive=$('alive'), elZoneTimer=$('zoneTimer'),
      elKillFeed=$('killfeed'), elMsg=$('msg'), elPrompt=$('prompt'),
      elVig=$('vig'), elCross=$('crosshair'), elHit=$('hitmarker'),
      elScope=$('scope'), elS0=$('s0'), elS1=$('s1'), elTeamBadge=$('teamBadge'),
      elPickupToast=$('pickupToast');

function refreshWeaponUI(){
  const w = currentWeapon(); const s = currentSlot();
  if(w && s){ elWName.textContent = w.label; elMag.textContent = s.mag; elRes.textContent = player.ammo[w.ammo]; }
  else { elWName.textContent = 'FISTS'; elMag.textContent = '0'; elRes.textContent = '0'; }
  elS0.textContent = player.slots[0].id ? WEAPONS[player.slots[0].id].label : '—';
  elS1.textContent = player.slots[1].id ? WEAPONS[player.slots[1].id].label : '—';
  elS0.classList.toggle('on', player.slot===0);
  elS1.classList.toggle('on', player.slot===1);
  $('backpack-count').textContent=inventoryState.weapons.length;
  queueInventorySync();
}
function refreshHealthUI(){
  const hp = clamp(player.hp,0,100);
  elHpFill.style.width = hp+'%';
  elHpFill.classList.toggle('low', hp<35);
  elHpText.textContent = Math.ceil(hp)+' HP' + (player.heals>0?`  ·  ✚${player.heals}`:'');
}
function refreshTeamBadge(){
  elTeamBadge.textContent = TEAM_NAMES[player.team] || 'SOLO';
  elTeamBadge.style.background = TEAM_HEX_CSS[player.team] ? TEAM_HEX_CSS[player.team]+'55' : 'rgba(0,0,0,.5)';
  elTeamBadge.style.borderColor = TEAM_HEX_CSS[player.team] || 'rgba(255,255,255,.2)';
}
function flashHitmarker(){
  elHit.classList.add('on'); elCross.classList.add('hit');
  clearTimeout(flashHitmarker._t);
  flashHitmarker._t = setTimeout(()=>{ elHit.classList.remove('on'); elCross.classList.remove('hit'); },110);
}
function addKillFeed(text, color){
  const d = document.createElement('div');
  d.textContent = text; d.style.borderLeftColor = color||'#ffd54a';
  elKillFeed.appendChild(d);
  setTimeout(()=>d.remove(), 5000);
  while(elKillFeed.children.length>6) elKillFeed.firstChild.remove();
}
function showPickupToast(text, color){
  const d = document.createElement('div');
  d.textContent = text;
  d.style.color = color || '#54e08a';
  elPickupToast.appendChild(d);
  setTimeout(()=>d.remove(), 1300);
  while(elPickupToast.children.length>4) elPickupToast.firstChild.remove();
}
function showMsg(main, sub, dur=2200){
  elMsg.innerHTML = main + (sub?`<small>${sub}</small>`:'');
  elMsg.classList.add('on');
  clearTimeout(showMsg._t);
  if(dur>0) showMsg._t = setTimeout(()=>elMsg.classList.remove('on'), dur);
}
function updateAliveCount(){
  const blue = bots.filter(b=>b.alive && b.team===0).length + [...net.remotePlayers.values()].filter(p=>p.alive && p.team===0).length + (player.alive && player.team===0 ? 1 : 0);
  const red = bots.filter(b=>b.alive && b.team===1).length + [...net.remotePlayers.values()].filter(p=>p.alive && p.team===1).length + (player.alive && player.team===1 ? 1 : 0);
  elAlive.textContent = 'BLUE '+blue+'  ·  RED '+red;
}
function refreshScore(){
  const blue = $('scoreBlue'), red = $('scoreRed'), timer = $('scoreTimer'), rule = $('scoreRule');
  if(blue) blue.textContent = teamScore[0];
  if(red) red.textContent = teamScore[1];
  const left = Math.max(0, Math.ceil(matchTimeLeft));
  if(timer) timer.textContent = Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
  if(rule) rule.textContent = 'FIRST TO '+(settings.scoreLimit||40);
}
function awardScore(team){
  if(matchOver) return;
  const side = team===1 ? 1 : 0;
  if(net.connected) sendNet({ t:'score', team: side });
  else { teamScore[side] += 1; refreshScore(); checkWin(); }
}
function finishMatch(winner){
  if(matchOver) return;
  matchOver = true;
  phase = 'won';
  const draw = winner === -1 || winner == null;
  const mine = winner === player.team;
  showMsg(draw ? 'DRAW' : mine ? 'VICTORY' : 'DEFEAT', 'WAREHOUSE TDM', 0);
  document.exitPointerLock?.();
  refreshScore();
}
function teamSpawn(team, index=0){
  const spots = team===1 ? ARENA.redSpawns : ARENA.blueSpawns;
  const spot = spots[Math.abs(index) % spots.length];
  return { x: spot[0] + rand(-0.6,0.6), z: spot[1] + rand(-0.6,0.6) };
}

/* ══════ MINIMAP ══════ */
const mmc = $('mmc'); const mmx = mmc.getContext('2d');
function drawMinimap(){
  const W = mmc.width, H = mmc.height;
  const scale = W / 1400; const cx = W/2, cy = H/2;
  mmx.clearRect(0,0,W,H);
  mmx.fillStyle = 'rgba(18,32,22,0.85)'; mmx.fillRect(0,0,W,H);
  mmx.strokeStyle='rgba(255,255,255,0.06)'; mmx.lineWidth=1;
  for(let i=0;i<W;i+=32){ mmx.beginPath(); mmx.moveTo(i,0); mmx.lineTo(i,H); mmx.stroke();
                          mmx.beginPath(); mmx.moveTo(0,i); mmx.lineTo(W,i); mmx.stroke(); }
  const px = player.pos.x, pz = player.pos.z;
  const toMap = (x,z)=>[cx + (x-px)*scale, cy + (z-pz)*scale];

  // buildings
  mmx.fillStyle='rgba(200,190,160,0.5)';
  for(const b of buildingSpots){
    const [mx,my]=toMap(b.x,b.z);
    if(mx<-20||mx>W+20||my<-20||my>H+20) continue;
    mmx.fillRect(mx-b.w*scale/2, my-b.d*scale/2, b.w*scale, b.d*scale);
  }

  // zones
  const [zcx,zcy] = toMap(zoneState.cx, zoneState.cz);
  mmx.strokeStyle='rgba(63,169,255,0.9)'; mmx.lineWidth=2;
  mmx.beginPath(); mmx.arc(zcx,zcy, zoneState.r*scale, 0, TAU); mmx.stroke();
  mmx.strokeStyle='rgba(255,255,255,0.85)'; mmx.lineWidth=1.5;
  mmx.beginPath(); mmx.arc(cx + (zoneState.nextCx-px)*scale, cy + (zoneState.nextCz-pz)*scale, zoneState.nextR*scale, 0, TAU); mmx.stroke();

  // BOTS — small team-coloured dots
  for(const b of bots){
    if(!b.alive) continue;
    const [mx,my]=toMap(b.pos.x,b.pos.z);
    if(mx<-4||mx>W+4||my<-4||my>H+4) continue;
    mmx.fillStyle = b.team===0 ? '#3b82f6' : '#ef4444';
    mmx.beginPath(); mmx.arc(mx,my,2.5,0,TAU); mmx.fill();
  }

  // REMOTE PLAYERS — larger white-ringed dots
  for(const [pid, rp] of net.remotePlayers){
    if(!rp.alive) continue;
    const [mx,my]=toMap(rp.x,rp.z);
    if(mx<-8||mx>W+8||my<-8||my>H+8) continue;
    mmx.fillStyle = rp.team===0 ? '#60a5fa' : '#f87171';
    mmx.strokeStyle = '#fff'; mmx.lineWidth = 1.5;
    mmx.beginPath(); mmx.arc(mx,my,5,0,TAU); mmx.fill(); mmx.stroke();
  }

  // SELF — yellow arrow
  mmx.save(); mmx.translate(cx,cy); mmx.rotate(-player.yaw);
  mmx.fillStyle='#ffd54a';
  mmx.beginPath(); mmx.moveTo(0,-7); mmx.lineTo(5,6); mmx.lineTo(0,3); mmx.lineTo(-5,6); mmx.closePath(); mmx.fill();
  mmx.restore();
}

/* ══════ NET ══════ */
const net = {
  connected: false, token: null, id: null, isHost: false, room: null,
  remotePlayers: new Map(), name: 'player',
  hasHostData: false, started: false, since: 0, spawnIndex: 0,
  pollTimer: null, outbox: [], pendingState: null, pendingBots: null,
};
let lastHostBots = null;
function roomSettings(){
  return {blueBots:settings.blueBots,redBots:settings.redBots,bluePlayers:settings.bluePlayers,redPlayers:settings.redPlayers,scoreLimit:settings.scoreLimit,minutes:settings.minutes};
}
function applySettings(input){
  if(!input) return;
  for(const key of ['blueBots','redBots','bluePlayers','redPlayers','scoreLimit','minutes']){
    if(input[key] != null) settings[key] = Number(input[key]) || 0;
  }
  renderCounts();
  const rule = $('scoreRule');
  if(rule) rule.textContent = 'FIRST TO '+settings.scoreLimit;
}
function ensureToken(){
  if(net.token) return net.token;
  try{ net.token = localStorage.getItem('erangel-token'); }catch(e){}
  if(!net.token){
    net.token = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)+Date.now().toString(36)).replace(/-/g,'').slice(0,40);
    try{ localStorage.setItem('erangel-token', net.token); }catch(e){}
  }
  return net.token;
}
function sendNet(obj){
  if(!obj) return;
  if(obj.t==='state'){ net.pendingState = obj.d; return; }
  if(obj.t==='hostBots'){ net.pendingBots = obj.d; return; }
  net.outbox.push(obj);
  if(['create','join','start','roomSettings','team','leave'].includes(obj.t)) flushNet();
}
async function flushNet(extra={}){
  ensureToken();
  const actions = net.outbox.splice(0);
  const body = {
    t: extra.t || 'poll', token: net.token, code: extra.code || net.room, since: net.since,
    name: extra.name || net.name, team: extra.team ?? settings.playerTeam, settings: extra.settings || roomSettings(),
    actions, state: net.pendingState, hostBots: net.isHost ? net.pendingBots : undefined, ...extra,
  };
  net.pendingState = null;
  let res;
  try{
    const response = await fetch('/api/mp', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)});
    res = await response.json();
  }catch(e){
    if(elLobbyMsg) elLobbyMsg.textContent = 'CONNECTION FAILED — OPEN THE HOST ADDRESS AND TRY AGAIN';
    return;
  }
  applyMp(res);
}
function applyMp(res){
  if(!res) return;
  if(typeof res.seq === 'number') net.since = Math.max(net.since, res.seq);
  if(res.snapshot) applySnapshot(res.snapshot);
  for(const msg of res.messages || []) dispatchNet(msg);
  if(!res.ok && res.error && elLobbyMsg && !net.started) elLobbyMsg.textContent = String(res.error).toUpperCase();
}
function startPolling(){
  if(net.pollTimer) return;
  net.connected = true;
  net.pollTimer = setInterval(()=>{ if(net.connected) flushNet(); }, 100);
}
function stopPolling(){
  net.connected = false;
  if(net.pollTimer) clearInterval(net.pollTimer);
  net.pollTimer = null;
}
function setRoomControlsVisible(active){
  const panel = $('roomPanel'); if(panel) panel.classList.toggle('on', active);
  for(const id of ['createBtn','joinBtn','offlineBtn']){ const el=$(id); if(el) el.style.display = active ? 'none' : ''; }
  if($('setRoom')) $('setRoom').disabled = active;
  document.querySelectorAll('[data-step]').forEach(btn=>{ btn.disabled = active && !net.isHost; });
  document.querySelectorAll('.teamBtn').forEach(b=>{ b.disabled = active && net.started; });
}
function selectTeam(team){
  settings.playerTeam = team===1 ? 1 : 0;
  player.team = settings.playerTeam;
  document.querySelectorAll('.teamBtn').forEach(b=>b.classList.toggle('on', Number(b.dataset.team)===settings.playerTeam));
  refreshTeamBadge();
}
function renderRoom(msg={}){
  if(msg.code && $('roomCodeDisplay')) $('roomCodeDisplay').textContent = msg.code;
  applySettings(msg.settings);
  const players = Array.isArray(msg.players) ? msg.players : Object.values(msg.players||{});
  const me = players.find(p=>p.id===net.id);
  if(me){ selectTeam(me.team); net.isHost = !!me.host; }
  document.querySelectorAll('[data-step]').forEach(btn=>{ btn.disabled = net.connected && !net.isHost; });
  for(let team=0; team<2; team++){
    const key = team===0 ? 'blue' : 'red';
    const list = players.filter(p=>Number(p.team)===team);
    const friendSlots = Number(settings[team===0?'bluePlayers':'redPlayers']) || 0;
    const friends = list.filter(p=>!p.host).length;
    const root = $(key+'Roster');
    if(!root) continue;
    root.innerHTML = '';
    for(const p of list){
      const row = document.createElement('div');
      row.className = 'roster-slot';
      row.textContent = (p.name||'PLAYER')+(p.host?' · HOST':'');
      root.appendChild(row);
    }
    for(let i=friends;i<friendSlots;i++){
      const row = document.createElement('div');
      row.className = 'roster-slot empty';
      row.textContent = 'Friend slot '+(i+1);
      root.appendChild(row);
    }
    const bots = Number(settings[team===0?'blueBots':'redBots']) || 0;
    for(let i=0;i<bots;i++){
      const row = document.createElement('div');
      row.className = 'roster-slot bot';
      row.textContent = 'AI BOT '+String(i+1).padStart(2,'0');
      root.appendChild(row);
    }
    const h = document.querySelector('.team-roster.'+key+' h3');
    if(h) h.textContent = (team===0?'BLUE':'RED')+' · '+list.length+' HUMANS · '+bots+' BOTS';
  }
  if($('roomStatus')) $('roomStatus').textContent = net.isHost ? 'YOU ARE HOST · SET SLOTS WITH + / − · START WHEN THE ROOM IS READY' : 'IN THE ROOM · WAITING FOR THE HOST TO START';
  if($('roomStartBtn')) $('roomStartBtn').style.display = net.isHost ? 'block' : 'none';
  if($('roomWait')) $('roomWait').textContent = net.isHost ? 'Share the code or invite link. Friends join before you start.' : 'Stay on this screen. The match starts for everyone together.';
}
function connectAndCreate(){
  if(elLobbyMsg) elLobbyMsg.textContent = 'CREATING ROOM…';
  flushNet({ t:'create', name: net.name, team: settings.playerTeam, settings: roomSettings() });
}
function connectAndJoin(code){
  if(elLobbyMsg) elLobbyMsg.textContent = 'JOINING '+code+'…';
  flushNet({ t:'join', code, name: net.name, team: settings.playerTeam });
}
function dispatchNet(msg){
  if(!msg || typeof msg.t !== 'string') return;
  switch(msg.t){
    case 'created':
      net.connected = true; net.id = msg.id; net.isHost = true; net.room = msg.code; net.started = false;
      applySettings(msg.settings);
      if(elLobbyMsg) elLobbyMsg.textContent = 'ROOM CREATED — SHARE THE CODE';
      setRoomControlsVisible(true); renderRoom(msg); startPolling();
      break;
    case 'joined':
      net.connected = true; net.id = msg.id; net.isHost = msg.hostId === msg.id; net.room = msg.code;
      applySettings(msg.settings); selectTeam(msg.self?.team ?? settings.playerTeam);
      if(elLobbyMsg) elLobbyMsg.textContent = 'JOINED ROOM — WAITING FOR HOST';
      setRoomControlsVisible(true); renderRoom(msg); startPolling();
      break;
    case 'started':
      net.started = true; applySettings(msg.settings);
      if(elLobbyMsg) elLobbyMsg.textContent = 'ENTERING WAREHOUSE…';
      if(!matchBooted) setTimeout(()=>startGame(), 200);
      break;
    case 'players': syncPlayers(msg.d || []); break;
    case 'roomUpdate': if(!net.started) renderRoom(msg); break;
    case 'playerJoin':
      if(net.isHost && net.connected) sendNet({ t:'hostBots', d: buildHostBotsPayload() });
      break;
    case 'hostBots':
      if(!net.isHost && msg.d){ net.hasHostData = true; lastHostBots = msg.d; syncHostState(msg.d); }
      break;
    case 'hitBot':
      if(net.isHost && msg.d){
        const b = bots.find(x=>x.id === msg.d.botId);
        if(b && b.alive) damageBot(b, msg.d.dmg, msg.d.head, msg.d.team ?? 0, false);
      }
      break;
    case 'damage':
      if(player.spawnShield>0 || matchOver || !player.alive) break;
      player.hp -= msg.dmg || 0; Audio_.hurt();
      elVig.style.boxShadow='inset 0 0 160px 40px rgba(200,0,0,0.6)';
      setTimeout(()=>{ if(phase==='ground' && !paused) elVig.style.boxShadow='inset 0 0 140px 30px rgba(0,0,0,0)'; },120);
      if(player.hp<=0){ player.hp=0; playerDie(msg.team); }
      refreshHealthUI();
      break;
    case 'shoot': {
      const shooter=net.remotePlayers.get(msg.from);
      if(msg.from !== net.id && shooter?.alive && msg.d && phase==='ground' && !paused){
        const sourcePosition=new THREE.Vector3(shooter.x,shooter.y,shooter.z);
        const suppliedOrigin=new THREE.Vector3(msg.d.ox,msg.d.oy,msg.d.oz);
        if(!Number.isFinite(suppliedOrigin.lengthSq()) || suppliedOrigin.distanceTo(sourcePosition)>5) break;
        Audio_.shot(WEAPONS[msg.d.weapon]?.snd || 'ar', .6, sourcePosition);
        spawnTracer(suppliedOrigin, new THREE.Vector3(msg.d.dx,msg.d.dy,msg.d.dz).normalize(), msg.d.len || 40, 0xffe2a8);
      }
      break;
    }
    case 'scoreSync':
      if(Array.isArray(msg.scores)){ teamScore[0]=msg.scores[0]; teamScore[1]=msg.scores[1]; refreshScore(); checkWin(); }
      break;
    case 'matchEnd': finishMatch(msg.winner); break;
    case 'playerLeave':
      if(remoteMeshes.has(msg.id)){ remoteGroup.remove(remoteMeshes.get(msg.id).group); remoteMeshes.delete(msg.id); }
      net.remotePlayers.delete(msg.id); updateAliveCount();
      break;
    case 'hostChange':
      net.isHost = msg.id === net.id;
      if(net.isHost){
        showMsg('YOU ARE HOST', 'BOTS FOLLOW YOU', 1800);
        if(lastHostBots && bots.length===0) syncHostState(lastHostBots);
      }
      setRoomControlsVisible(!!$('roomPanel')?.classList.contains('on'));
      break;
    case 'error':
      if(elLobbyMsg) elLobbyMsg.textContent = (msg.message||'ERROR').toUpperCase();
      if(msg.players) renderRoom(msg);
      break;
    default: break;
  }
}
function applySnapshot(snap){
  if(!snap) return;
  if(snap.code) net.room = snap.code;
  if(snap.hostId && net.id) net.isHost = snap.hostId === net.id;
  if(snap.self){
    net.id = snap.self.id;
    net.isHost = !!snap.self.host;
    net.spawnIndex = snap.self.spawnIndex || 0;
  }
  if(snap.settings && (net.isHost || !net.started)) applySettings(snap.settings);
  if(snap.started) net.started = true;
  if(Array.isArray(snap.scores)){ teamScore[0]=snap.scores[0]; teamScore[1]=snap.scores[1]; }
  if(typeof snap.timeLeft === 'number') matchTimeLeft = snap.timeLeft;
  refreshScore();
  if(Array.isArray(snap.players)) syncPlayers(snap.players);
  if(snap.bots && !net.isHost){ net.hasHostData = true; lastHostBots = snap.bots; syncHostState(snap.bots); }
  if(snap.over) finishMatch(snap.winner);
  if($('roomPanel')?.classList.contains('on') && !matchBooted) renderRoom(snap);
}
function netHitPlayer(targetId, dmg, head){ sendNet({ t:'damage', to: targetId, dmg, head, team: player.team }); }
function syncPlayers(states){
  const seen = new Set();
  for(const s of states || []){
    seen.add(s.id);
    if(s.id === net.id){ player.team = s.team; continue; }
    net.remotePlayers.set(s.id, s);
    const m = getRemoteMesh(s.id, s.team);
    m.target.set(s.x, (s.y||0) + 1.0, s.z);
    m.targetYaw = s.yaw || 0;
    if(m.team !== s.team){ setTeamMark(m.operative, s.team); m.team = s.team; }
    m.group.visible = s.alive !== false;
    const prev = m.prev;
    m.operative.userData.walking = prev ? Math.hypot(s.x-prev.x, s.z-prev.z) > 0.08 : false;
    m.operative.userData.sprinting = prev ? Math.hypot(s.x-prev.x, s.z-prev.z) > 0.45 : false;
    m.prev = {x:s.x, z:s.z};
    if(!m.seen){ m.group.position.copy(m.target); m.group.rotation.y = m.targetYaw; m.seen = true; }
  }
  for(const [id, mesh] of remoteMeshes){
    if(!seen.has(id)){ remoteGroup.remove(mesh.group); remoteMeshes.delete(id); net.remotePlayers.delete(id); }
  }
  updateAliveCount();
}
function updateRemotes(dt){
  const k = 1-Math.exp(-dt*12);
  for(const mesh of remoteMeshes.values()){
    mesh.group.position.lerp(mesh.target, k);
    let dy = mAngle(mesh.targetYaw - mesh.group.rotation.y);
    mesh.group.rotation.y += dy * k;
  }
}
function mAngle(a){ while(a>Math.PI) a-=TAU; while(a<-Math.PI) a+=TAU; return a; }
function syncHostState(d){
  if(!d?.bots) return;
  const seen = new Set();
  for(const bd of d.bots){
    seen.add(bd.id);
    let bot = bots.find(x=>x.id === bd.id);
    if(!bot){ bot = spawnBot(bd.x, bd.z, bd.team); bot.id = bd.id; bot.name = bd.name; }
    bot.pos.set(bd.x, bd.y, bd.z);
    bot.hp = bd.hp; bot.alive = bd.alive; bot.team = bd.team;
    bot.obj.position.set(bd.x, bd.y+1.0, bd.z);
    bot.obj.rotation.y = bd.yaw;
    bot.obj.rotation.z = bd.alive ? 0 : Math.PI/2;
    bot.obj.visible = true;
    setTeamMark(bot.obj.userData.operative, bd.team);
  }
  for(let i=bots.length-1;i>=0;i--){
    if(!seen.has(bots[i].id)){ botMeshes.remove(bots[i].obj); bots.splice(i,1); }
  }
  updateAliveCount();
}
function buildHostBotsPayload(){
  return { bots: bots.map(b=>({id:b.id, x:b.pos.x, y:b.pos.y, z:b.pos.z, hp:b.hp, alive:b.alive, yaw:b.obj.rotation.y, team:b.team, name:b.name})) };
}
function netTick(){
  if(!net.connected) return;
  sendNet({ t:'state', d:{
    x:+player.pos.x.toFixed(2), y:+player.pos.y.toFixed(2), z:+player.pos.z.toFixed(2),
    yaw:+player.yaw.toFixed(3), pitch:+player.pitch.toFixed(3),
    hp:Math.round(player.hp), alive:player.alive, weapon: player.slots[player.slot].id, kills: player.kills,
  }});
  if(net.isHost) sendNet({ t:'hostBots', d: buildHostBotsPayload() });
}

/* ══════ INPUT ══════ */
const keys = {};
const isTouch = matchMedia('(pointer:coarse)').matches && navigator.maxTouchPoints>0;

addEventListener('keydown', e=>{
  if(['Tab','KeyB'].includes(e.code)){ e.preventDefault(); if(!e.repeat) openBackpack(); return; }
  if(e.code==='KeyV' && !e.repeat){ togglePerspective(); return; }
  if(e.code==='KeyQ' && !e.repeat){ switchSlot(player.slot===0?1:0); return; }
  if(paused || !initialized) return;
  keys[e.code]=true;
  if(e.code==='Space'){ e.preventDefault(); tryJump(); }
  if(e.code==='KeyR') reload();
  if(e.code==='KeyF') tryPickup();
  if(e.code==='KeyH') tryHeal();
  if(e.code==='Digit1') switchSlot(0);
  if(e.code==='Digit2') switchSlot(1);
  if(e.code==='KeyC') player.crouch=!player.crouch;
});
addEventListener('keyup', e=>{ keys[e.code]=false; });

let locked=false;
const canvas = renderer.domElement;
canvas.addEventListener('click', ()=>{
  if(phase==='dead'||phase==='won'||paused) return;
  Audio_.init(); Audio_.configure();
  if(!isTouch && !locked && !layoutEditing) canvas.requestPointerLock()?.catch?.(()=>{});
});
document.addEventListener('pointerlockchange', ()=>{ locked = document.pointerLockElement===canvas; });
let mouseDown=false;
addEventListener('mousedown', e=>{
  if(e.target!==canvas || paused || !initialized) return;
  Audio_.init(); Audio_.configure();
  if(e.button===0){mouseDown=true;player._triggerHeld=true;fireOnce();}
  if(e.button===2 && !paused) player.ads=true;
});
addEventListener('mouseup', e=>{
  if(e.button===0){mouseDown=false;player._triggerHeld=false;}
  if(e.button===2) player.ads=false;
});
addEventListener('contextmenu', e=>e.preventDefault());
addEventListener('mousemove', e=>{
  if(!locked || paused) return;
  const s = (player.ads?0.0011:0.0022)*(gameSettings.sensitivity/50);
  player.yaw -= e.movementX*s;
  player.pitch = clamp(player.pitch - e.movementY*s, -Math.PI/2+0.05, Math.PI/2-0.05);
});

/* ══════ TOUCH + LAYOUT ══════ */
const stkL=$('stkL'), knbL=$('knbL');
const touchOverlay = $('touch'); const layoutBtn = $('btnLayout'); const bScope = $('bScope');
let layoutEditing = false;
let editDragging = null, editDragOff = {x:0,y:0}, layoutSnapshot = null;
const LAYOUT_KEY = 'dropzone_layout_v4';
const DEFAULT_LAYOUT = {
  stkL:{left:'2%',top:'70%'},
  bFire:{left:'calc(100% - 104px)',top:'58%'}, bScope:{left:'70%',top:'40%'},
  bRel:{left:'70%',top:'72%'}, bJump:{left:'84%',top:'38%'},
  bCrouch:{left:'70%',top:'48%'}, bSwap:{left:'10%',top:'55%'},
  bHeal:{left:'10%',top:'78%'}, bPick:{left:'41%',top:'75%'},
};
function applyLayout(layout){ for(const id in layout){ const el=$(id); if(!el) continue; el.style.left=layout[id].left; el.style.top=layout[id].top; el.style.right=''; el.style.bottom=''; } }
function loadLayout(){
  try{ const raw = localStorage.getItem(LAYOUT_KEY); if(raw) return {...DEFAULT_LAYOUT, ...JSON.parse(raw)}; }catch(e){}
  return {...DEFAULT_LAYOUT};
}
let layout = loadLayout(); applyLayout(layout);
function saveLayout(){ try{ localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); }catch(e){} }
function setLayoutEditing(on){
  layoutEditing = on;
  touchOverlay.classList.toggle('editing', on);
  $('editBar').classList.toggle('on', on);
  layoutBtn.classList.toggle('active', on);
  if(on){ layoutSnapshot = JSON.parse(JSON.stringify(layout)); if(locked) document.exitPointerLock(); mouseDown=false; $('bPick').style.display='flex'; }
  else { if(!nearestWeaponLoot()) $('bPick').style.display='none'; }
}
function cancelLayoutEdit(){ if(layoutSnapshot) layout = layoutSnapshot; applyLayout(layout); setLayoutEditing(false); }
function startDrag(el, x, y){
  editDragging = el; const r = el.getBoundingClientRect();
  editDragOff.x = x - (r.left + r.width/2); editDragOff.y = y - (r.top + r.height/2);
  el.style.zIndex = '100';
}
function moveDrag(x, y){
  if(!editDragging) return;
  const w = innerWidth, h = innerHeight;
  const r = editDragging.getBoundingClientRect();
  const cx = clamp(x - editDragOff.x, r.width/2, w-r.width/2);
  const cy = clamp(y - editDragOff.y, r.height/2, h-r.height/2);
  editDragging.style.left = ((cx/w)*100).toFixed(2)+'%';
  editDragging.style.top  = ((cy/h)*100).toFixed(2)+'%';
}
function endDrag(){
  if(!editDragging) return;
  layout[editDragging.id] = {left:editDragging.style.left, top:editDragging.style.top};
  editDragging.style.zIndex = ''; editDragging = null;
}
['stkL','bFire','bScope','bRel','bJump','bCrouch','bSwap','bHeal','bPick'].forEach(id=>{
  const el = $(id);
  el.addEventListener('pointerdown', e=>{ if(layoutEditing){ e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); startDrag(el, e.clientX, e.clientY); } });
  el.addEventListener('pointermove', e=>{ if(layoutEditing && editDragging===el){ e.preventDefault(); moveDrag(e.clientX, e.clientY); } });
  el.addEventListener('pointerup', e=>{ if(layoutEditing && editDragging===el){ e.preventDefault(); endDrag(); } });
  el.addEventListener('pointercancel', e=>{ if(layoutEditing && editDragging===el) endDrag(); });
});
$('editReset').addEventListener('click', ()=>{ layout={...DEFAULT_LAYOUT}; applyLayout(layout); saveLayout(); });
$('editSave').addEventListener('click', ()=>{ saveLayout(); setLayoutEditing(false); });
$('editCancel').addEventListener('click', cancelLayoutEdit);
layoutBtn.addEventListener('click', ()=>setLayoutEditing(!layoutEditing));
if(isTouch) layoutBtn.style.display = 'flex';

/* ══════ FULLSCREEN ══════ */
const btnFullscreen = $('btnFullscreen');
btnFullscreen.addEventListener('click', async ()=>{
  try {
    if(!document.fullscreenElement){
      const el = document.documentElement;
      if(el.requestFullscreen) await el.requestFullscreen({navigationUI:'hide'});
      else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else {
      if(document.exitFullscreen) await document.exitFullscreen();
      else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  } catch(e){}
});
function syncFullscreenIcon(){
  const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
  btnFullscreen.classList.toggle('active', on);
  btnFullscreen.innerHTML = on
    ? '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
}
document.addEventListener('fullscreenchange', syncFullscreenIcon);
document.addEventListener('webkitfullscreenchange', syncFullscreenIcon);
syncFullscreenIcon();

/* ══════ PAUSE + STOP MATCH ══════ */
const btnPause = $('btnPause'), pauseScreen = $('pauseScreen');
function setPaused(on){
  if(phase!=='ground' && phase!=='freefall' && phase!=='chute' && phase!=='plane') on = false;
  paused = on; pauseScreen.classList.toggle('on', on); btnPause.classList.toggle('active', on);
  if(on){ if(locked) document.exitPointerLock(); mouseDown=false; player._triggerHeld=false; player.ads=false; scopeLatched=false; for(const key in keys) keys[key]=false; updateScopeUI(); Audio_.suspend(); } else Audio_.configure();
}
btnPause.addEventListener('click', ()=>setPaused(!paused));
$('resumeBtn').addEventListener('click', ()=>{ setPaused(false); if(!isTouch && phase==='ground') canvas.requestPointerLock()?.catch?.(()=>{}); });
$('stopBtn').addEventListener('click', ()=>{ stopGame(); });

function stopGame(){
  Audio_.suspend(); mouseDown=false; initialized=false; post('return-lobby',{inventory:exportInventory()});
  if(net.ws){ try{ net.ws.close(); }catch(e){} net.ws = null; }
  net.connected = false; net.isHost = false; net.room = null; net.id = null;
net.hasHostData = false;
net.remotePlayers.clear();
  for(const [id, m] of remoteMeshes) remoteGroup.remove(m.group);
  remoteMeshes.clear();
  clearBots();
  for(const l of lootItems){ if(!l.taken) lootGroup.remove(l.mesh); }
  lootItems.length = 0;
  player.hp = 100; player.alive = true;
  player.slots = [{id:null,mag:0},{id:null,mag:0}]; player.slot = 0;
  player.ammo = {light:0,heavy:0,shell:0};
  player.heals = 0; player.kills = 0;
  player.crouch = false; player.ads = false;
  player.vel.set(0,0,0);
  setViewModel(null);
  zoneState.cx = 0; zoneState.cz = 0; zoneState.r = ZONE_INIT_R;
  zoneState.nextCx = 0; zoneState.nextCz = 0; zoneState.nextR = ZONE_INIT_R*0.55;
  zoneState.phase = 0; zoneState.t = 0; zoneState.shrinking = false;
  newZoneTarget(); updateZoneVisuals();
  phase = 'plane'; paused = false;
  pauseScreen.classList.remove('on'); btnPause.classList.remove('active');
  plane.x = -HALF*0.95; plane.dir = 1;
  document.getElementById('start').style.display = 'flex';
  elPrompt.classList.remove('on');
  elMsg.classList.remove('on');
  updateAliveCount(); refreshHealthUI(); refreshWeaponUI();
  elLobbyMsg.textContent = '';
}

/* ══════ SCOPE ══════ */
let scopeLatched = false;
function updateScopeUI(){ bScope.classList.toggle('active', player.ads); }
bScope.addEventListener('touchstart', e=>{ if(layoutEditing) return; e.preventDefault(); scopeLatched = !scopeLatched; player.ads = scopeLatched; updateScopeUI(); }, {passive:false});
bScope.addEventListener('mousedown', e=>{ if(layoutEditing) return; e.preventDefault(); scopeLatched = !scopeLatched; player.ads = scopeLatched; updateScopeUI(); });

/* ══════ TOUCH MOVE / LOOK (no right stick — right side = look) ══════ */
let touchLookId=null, touchLookX=0, touchLookY=0, touchMoveId=null, touchSprint=false;
let moveVec={x:0,y:0};
function stickCenter(el){ const r=el.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2, r:r.width/2}; }
function handleTouchStart(e){
  if(layoutEditing || paused) return;
  for(const t of e.changedTouches){
    const L = stkL.getBoundingClientRect();
    if(t.clientX>L.left && t.clientX<L.right && t.clientY>L.top && t.clientY<L.bottom && touchMoveId===null){
      touchMoveId = t.identifier;
    } else if(touchLookId === null){
      touchLookId = t.identifier; touchLookX = t.clientX; touchLookY = t.clientY;
    }
  }
}
function handleTouchMove(e){
  if(layoutEditing || paused) return;
  for(const t of e.changedTouches){
    if(t.identifier===touchMoveId){
      const c=stickCenter(stkL);
      let dx=(t.clientX-c.x)/c.r, dy=(t.clientY-c.y)/c.r;
      const raw = Math.hypot(dx,dy);
      if(raw>1){ dx/=raw; dy/=raw; }
      moveVec.x=dx; moveVec.y=dy;
      knbL.style.transform=`translate(${dx*c.r*0.55}px,${dy*c.r*0.55}px)`;
      touchSprint = raw > 0.85;
      stkL.classList.toggle('sprint', touchSprint);
    } else if(t.identifier===touchLookId){
      const dx=t.clientX-touchLookX, dy=t.clientY-touchLookY;
      player.yaw -= dx*0.0045;
      player.pitch = clamp(player.pitch - dy*0.0045, -Math.PI/2+0.05, Math.PI/2-0.05);
      touchLookX=t.clientX; touchLookY=t.clientY;
    }
  }
  e.preventDefault();
}
function handleTouchEnd(e){
  for(const t of e.changedTouches){
    if(t.identifier===touchMoveId){ touchMoveId=null; moveVec.x=0; moveVec.y=0; touchSprint=false; knbL.style.transform='translate(0,0)'; stkL.classList.remove('sprint'); }
    if(t.identifier===touchLookId){ touchLookId=null; }
  }
}
addEventListener('touchstart', handleTouchStart, {passive:false});
addEventListener('touchmove', handleTouchMove, {passive:false});
addEventListener('touchend', handleTouchEnd);
addEventListener('touchcancel', handleTouchEnd);

function bindBtn(id, onDown, onUp){
  const el=$(id);
  el.addEventListener('touchstart', e=>{ if(layoutEditing || paused) return; e.preventDefault(); onDown&&onDown(); }, {passive:false});
  el.addEventListener('touchend', e=>{ if(layoutEditing || paused) return; e.preventDefault(); onUp&&onUp(); }, {passive:false});
  el.addEventListener('mousedown', e=>{ if(layoutEditing || paused) return; e.preventDefault(); onDown&&onDown(); });
  el.addEventListener('mouseup', e=>{ if(layoutEditing || paused) return; e.preventDefault(); onUp&&onUp(); });
}
bindBtn('bFire', ()=>{ Audio_.init();Audio_.configure();mouseDown=true;player._triggerHeld=true;fireOnce(); }, ()=>{mouseDown=false;player._triggerHeld=false;});
bindBtn('bRel', ()=>reload());
bindBtn('bJump', ()=>tryJump());
bindBtn('bCrouch', ()=>{ player.crouch=!player.crouch; });
bindBtn('bSwap', ()=>switchSlot(player.slot===0?1:0));
bindBtn('bHeal', ()=>tryHeal());
bindBtn('bPick', ()=>tryPickup());

if(isTouch) touchOverlay.classList.add('on');
elPrompt.addEventListener('click', ()=>tryPickup());
elPrompt.addEventListener('touchstart', e=>{ e.preventDefault(); tryPickup(); }, {passive:false});

/* ══════ ACTIONS ══════ */
function tryJump(){
  if(paused) return;
  if(phase==='plane'){ phase='freefall'; player.vel.y=0; return; }
  if(phase==='chute') return;
  if(phase!=='ground') return;
  if(player.onGround){ player.vel.y = 7.2; player.onGround=false; }
}
function tryHeal(){
  if(phase!=='ground' || !player.alive || paused) return;
  if(player.heals<=0 || player.hp>=100) return;
  player.heals--;
  player.hp = Math.min(100, player.hp + 50);
  refreshHealthUI();
  showPickupToast('HEAL +50', '#54e08a');
  Audio_.pick();
}
function nearestWeaponLoot(){
  let best=null, bd=1e9;
  for(const l of lootItems){
    if(l.taken || l.type!=='weapon') continue;
    const d = dist2(player.pos.x,player.pos.z,l.x,l.z);
    if(d<bd && d<9 && Math.abs(player.pos.y-l.baseY)<2){ bd=d; best=l; }
  }
  return best;
}
function tryPickup(){
  if(phase!=='ground'||!player.alive||layoutEditing||paused) return;
  let best=null, bd=1e9;
  for(const l of lootItems){
    if(l.taken) continue;
    const d = dist2(player.pos.x,player.pos.z,l.x,l.z);
    if(d<bd && d<9 && Math.abs(player.pos.y-l.baseY)<2){ bd=d; best=l; }
  }
  if(!best) return;
  pickupLoot(best);
}
function pickupLoot(l){
  if(l.taken) return;
  if(l.type==='weapon'){
    const id=l.data.id;
    const item={uid:crypto.randomUUID(),id,mag:WEAPONS[id].mag,scope:null};
    inventoryState.weapons.push(item);
    const empty=player.slots.findIndex(s=>!s.id);
    if(empty>=0){player.slots[empty]=item;player.slot=empty;setViewModel(WEAPONS[id].model);}
    player.ammo[WEAPONS[id].ammo]+=WEAPONS[id].mag;
    showPickupToast('+ '+WEAPONS[id].label+' / BACKPACK','#e8b259');
  } else if(l.type==='scope'){
    inventoryState.scopes.push(l.data.id);
    showPickupToast('+ '+l.data.id.toUpperCase()+' SCOPE / BACKPACK','#bbd4a0');
  } else if(l.type==='ammo'){
    player.ammo[l.data.type]+=l.data.amount;
    showPickupToast('+ '+l.data.amount+' '+l.data.type.toUpperCase()+' AMMO','#b7c6ac');
  } else if(l.type==='backpack'){
    showPickupToast('EXPEDITION BACKPACK / UNLIMITED STORAGE','#e8b259');
  } else {
    player.heals++;
    showPickupToast('+ FIRST AID KIT','#bbd4a0');
  }
  Audio_.pick();


  l.taken=true; lootGroup.remove(l.mesh); 
  refreshWeaponUI(); refreshHealthUI();
}
function autoPickup(){
  for(const l of lootItems){
    if(l.taken || !['ammo','med'].includes(l.type)) continue;
    if(dist2(player.pos.x,player.pos.z,l.x,l.z) < 2.6 && Math.abs(player.pos.y-l.baseY)<2){ pickupLoot(l); }
  }
}

/* ══════ GAME STATE ══════ */
const plane = { x:-HALF*0.95, y:170, z:rand(-40,40), speed:52, dir:1 };
let gameTime = 0, vmKick = 0, chuteMesh = null;

function populateWorld(skipBots){
  clearBots();
  if(!skipBots){
    for(let i=0;i<settings.blueBots;i++){
      const spot = ARENA.blueBotSpawns[i % ARENA.blueBotSpawns.length];
      spawnBot(spot[0] + rand(-1.2,1.2), spot[1] + rand(-1.2,1.2), 0);
    }
    for(let i=0;i<settings.redBots;i++){
      const spot = ARENA.redBotSpawns[i % ARENA.redBotSpawns.length];
      spawnBot(spot[0] + rand(-1.2,1.2), spot[1] + rand(-1.2,1.2), 1);
    }
  }
  for(const drop of ARENA.loot){
    if(drop.type==='weapon') spawnLoot(drop.x, drop.z, 'weapon', {id:drop.id, y:drop.y});
    else if(drop.type==='scope') spawnLoot(drop.x, drop.z, 'scope', {id:drop.id, y:drop.y});
    else if(drop.type==='ammo') spawnLoot(drop.x, drop.z, 'ammo', {type:drop.ammo, amount:drop.amount, y:drop.y});
    else spawnLoot(drop.x, drop.z, 'med', {y:drop.y});
  }
  updateAliveCount();
}

function startGame(){
  if(matchBooted) return;
  matchBooted = true;
  training = false;
  if($('start')) $('start').style.display='none';
  if($('zone')) $('zone').style.display='none';
  if($('scoreboard')) $('scoreboard').style.display='flex';
  zoneRing.visible = false; zoneRingEdge.visible = false; zoneGroundRing.visible = false;
  zoneState.r = 10000;
  player.team = settings.playerTeam;
  player.hp = 100; player.alive = true; player.spawnShield = 2.2;
  const spawn = teamSpawn(player.team, net.spawnIndex || 0);
  player.pos.set(spawn.x, 0.1, spawn.z);
  player.vel.set(0,0,0);
  player.yaw = player.team===0 ? -Math.PI/2 : Math.PI/2;
  player.pitch = -0.08; player.onGround = true;
  phase = 'ground'; initialized = true; matchOver = false;
  teamScore = [0,0];
  matchTimeLeft = (settings.minutes || 8) * 60;
  respawnAt = 0;
  populateWorld(net.connected && !net.isHost);
  refreshTeamBadge(); refreshHealthUI(); refreshWeaponUI(); refreshScore();
  setViewModel(currentWeapon()?.model);
  setTeamMark(localOperative, player.team);
  showMsg('WAREHOUSE TDM', 'TWO TEAMS · RESPAWN · FIRST TO '+(settings.scoreLimit||40), 3600);
  updatePerspective();
  if(net.connected) startPolling();
}


function playerLand(){
  phase='ground';
  player.pos.y = terrainHeight(player.pos.x, player.pos.z);
  player.vel.set(0,0,0); player.onGround=true;
  if(chuteMesh){ scene.remove(chuteMesh); chuteMesh=null; }
  showMsg('LOOT UP', 'FIND A WEAPON', 1600);
  for(let i=0;i<10;i++){
    const a=rand(0,TAU), r=rand(3,11);
    const x=player.pos.x+Math.cos(a)*r, z=player.pos.z+Math.sin(a)*r;
    const roll=Math.random();
    if(i<3) spawnLoot(x,z,'weapon',{id:WEAPON_POOL[randi(0,WEAPON_POOL.length-1)]});
    else if(i<5) spawnLoot(x,z,'med',{});
    else if(roll<0.5) spawnLoot(x,z,'weapon',{id:WEAPON_POOL[randi(0,WEAPON_POOL.length-1)]});
    else if(roll<0.8) spawnLoot(x,z,'ammo',{type:['light','heavy','shell'][randi(0,2)],amount:40});
    else spawnLoot(x,z,'med',{});
  }
}
function playerDie(killerTeam){
  if(!player.alive || matchOver) return;
  player.alive=false; phase='dead';
  player.ads=false; scopeLatched=false; updateScopeUI();
  document.exitPointerLock?.();
  const killer = killerTeam===0 || killerTeam===1 ? killerTeam : (1-player.team);
  awardScore(killer);
  respawnAt = performance.now() + 3000;
  showMsg('DOWN', 'RESPAWNING', 0);
}
function revivePlayer(){
  const spawn = teamSpawn(player.team, (net.spawnIndex||0) + randi(0,2));
  player.pos.set(spawn.x, 0.1, spawn.z);
  player.vel.set(0,0,0);
  player.hp = 100; player.alive = true; player.onGround = true;
  player.spawnShield = 2.2; player.ads = false;
  const slot = player.slots[player.slot];
  if(slot?.id) slot.mag = WEAPONS[slot.id].mag;
  phase = 'ground';
  showMsg('DEPLOYED', TEAM_NAMES[player.team]+' SPAWN', 900);
  refreshHealthUI(); refreshWeaponUI();
}
function checkWin(){
  if(matchOver || !initialized) return;
  if(teamScore[0] >= (settings.scoreLimit||40) || teamScore[1] >= (settings.scoreLimit||40) || matchTimeLeft <= 0){
    const winner = teamScore[0]===teamScore[1] ? -1 : (teamScore[0] > teamScore[1] ? 0 : 1);
    finishMatch(winner);
  }
}

/* ══════ PLAYER UPDATE ══════ */
const _move = new THREE.Vector3();
function getMoveVec(){
  let f=0,r=0;
  if(keys['KeyW']) f+=1; if(keys['KeyS']) f-=1; if(keys['KeyA']) r-=1; if(keys['KeyD']) r+=1;
  if(touchMoveId!==null){ f += -moveVec.y; r += moveVec.x; }
  const len = Math.hypot(f,r); if(len>1){ f/=len; r/=len; }
  return {f,r};
}
function updatePlayer(dt){
  if(phase==='plane'){
    plane.x += plane.speed*plane.dir*dt;
    player.pos.set(plane.x, plane.y, plane.z);
    player.yaw = plane.dir>0 ? -Math.PI/2 : Math.PI/2;
    player.pitch = -0.35;
    if(plane.x > HALF*0.95 || plane.x < -HALF*0.95){ plane.dir*=-1; }
    return;
  }
  if(phase==='freefall' || phase==='chute'){
    const inChute = phase==='chute';
    const maxFall = inChute ? -7 : -55;
    player.vel.y = Math.max(maxFall, player.vel.y - (inChute?8:42)*dt);
    const hs = inChute ? 9 : 16;
    const mv = getMoveVec();
    const sinY=Math.sin(player.yaw), cosY=Math.cos(player.yaw);
    _move.set(-sinY*mv.f + cosY*mv.r, 0, -cosY*mv.f - sinY*mv.r);
    if(_move.lengthSq()>0) _move.normalize();
    player.pos.x += _move.x*hs*dt; player.pos.z += _move.z*hs*dt;
    player.pos.y += player.vel.y*dt;
    if(!inChute) player.pitch = lerp(player.pitch, -0.9, dt*1.5);
    if(!inChute && player.pos.y < terrainHeight(player.pos.x,player.pos.z)+45){
      phase='chute';
      chuteMesh = new THREE.Group();
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(1.6,12,8,0,TAU,0,Math.PI/2),
        new THREE.MeshLambertMaterial({color:0xd85a3a, side:THREE.DoubleSide})
      );
      canopy.scale.set(1,0.55,1); canopy.position.y = 3.2;
      chuteMesh.add(canopy); scene.add(chuteMesh);
    }
    if(chuteMesh) chuteMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
    if(player.pos.y <= terrainHeight(player.pos.x, player.pos.z)){ playerLand(); }
    return;
  }
  if(phase!=='ground') return;

  const mv = getMoveVec();
  const sprinting = (keys['ShiftLeft']||keys['ShiftRight']||touchSprint) && !player.crouch && mv.f>0.2;
  player.sprint = sprinting;
  let speed = 5.2; if(sprinting) speed = 8.0; if(player.crouch) speed = 2.6; if(player.ads) speed *= 0.55;

  const sinY=Math.sin(player.yaw), cosY=Math.cos(player.yaw);
  _move.set(-sinY*mv.f + cosY*mv.r, 0, -cosY*mv.f - sinY*mv.r);
  if(_move.lengthSq()>0) _move.normalize();
  const accel = player.onGround ? 18 : 4;
  player.vel.x = lerp(player.vel.x, _move.x*speed, clamp(accel*dt,0,1));
  player.vel.z = lerp(player.vel.z, _move.z*speed, clamp(accel*dt,0,1));
  player.vel.y -= 22*dt;
  if(player.onGround && player.vel.y<0) player.vel.y = 0;

  player.pos.x += player.vel.x*dt;
  player.pos.z += player.vel.z*dt;
  player.pos.y += player.vel.y*dt;
  const height = player.crouch ? 1.25 : 1.8;
  resolveXZ(player.pos, player.radius, player.pos.y+.17, player.pos.y+height);
  const gy = walkableHeight(player.pos.x, player.pos.z, player.pos.y+.15);
  if(player.pos.y <= gy){ player.pos.y = gy; player.vel.y = 0; player.onGround = true; }
  else player.onGround = false;
  player.pos.x = clamp(player.pos.x, -HALF+4, HALF-4);
  player.pos.z = clamp(player.pos.z, -HALF+4, HALF-4);

  if(player.reloading && performance.now() >= player.reloadEnd) player.reloading = false;
  const w = currentWeapon();
  if(w){ if(mouseDown && (w.auto || !player._triggerHeld)) fireOnce(); player._triggerHeld = mouseDown; }
  player.recPitch = lerp(player.recPitch, 0, clamp(dt*7,0,1));
  player.recYaw = lerp(player.recYaw, 0, clamp(dt*7,0,1));

  let nearLoot=null, nd=1e9;
  for(const l of lootItems){
    if(l.taken) continue;
    const d=dist2(player.pos.x,player.pos.z,l.x,l.z);
    if(d<nd && d<9 && Math.abs(player.pos.y-l.baseY)<2){ nd=d; nearLoot=l; }
  }
  const pickBtn = $('bPick');
  if(nearLoot){
    const label=nearLoot.type==='weapon'?WEAPONS[nearLoot.data.id].label:nearLoot.type==='scope'?nearLoot.data.id+' SCOPE':nearLoot.type==='backpack'?'EXPEDITION BACKPACK':nearLoot.type==='ammo'?'AMMUNITION':'FIRST AID';
    elPrompt.classList.add('on'); elPrompt.textContent = `[F] PICK UP ${label}`;
    pickBtn.style.display = 'flex'; pickBtn.textContent = 'PICK';
  } else {
    elPrompt.classList.remove('on');
    if(!layoutEditing) pickBtn.style.display = 'none';
  }
  autoPickup();

  const zd = Math.sqrt(dist2(player.pos.x,player.pos.z,zoneState.cx,zoneState.cz));
  if(zd > zoneState.r){
    const dps = zoneState.dps[Math.min(zoneState.phase, zoneState.dps.length-1)];
    player.hp -= dps*dt;
    elVig.style.boxShadow = 'inset 0 0 140px 30px rgba(200,0,0,0.35)';
  } else elVig.style.boxShadow = 'inset 0 0 140px 30px rgba(200,0,0,0)';
  player.spawnShield = Math.max(0, player.spawnShield - dt);
  if(TDM && player.spawnShield>0) elVig.style.boxShadow = 'inset 0 0 90px 16px rgba(120,190,255,0.28)';
  if(player.hp<=0 && player.alive){ player.hp=0; playerDie(1-player.team); }
  refreshHealthUI();
}

/* ══════ BOT UPDATE (host / offline) ══════ */
function updateBots(dt){
  if(net.connected && !net.isHost) return;
  const now = performance.now();
  for(const b of bots){
    if(!b.alive){
      if(!matchOver && b.respawnAt && now > b.respawnAt){
        const spots = b.team===1 ? ARENA.redBotSpawns : ARENA.blueBotSpawns;
        const spot = spots[randi(0, spots.length-1)];
        b.pos.set(spot[0], 0, spot[1]);
        b.hp = 100; b.alive = true; b.respawnAt = 0;
        b.obj.rotation.z = 0;
        b.obj.position.set(spot[0], 1, spot[1]);
        b.obj.visible = true;
      }
      continue;
    }

    let target = null, targetKind = null, targetId = null, targetD = Infinity;
    if(phase==='ground' && player.alive && player.spawnShield<=0 && player.team !== b.team){
      const d = Math.hypot(player.pos.x-b.pos.x, player.pos.z-b.pos.z);
      if(d < targetD){ target = player.pos; targetKind='host'; targetId='host'; targetD=d; }
    }
    for(const [pid, rp] of net.remotePlayers){
      if(!rp.alive || rp.team === b.team) continue;
      const d = Math.hypot(rp.x-b.pos.x, rp.z-b.pos.z);
      if(d < targetD){ target = new THREE.Vector3(rp.x, rp.y, rp.z); targetKind='player'; targetId=pid; targetD=d; }
    }
    for(const other of bots){
      if(!other.alive || other.team === b.team || other === b) continue;
      const d = Math.hypot(other.pos.x-b.pos.x, other.pos.z-b.pos.z);
      if(d < targetD){ target = other.pos; targetKind='bot'; targetId=other.id; targetD=d; }
    }

    if(!target){
      if(!b.patrol || dist2(b.pos.x,b.pos.z,b.patrol.x,b.patrol.z) < 4){
        b.patrol = new THREE.Vector3(rand(-70,70), 0, rand(-48,48));
      }
      target = b.patrol; targetKind = 'patrol'; targetId = 'patrol'; targetD = Math.hypot(target.x-b.pos.x, target.z-b.pos.z);
    }
    const dx = target.x - b.pos.x, dz = target.z - b.pos.z;

    // LOS must be associated with the current target; otherwise a bot can retain
    // visibility from a previous target and shoot through a newly intervening wall.
    const losTargetKey = `${targetKind}:${targetId}`;
    if(b.losTargetKey !== losTargetKey){
      b.losTargetKey = losTargetKey;
      b.losTimer = 0;
      b.hasLOS = false;
    }
    const hasClearShot = () => {
      if(targetD >= 90) return false;
      const ox=b.pos.x, oy=b.pos.y+1.4, oz=b.pos.z;
      const vx=target.x-ox, vy=(target.y+1.3)-oy, vz=target.z-oz;
      const rayDist=Math.hypot(vx,vy,vz);
      if(rayDist < 0.01) return true;
      const dir=new THREE.Vector3(vx/rayDist,vy/rayDist,vz/rayDist);
      return castWorldDistance(new THREE.Vector3(ox,oy,oz),dir,rayDist) >= rayDist-0.75;
    };
    b.losTimer -= dt;
    if(b.losTimer <= 0){
      b.losTimer = 0.25;
      b.hasLOS = hasClearShot();
    }

    if(targetKind !== 'patrol' && b.hasLOS && targetD < 70){ b.state = 'engage'; }
    else if(b.state === 'engage'){ b.state = 'roam'; b.retarget = 0; }

    if(b.state==='engage'){
      b.obj.rotation.y = lerp(b.obj.rotation.y, Math.atan2(dx, dz), clamp(dt*6,0,1));
      if(now > b.fireAt && b.hasLOS && hasClearShot()){
        b.fireAt = now + rand(420, 900);
        const ox=b.pos.x, oy=b.pos.y+1.35, oz=b.pos.z;
        Audio_.shot('ar', .65, b.pos);
        spawnTracer(new THREE.Vector3(ox,oy,oz),
                    new THREE.Vector3(target.x-ox,(target.y+1.3)-oy,target.z-oz).normalize(),
                    targetD, 0xff8a55);
        let p = clamp(0.62 - targetD/150, 0.05, 0.6);
        if(player.sprint) p *= 0.6;
        if(player.crouch) p *= 0.75;
        if(Math.random() < p){
          const dmg = rand(8, 15);
          if(targetKind === 'host'){
            if(player.spawnShield<=0){
              player.hp -= dmg; Audio_.hurt();
              elVig.style.boxShadow='inset 0 0 160px 40px rgba(200,0,0,0.6)';
              setTimeout(()=>{ if(phase==='ground') elVig.style.boxShadow='inset 0 0 140px 30px rgba(0,0,0,0)'; }, 120);
              if(player.hp<=0){ player.hp=0; playerDie(b.team); }
              refreshHealthUI();
            }
          } else if(targetKind === 'player'){
            sendNet({ t:'damage', to: targetId, dmg, head:false });
          } else if(targetKind === 'bot'){
            const tb = bots.find(x=>x.id === targetId);
            if(tb && tb.alive){
              tb.hp -= dmg;
              if(tb.hp <= 0){
                tb.alive=false; tb.respawnAt = performance.now()+3000; tb.obj.rotation.z = Math.PI/2;
                tb.obj.position.y = terrainHeight(tb.pos.x,tb.pos.z)+0.34;
                addKillFeed(`${b.name} ✕ ${tb.name}`, b.team===0?'#3b82f6':'#ef4444');
                awardScore(b.team);
                updateAliveCount();
              }
            }
          }
        }
      } else if(now > b.fireAt && b.hasLOS){
        b.hasLOS = false;
        b.losTimer = 0.1;
      }
    } else {
      if(targetD > 0.5){
        const nx = dx/targetD, nz = dz/targetD;
        b.pos.x += nx*b.speed*dt; b.pos.z += nz*b.speed*dt;
        b.obj.rotation.y = lerp(b.obj.rotation.y, Math.atan2(nx,nz), clamp(dt*4,0,1));
      }
    }

    resolveXZ(b.pos, 0.4, b.pos.y, b.pos.y+1.8);
    b.pos.x = clamp(b.pos.x, -HALF+4, HALF-4);
    b.pos.z = clamp(b.pos.z, -HALF+4, HALF-4);
    const gy = terrainHeight(b.pos.x, b.pos.z);
    b.pos.y = gy;
    b.obj.position.set(b.pos.x, gy+1.0, b.pos.z);
    b.obj.userData.operative.userData.walking=b.state!=='engage';
    b.obj.visible=dist2(player.pos.x,player.pos.z,b.pos.x,b.pos.z)<220*220;
    b.obj.userData.operative.visible=b.obj.visible;

    const bzd = Math.sqrt(dist2(b.pos.x,b.pos.z,zoneState.cx,zoneState.cz));
    if(bzd > zoneState.r){
      b.hp -= zoneState.dps[Math.min(zoneState.phase,zoneState.dps.length-1)]*dt;
      if(b.hp<=0){
        b.alive=false; b.obj.rotation.z = Math.PI/2;
        b.obj.position.y = gy+0.34;
        addKillFeed(`${b.name} died to the zone`, '#6ec9ff');
        updateAliveCount(); checkWin();
      }
    }
  }
}

/* ══════ ZONE UPDATE ══════ */
function updateMatchClock(dt){
  if(!initialized || matchOver || net.connected) return;
  if(phase!=='ground' && phase!=='dead') return;
  matchTimeLeft = Math.max(0, matchTimeLeft - dt);
  refreshScore();
  checkWin();
}
function updateRespawn(){
  if(matchOver) return;
  if(!player.alive && phase==='dead' && respawnAt && performance.now()>=respawnAt) revivePlayer();
}
function updateZone(dt){
  if(TDM) return;
  if(net.connected && !net.isHost) return;
  if(training || phase!=='ground') return;
  const z = zoneState; z.t += dt;
  if(!z.shrinking){
    if(z.t >= z.waitTime && z.phase < z.totalPhases){
      z.t=0; z.shrinking=true; z.startR=z.r; z.startCx=z.cx; z.startCz=z.cz;
      Audio_.zone(); showMsg('ZONE CLOSING', '', 1400);
    }
  } else {
    const k = clamp(z.t / z.shrinkTime, 0, 1);
    z.r = lerp(z.startR, z.nextR, k);
    z.cx = lerp(z.startCx, z.nextCx, k);
    z.cz = lerp(z.startCz, z.nextCz, k);
    if(k >= 1){
      z.shrinking=false; z.t=0; z.phase++;
      z.r = z.nextR; z.cx = z.nextCx; z.cz = z.nextCz;
      newZoneTarget();
      if(z.phase >= z.totalPhases) z.nextR = 0;
    }
  }
  if(z.shrinking){ const left = Math.max(0, z.shrinkTime - z.t); elZoneTimer.textContent = `CLOSING ${Math.ceil(left)}s`; elZoneTimer.style.color = '#ff7a7a'; }
  else { const left = Math.max(0, z.waitTime - z.t); elZoneTimer.textContent = `HOLDS ${Math.ceil(left)}s`; elZoneTimer.style.color = '#6ec9ff'; }
  updateZoneVisuals();
}

function updateLoot(dt, t){
  for(const l of lootItems){
    if(l.taken) continue;
    l.mesh.visible=dist2(player.pos.x,player.pos.z,l.x,l.z)<50*50;
    if(!l.mesh.visible) continue;
    if(l.type==='scope') l.mesh.rotation.y += dt*.2;
    l.mesh.position.y = l.baseY + Math.sin(t*2 + l.x)*0.025;
  }
}

/* ══════ CAMERA ══════ */
function updateCamera(dt){
  for(const chunk of renderChunks) chunk.visible=dist2(chunk.userData.center.x,chunk.userData.center.z,player.pos.x,player.pos.z)<240*240;
  const eyeH=player.crouch?1.12:player.eye;
  const pivot=player.pos.clone().add(new THREE.Vector3(0,eyeH,0));
  camera.rotation.set(clamp(player.pitch+player.recPitch,-1.5,1.5),player.yaw+player.recYaw,0,'YXZ');
  const third=gameSettings.perspective==='TPP'&&!player.ads&&phase==='ground';
  if(third){
    const offset=new THREE.Vector3(.65,.3,3.65).applyEuler(camera.rotation);
    const distance=castWorldDistance(pivot,offset.clone().normalize(),offset.length());
    const desired=pivot.clone().addScaledVector(offset.clone().normalize(),Math.max(.35,distance-.22));
    camera.position.lerp(desired,1-Math.exp(-dt*14));
  }else camera.position.copy(pivot);
  localOperative.visible=third;
  localOperative.position.copy(player.pos);localOperative.rotation.y=player.yaw;
  localOperative.userData.walking=Math.hypot(player.vel.x,player.vel.z)>.5;
  localOperative.userData.sprinting=player.sprint;localOperative.userData.crouching=player.crouch;
  const w=currentWeapon(), optic=currentSlot()?.scope, zoom=SCOPE_ZOOM[optic]||1;
  const scoped=!!(player.ads&&w&&optic&&phase==='ground');
  const magnified=scoped&&zoom>1;
  const desiredFov=player.ads&&w?(optic?2*Math.atan(Math.tan(75*Math.PI/360)/(zoom>1?zoom:1.35))*180/Math.PI:58):75;
  camera.fov=lerp(camera.fov,desiredFov,clamp(dt*13,0,1));camera.updateProjectionMatrix();
  elScope.classList.toggle('on',scoped);
  elScope.classList.toggle('magnified',magnified);
  elScope.classList.toggle('red-dot',scoped&&optic==='Red Dot');
  elScope.classList.toggle('holographic',scoped&&optic==='Holographic');
  $('optic-label').textContent=optic?optic.toUpperCase()+' / 100 M':'';
  elCross.style.opacity=scoped?'0':'.8';
  vmRoot.visible=!!vmModel&&!third&&!scoped;
  if(vmModel){
    vmKick=Math.max(0,vmKick-dt*7);
    const bob=Math.min(Math.hypot(player.vel.x,player.vel.z),8)*.003;
    vmRoot.position.set(Math.sin(performance.now()*.008)*bob,Math.abs(Math.cos(performance.now()*.008))*bob,0);
    vmModel.position.z=-.42+vmKick*.08;vmModel.rotation.x=vmKick*.16;
  }
  animateOperatives(dt);
  muzzle.intensity=Math.max(0,muzzle.intensity-dt*30);
  sun.position.set(player.pos.x+60,player.pos.y+110,player.pos.z+40);
  sun.target.position.copy(player.pos);sun.target.updateMatrixWorld();
}


function updateTracers(dt){
  for(let i=tracers.length-1;i>=0;i--){
    const tr = tracers[i]; tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life/0.09)*0.85;
    if(tr.life<=0){
      scene.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose();
      tracers.splice(i,1);
    }
  }
}

/* ══════ MAIN LOOP ══════ */
let last = performance.now(), mmTimer = 0;
function loop(){
  requestAnimationFrame(loop);
  const now = performance.now();
  let dt = (now-last)/1000; last = now;
  if(dt > 0.1) dt = 0.1;
  if(!initialized) return;
  if(paused || document.hidden){ renderer.render(scene,camera); return; }
  gameTime += dt;
  if(!layoutEditing){
    updatePlayer(dt);
    updateBots(dt);
    updateZone(dt);
    updateMatchClock(dt);
    updateRespawn();
    updateLoot(dt, gameTime);
    updateTracers(dt);
    updateRemotes(dt);
    netTick();
  }
  updateCamera(dt);

  mmTimer -= dt; if(mmTimer <= 0){ mmTimer = 0.1; drawMinimap(); }
  renderer.render(scene, camera);
}

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

player.pos.set(plane.x, plane.y, plane.z);
camera.position.copy(player.pos);
updateCamera(0.016);

/* ══════ LOBBY BUTTONS ══════ */
$('createBtn')?.addEventListener('click', ()=>{ Audio_.init(); if(elLobbyMsg) elLobbyMsg.textContent = 'CONNECTING…'; connectAndCreate(); });
$('joinBtn')?.addEventListener('click', ()=>{
  Audio_.init();
  const code = (elRoom?.value || '').trim().toUpperCase();
  if(code.length < 4){ if(elLobbyMsg) elLobbyMsg.textContent = 'ENTER A ROOM CODE'; return; }
  if(elLobbyMsg) elLobbyMsg.textContent = 'CONNECTING…';
  connectAndJoin(code);
});
$('offlineBtn')?.addEventListener('click', ()=>{ Audio_.init(); net.connected=false; startGame(); });
$('roomStartBtn')?.addEventListener('click', ()=>{ if(net.isHost&&net.connected){ if($('roomWait')) $('roomWait').textContent='Starting match…'; sendNet({t:'start'}); } });
$('copyRoomBtn')?.addEventListener('click', async ()=>{ const code=$('roomCodeDisplay').textContent; const invite=location.origin+'/?room='+encodeURIComponent(code); try{ await navigator.clipboard.writeText(invite); $('copyRoomBtn').textContent='COPIED'; setTimeout(()=>$('copyRoomBtn').textContent='COPY INVITE',1500); }catch{ if($('roomWait')) $('roomWait').textContent='Room code: '+code+' — copy it manually.'; } });
const urlRoom = new URLSearchParams(location.search).get('room');
if(urlRoom && elRoom) elRoom.value = urlRoom.toUpperCase();
if(window.parent !== window && $('start')) $('start').style.display = 'none';
if($('zone')) $('zone').style.display = 'none';
if($('scoreboard')) $('scoreboard').style.display = 'none';

loop();


function exportInventory(){
  const weapons=new Map(inventoryState.weapons.map(item=>[item.uid,{...item}]));
  for(const item of player.slots) if(item.id&&item.uid) weapons.set(item.uid,{...item});
  return {...inventoryState,weapons:[...weapons.values()],main:player.slots.map(item=>item.uid||null),active:player.slot,ammo:{...player.ammo},heals:player.heals};
}

function importInventory(value){
  if(!value?.weapons || !value?.main) return;
  inventoryState=structuredClone(value);
  player.slots=value.main.map(uid=>inventoryState.weapons.find(item=>item.uid===uid)||{id:null,mag:0,uid:null,scope:null});
  player.slot=value.active===1?1:0;player.ammo={...value.ammo};player.heals=value.heals;
  player.reloading=false;player.ads=false;scopeLatched=false;
  setViewModel(currentWeapon()?.model);refreshWeaponUI();refreshHealthUI();
}

function queueInventorySync(){
  if(!initialized || syncTimer) return;
  syncTimer=setTimeout(()=>{syncTimer=null;post('inventory-sync',{inventory:exportInventory()});},100);
}

function openBackpack(){
  if(!initialized) return;
  setPaused(true);pauseScreen.classList.remove('on');
  post('inventory-open',{inventory:exportInventory()});
}

function updatePerspective(){ $('btnPerspective').textContent=gameSettings.perspective; }
function togglePerspective(){gameSettings.perspective=gameSettings.perspective==='TPP'?'FPP':'TPP';updatePerspective();post('settings-sync',{settings:gameSettings});}

$('btnBackpack').addEventListener('click',openBackpack);
$('btnPerspective').addEventListener('click',togglePerspective);
$('btnSwapDesktop').addEventListener('click',()=>switchSlot(player.slot===0?1:0));
$('btnSettings').addEventListener('click',()=>{setPaused(true);pauseScreen.classList.remove('on');post('settings-open');});
elS0.addEventListener('click',()=>switchSlot(0));elS1.addEventListener('click',()=>switchSlot(1));
addEventListener('blur',()=>{for(const key in keys)keys[key]=false;mouseDown=false;player.ads=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){mouseDown=false;player.ads=false;Audio_.suspend();}else Audio_.configure();});
addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='erangel-lobby')return;
  const data=event.data;
  if((data.type==='boot-match' || data.type==='initialize') && !matchBooted){
    gameSettings={...DEFAULT_SETTINGS,...data.settings};
    training=false;
    const match=data.match||{};
    settings.blueBots=Number(match.blueBots)||0;
    settings.redBots=Number(match.redBots)||0;
    settings.bluePlayers=Number(match.bluePlayers)||0;
    settings.redPlayers=Number(match.redPlayers)||0;
    settings.scoreLimit=Number(match.scoreLimit)||40;
    settings.minutes=Number(match.minutes)||8;
    settings.playerTeam=match.playerTeam===1?1:0;
    net.name=data.name||'GHOST_01';
    net.token=match.token||net.token;
    net.id=match.playerId||match.token||net.id;
    net.room=match.room||null;
    net.isHost=!!match.isHost;
    net.spawnIndex=Number(match.spawnIndex)||0;
    net.since=Number(match.since)||0;
    net.connected=!!match.online && !!net.room;
    net.started=!!match.online;
    renderer.shadowMap.enabled=gameSettings.shadows;
    importInventory(data.inventory||DEFAULT_INVENTORY);
    renderCounts();
    startGame();
    camera.position.copy(player.pos).add(new THREE.Vector3(0,1.6,3.2));
  }
  if(data.type==='room-mode'&&!initialized){
    gameSettings={...DEFAULT_SETTINGS,...data.settings};net.name=data.name||'GHOST_01';renderer.shadowMap.enabled=gameSettings.shadows;
    importInventory(data.inventory||DEFAULT_INVENTORY);
    if($('start')) $('start').style.display='flex';
    if($('lobbyMsg')) $('lobbyMsg').textContent='CREATE A ROOM OR JOIN WITH A CODE';
  }
  if(data.type==='inventory')importInventory(data.inventory);
  if(data.type==='settings'){
    gameSettings={...gameSettings,...data.settings};renderer.shadowMap.enabled=gameSettings.shadows;Audio_.configure();updatePerspective();
  }
  if(data.type==='pause'){setPaused(true);pauseScreen.classList.remove('on');}
  if(data.type==='resume'){setPaused(false);window.focus();}
  if(data.type==='stop'){Audio_.suspend();paused=true;initialized=false;}
});

window.erangel={getState:()=>({initialized,phase,paused,perspective:gameSettings.perspective,inventory:exportInventory(),position:player.pos.toArray(),buildings:buildingSpots.length,levels:buildingSpots.map(b=>b.levels),actorLoaded:!!localOperative.userData.model,actorSize:new THREE.Box3().setFromObject(localOperative).getSize(new THREE.Vector3()).toArray(),render:renderer.info.render,loot:lootItems.filter(l=>!l.taken).map(l=>({type:l.type,id:l.data.id,x:l.x,z:l.z,y:l.baseY})),shots:player.nextFire}),pickup:tryPickup,switchWeapon:()=>switchSlot(player.slot===0?1:0),heightAt:walkableHeight,optics:()=>({scope:currentSlot()?.scope,fov:camera.fov,ads:player.ads}),inspectWorld:()=>({buildings:buildingSpots,stairs:stairRamps})};
window.erangel.inspectControls=()=>({keys:{...keys},yaw:player.yaw,pitch:player.pitch,velocity:player.vel.toArray(),input:getMoveVec()});
soldierReady.then(()=>post('ready'));
