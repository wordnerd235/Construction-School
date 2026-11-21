{
'use strict';
/* ================= constants ================= */
const W=1100,H=620,GY=560,GRAV=1500,TAU=Math.PI*2;
const S={x:430,y:455},L1=215,L2=200,CLAW=26;
const M={x:960,y:486,R:60};
const BIN={x1:1030,x2:1096,top:522};
const FEED={x1:880,x2:946,y1:424,y2:478};
const MILL_MAX_R=13.6,MIN_SPLIT_R=7;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, rand=(a,b)=>a+Math.random()*(b-a), kg=r=>r*r/16;
const angDiff=(a,b)=>{let d=(a-b)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;};
const normTop=a=>{while(a>=Math.PI/2)a-=TAU;while(a<-1.5*Math.PI)a+=TAU;return a;};
const $=id=>document.getElementById(id);

const TYPES={
  sandstone:{name:'Sandstone',hard:0.5,cols:['#D9A86C','#C8945A','#E4B97F'],edge:'#8A5E33',rmin:18,rmax:30,speck:'#B98448'},
  limestone:{name:'Limestone',hard:1.0,cols:['#D8D4C8','#C9C4B6','#E6E2D8'],edge:'#8B867A',rmin:18,rmax:31,speck:'#ABA593'},
  granite:{name:'Granite',hard:2.0,cols:['#C9A3A0','#B58E8C','#D6B3AE'],edge:'#6E5552',rmin:17,rmax:28,speck:'#3B3333'},
  geode:{name:'Geode',hard:1.2,cols:['#9C8B78','#8A7A68','#A39280'],edge:'#5A4E42',rmin:17,rmax:24,speck:'#6F6152'}
};
const JOBS=[
  {title:'Job 1: First rocks',text:'Grind 60 kg of soft sandstone into dust.',dust:60,rocks:{sandstone:1},badge:'🦺',bname:'Trainee'},
  {title:'Job 2: Limestone day',text:'Grind 150 kg. Limestone dust is used to make cement!',dust:150,rocks:{sandstone:1,limestone:1.5},badge:'🔧',bname:'Operator'},
  {title:'Job 3: Hard rock',text:'Granite is tough! Grind 300 kg.',dust:300,rocks:{sandstone:.5,limestone:1,granite:2},badge:'🪨',bname:'Rock Crusher'},
  {title:'Job 4: Treasure hunt',text:'Some rocks are geodes with crystals inside. Find 3 crystals!',gems:3,rocks:{limestone:1,granite:1,geode:1.3},badge:'💎',bname:'Crystal Finder'},
  {title:'Job 5: Big order',text:'The builders need 600 kg of rock dust!',dust:600,rocks:{sandstone:1,limestone:1,granite:1,geode:.3},badge:'👷',bname:'Site Boss'}
];
const FREE={title:'Free play',text:"You're the boss! Grind as much as you like.",rocks:{sandstone:1,limestone:1,granite:1,geode:.4}};

/* ================= state ================= */
let job=0,jobDust=0,jobGems=0,totalDust=0,gemsTotal=0,seenIntro=false;
const SKEY='construction-school-v1';
try{const s=JSON.parse(localStorage.getItem(SKEY)||'null');if(s){job=s.job|0;jobDust=+s.jd||0;jobGems=s.jg|0;totalDust=+s.dust||0;gemsTotal=s.gems|0;seenIntro=!!s.intro;}}catch(e){}
function save(){try{localStorage.setItem(SKEY,JSON.stringify({job,jd:jobDust,jg:jobGems,dust:totalDust,gems:gemsTotal,intro:seenIntro}));}catch(e){}}
const curJob=()=>JOBS[job]||FREE;

let rocks=[],parts=[],gems=[],rid=0,time=0;
let power={state:'off',t:0},sp=0,crPhase=0,beltOff=0,beltSpeed=0,millRot=0,ballPhase=0,lastStroke=0;
const mill={load:0,colors:[]};
let binShow=0,completing=false,modalOpen=false,mode='touch',dragging=false;
const arm={t1:0,t2:0,branch:1,tgt:{x:560,y:300},cmd:{x:560,y:300},open:1,snap:0,held:null,E:{x:0,y:0},tip:{x:0,y:0},G:{x:0,y:0},v:{x:0,y:0}};
const lever={t1:0,rel:0,b:0,a:0};
const keys={};
const truck={state:'idle',x:-320,bed:0,t:0,load:0,cool:0.8,beep:0,spawnT:0,wheel:0,force:false};

/* ================= world colliders ================= */
const segs=[];
function seg(x1,y1,x2,y2,o){const s=Object.assign({x1,y1,x2,y2,fr:3},o||{});segs.push(s);return s;}
seg(-100,GY,W+100,GY,{fr:4});
seg(0,-600,0,GY,{fr:.5});seg(W,-600,W,GY,{fr:.5});
seg(388,GY,394,476,{fr:1});seg(394,476,466,476);seg(466,476,472,GY,{fr:1});
seg(598,212,622,250,{fr:.6});seg(816,212,792,250,{fr:.6});
const jawL=seg(622,250,684,432,{fr:.8,jaw:'L'});
const jawR=seg(792,250,706,432,{fr:.8,jaw:'R'});
seg(592,206,592,446,{fr:1});seg(826,206,826,392,{fr:1});
const belt=seg(648,500,880,407,{belt:true});
seg(646,501,640,468,{fr:1});
const BL=Math.hypot(belt.x2-belt.x1,belt.y2-belt.y1),BU={x:(belt.x2-belt.x1)/BL,y:(belt.y2-belt.y1)/BL};
const grate=seg(874,421,952,421,{grate:true,fr:2});
seg(874,421,902,462,{fr:.5});seg(952,421,934,462,{fr:.5});
seg(BIN.x1,BIN.top,BIN.x1,GY,{fr:1});seg(BIN.x2,BIN.top,BIN.x2,GY,{fr:1});

/* ================= canvas sizing ================= */
const canvas=$('c'),ctx=canvas.getContext('2d');
let cw=0,ch=0,dpr=1,scale=1,offX=0,offY=0,rotDismissed=false;
function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);cw=window.innerWidth;ch=window.innerHeight;
  canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr);canvas.style.width=cw+'px';canvas.style.height=ch+'px';
  scale=Math.min(cw/W,ch/H);offX=(cw-W*scale)/2;offY=(ch-H*scale)/2;
  $('rot').hidden=rotDismissed||!(ch>cw*1.1);
}
window.addEventListener('resize',resize);window.addEventListener('orientationchange',()=>setTimeout(resize,250));
resize();
const toWorld=(px,py)=>({x:(px-offX)/scale,y:(py-offY)/scale});

/* ================= audio ================= */
let A=null,noise=null,muted=false,thudCD=0;
function ac(){
  if(muted)return null;
  try{
    if(!A){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;A=new C();
      const b=A.createBuffer(1,A.sampleRate,A.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;noise=b;}
    if(A.state!=='running')A.resume();
  }catch(e){A=null;}
  return A;
}
function env(g,t,peak,dur){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);}
function tone(f,dur,type,vol,delay,f2){const a=A&&!muted?A:null;if(!a)return;const t=a.currentTime+(delay||0);const o=a.createOscillator(),g=a.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);env(g,t,vol||.1,dur);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+dur+.05);}
function hiss(dur,freq,vol,delay){const a=A&&!muted?A:null;if(!a||!noise)return;const t=a.currentTime+(delay||0);const s=a.createBufferSource();s.buffer=noise;
  const f=a.createBiquadFilter();f.type='lowpass';f.frequency.value=freq;const g=a.createGain();env(g,t,vol,dur);s.connect(f);f.connect(g);g.connect(a.destination);s.start(t,Math.random()*.5);s.stop(t+dur+.05);}
const sfx={
  crunch:r=>{hiss(.2+r/120,500+r*20,.5);hiss(.08,2600,.15,.02);tone(70,.18,'square',.05,0,40);},
  clank:()=>{tone(320,.07,'square',.05,0,160);tone(900,.05,'triangle',.05);},
  snap:()=>tone(500,.05,'square',.04,0,250),
  beep:()=>tone(1150,.16,'square',.045),
  horn:()=>{for(let i=0;i<2;i++){tone(440,.5,'sawtooth',.06,i*.65);tone(554,.5,'sawtooth',.045,i*.65);}},
  alarm:()=>{for(let i=0;i<6;i++)tone(i%2?620:880,.18,'square',.06,i*.2);},
  chime:()=>[1047,1319,1568,2093].forEach((f,i)=>tone(f,.25,'triangle',.08,i*.07)),
  fanfare:()=>[523,659,784,1047,784,1047].forEach((f,i)=>tone(f,i===5?.6:.18,'square',.05,i*.15)),
  thud:v=>hiss(.12,260,Math.min(.3,v)),
  stroke:()=>tone(55,.12,'sine',.07),
  grind:()=>hiss(.08,900,.05),
  stop:()=>tone(300,.4,'sawtooth',.04,0,80)
};
const vib=ms=>{try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}};

/* ================= toast ================= */
const toastEl=$('toast');let toastT=0;const toastCD={};
function toast(msg,kind,key,cd){
  if(key){const now=performance.now()/1000;if(toastCD[key]&&now-toastCD[key]<(cd||8))return;toastCD[key]=now;}
  toastEl.textContent=msg;toastEl.className='show '+(kind||'');toastT=3;
}

/* ================= rocks ================= */
function pickType(w){let tot=0;for(const k in w)tot+=w[k];let r=Math.random()*tot;for(const k in w){r-=w[k];if(r<=0)return k;}return Object.keys(w)[0];}
function makeRock(type,r,x,y){
  const T=TYPES[type],pts=[],specks=[],cracks=[];
  for(let i=0;i<9;i++)pts.push(.86+Math.random()*.2);
  const ns=Math.round(r/2.5);for(let k=0;k<ns;k++)specks.push([Math.random()*TAU,Math.random()*.72,.8+Math.random()*1.6]);
  for(let k=0;k<3;k++)cracks.push([Math.random()*TAU,.5+Math.random()*.5]);
  return {id:++rid,type,r,x,y,vx:0,vy:0,ang:Math.random()*TAU,pts,specks,cracks,col:T.cols[(Math.random()*T.cols.length)|0],
    hp:T.hard*r*1.25,maxhp:T.hard*r*1.25,opened:false,held:false,dead:false,idle:0,shake:0,tL:false,tR:false,nL:false,nR:false,onBelt:false,sq:false};
}
function split(rk){
  rk.dead=true;
  const n=rk.r>21&&rocks.length<90?3:2,fr=[];let sum=0;
  for(let i=0;i<n;i++){const f=.7+Math.random()*.6;fr.push(f);sum+=f;}
  const A2=rk.r*rk.r*.97,a0=Math.random()*TAU;
  for(let i=0;i<n;i++){
    const nr=Math.sqrt(A2*fr[i]/sum);if(nr<4)continue;
    const a=a0+i*TAU/n,off=(rk.r-nr)*.8;
    const p=makeRock(rk.type,nr,rk.x+Math.cos(a)*off,rk.y+Math.sin(a)*off);
    p.vx=rk.vx+Math.cos(a)*40;p.vy=rk.vy+Math.sin(a)*40-20;p.col=rk.col;p.opened=rk.type==='geode';
    rocks.push(p);
  }
  puff(rk.x,rk.y,rk.r,TYPES[rk.type].cols[0]);sfx.crunch(rk.r);vib(15);
  if(rk.type==='geode'&&!rk.opened)spawnGem(rk.x,rk.y);
}

/* ================= physics ================= */
function collideJaw(r,s,h){
  const dx=s.x2-s.x1,dy=s.y2-s.y1,L=dx*dx+dy*dy,len=Math.sqrt(L);
  const t=((r.x-s.x1)*dx+(r.y-s.y1)*dy)/L;if(t<0||t>1)return collideSegRaw(r,s,h);
  let nx=-dy/len,ny=dx/len;if((703-s.x1)*nx+(340-s.y1)*ny<0){nx=-nx;ny=-ny;}
  const sd=(r.x-s.x1)*nx+(r.y-s.y1)*ny;
  if(sd>=r.r+.6||sd<-34)return;
  if(s.jaw==='L')r.tL=true;else r.tR=true;
  if(sd>=r.r)return;
  const pen=r.r-sd;r.x+=nx*pen;r.y+=ny*pen;
  let vn=r.vx*nx+r.vy*ny;const tx=-ny,ty=nx;let vt=r.vx*tx+r.vy*ty;if(vn<0)vn=-vn*.15;vt*=1-Math.min(1,s.fr*h*.4);
  r.vx=vn*nx+vt*tx;r.vy=vn*ny+vt*ty;
}
function collideSeg(r,s,h){if(s.jaw)return collideJaw(r,s,h);return collideSegRaw(r,s,h);}
function collideSegRaw(r,s,h){
  const dx=s.x2-s.x1,dy=s.y2-s.y1,L=dx*dx+dy*dy;
  let t=((r.x-s.x1)*dx+(r.y-s.y1)*dy)/L;t=t<0?0:t>1?1:t;
  const px=s.x1+dx*t,py=s.y1+dy*t;let nx=r.x-px,ny=r.y-py;const d=Math.hypot(nx,ny);
  if(d>=r.r+.6||d<1e-6)return;
  if(s.jaw==='L')r.tL=true;else if(s.jaw==='R')r.tR=true;
  if(d>=r.r)return;
  nx/=d;ny/=d;const pen=r.r-d;r.x+=nx*pen;r.y+=ny*pen;
  let vn=r.vx*nx+r.vy*ny;const tx=-ny,ty=nx;let vt=r.vx*tx+r.vy*ty;
  if(vn<-380&&r.r>11&&thudCD<=0){sfx.thud(-vn/3000*(r.r/25));thudCD=.07;}
  if(vn<0)vn=-vn*.15;
  if(s.belt){r.onBelt=true;const target=beltSpeed*(BU.x*tx+BU.y*ty);vt+=(target-vt)*Math.min(1,14*h);}
  else vt*=1-Math.min(1,s.fr*h*(ny<-.3?1:.4));
  r.vx=vn*nx+vt*tx;r.vy=vn*ny+vt*ty;
}
function collideCircle(r,cx,cy,R,h){
  let nx=r.x-cx,ny=r.y-cy;const d=Math.hypot(nx,ny),min=R+r.r;if(d>=min||d<1e-6)return;
  nx/=d;ny/=d;r.x=cx+nx*min;r.y=cy+ny*min;
  let vn=r.vx*nx+r.vy*ny;const tx=-ny,ty=nx;let vt=r.vx*tx+r.vy*ty;if(vn<0)vn=-vn*.15;vt*=1-Math.min(1,1.2*h);
  r.vx=vn*nx+vt*tx;r.vy=vn*ny+vt*ty;
}
function pushFrom(r,cx,cy,pr){
  let nx=r.x-cx,ny=r.y-cy;const d=Math.hypot(nx,ny),min=pr+r.r;if(d>=min||d<1e-6)return;
  nx/=d;ny/=d;r.x=cx+nx*min;r.y=cy+ny*min;
  const vn=(r.vx-arm.v.x)*nx+(r.vy-arm.v.y)*ny;if(vn<0){r.vx-=vn*nx*1.1;r.vy-=vn*ny*1.1;}
}
function collidePair(a,b){
  const dx=b.x-a.x,dy=b.y-a.y,min=a.r+b.r;if(dx>min||dx<-min||dy>min||dy<-min)return;
  const d2=dx*dx+dy*dy;if(d2>=min*min)return;
  const d=Math.sqrt(d2)||.01,nx=dx/d,ny=dy/d;
  const ia=a.held?0:1/(a.r*a.r),ib=b.held?0:1/(b.r*b.r),it=ia+ib;if(it===0)return;
  const pen=Math.min(min-d,3);
  a.x-=nx*pen*ia/it;a.y-=ny*pen*ia/it;b.x+=nx*pen*ib/it;b.y+=ny*pen*ib/it;
  const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
  if(vn<0){const j=-1.12*vn/it;a.vx-=j*ia*nx;a.vy-=j*ia*ny;b.vx+=j*ib*nx;b.vy+=j*ib*ny;
    const tx=-ny,ty=nx,vt=(b.vx-a.vx)*tx+(b.vy-a.vy)*ty,jt=vt*.15/it;a.vx+=jt*ia*tx;a.vy+=jt*ia*ty;b.vx-=jt*ib*tx;b.vy-=jt*ib*ty;}
  if(a.tL)b.nL=true;if(a.tR)b.nR=true;if(b.tL)a.nL=true;if(b.tR)a.nR=true;
}
function stepPhysics(h){
  for(const r of rocks){
    if(r.dead)continue;
    if(r.held){r.x=arm.G.x;r.y=Math.min(arm.G.y+r.r*.45,GY-r.r);r.vx=arm.v.x;r.vy=arm.v.y;continue;}
    r.vy=Math.min(r.vy+GRAV*h,2200);r.vx*=1-.12*h;r.x+=r.vx*h;r.y+=r.vy*h;
    if(r.r<=MILL_MAX_R&&r.x>FEED.x1&&r.x<FEED.x2&&r.y>FEED.y1&&r.y<FEED.y2){
      r.dead=true;mill.load+=kg(r.r);mill.colors.push(r.col);if(mill.colors.length>12)mill.colors.shift();
    }
  }
  for(let it=0;it<2;it++){
    for(const r of rocks){
      if(r.held||r.dead)continue;
      for(const s of segs){if(s.grate&&r.r<=MILL_MAX_R)continue;collideSeg(r,s,h);}
      collideCircle(r,M.x,M.y,M.R,h);
    }
    for(let i=0;i<rocks.length;i++){const a=rocks[i];if(a.dead)continue;
      for(let j=i+1;j<rocks.length;j++){const b=rocks[j];if(!b.dead)collidePair(a,b);}}
  }
  for(const r of rocks)if(!r.held)r.ang+=r.vx/r.r*h;
}

/* ================= arm ================= */
function solveIK(tx,ty,branch){
  let dx=tx-S.x,dy=ty-S.y,d=Math.hypot(dx,dy);
  const maxd=L1+L2-1,mind=Math.abs(L1-L2)+30;
  if(d>maxd){dx*=maxd/d;dy*=maxd/d;d=maxd;}
  if(d<mind){if(d<1e-3){dx=0;dy=mind;}else{dx*=mind/d;dy*=mind/d;}d=mind;}
  const a=Math.atan2(dy,dx),al=Math.acos(clamp((L1*L1+d*d-L2*L2)/(2*L1*d),-1,1));
  const t1=branch>0?a-al:a+al;
  const ex=S.x+L1*Math.cos(t1),ey=S.y+L1*Math.sin(t1);
  return [t1,Math.atan2(S.y+dy-ey,S.x+dx-ex)];
}
function fk(t1,t2){const E={x:S.x+L1*Math.cos(t1),y:S.y+L1*Math.sin(t1)};const T={x:E.x+L2*Math.cos(t2),y:E.y+L2*Math.sin(t2)};return {E,T,G:{x:T.x,y:T.y+CLAW}};}
{const [a,b]=solveIK(arm.tgt.x,arm.tgt.y-CLAW,1);arm.t1=normTop(a);arm.t2=b;const f=fk(arm.t1,arm.t2);arm.E=f.E;arm.tip=f.T;arm.G=f.G;}

function updateArm(dt){
  let T1,T2;
  if(mode==='touch'){
    const kx=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0),ky=(keys.ArrowDown?1:0)-(keys.ArrowUp?1:0);
    if(kx||ky){arm.tgt.x=clamp(arm.tgt.x+kx*320*dt,20,W-20);arm.tgt.y=clamp(arm.tgt.y+ky*320*dt,40,GY-8);}
    const cx=arm.tgt.x-arm.cmd.x,cy=arm.tgt.y-arm.cmd.y,cd=Math.hypot(cx,cy);
    if(cd>.5){const stp=Math.min(cd,Math.max(60,cd*4)*dt,420*dt);arm.cmd.x+=cx/cd*stp;arm.cmd.y+=cy/cd*stp;}
    if(arm.cmd.x>S.x+30)arm.branch=1;else if(arm.cmd.x<S.x-30)arm.branch=-1;
    [T1,T2]=solveIK(arm.cmd.x,arm.cmd.y-CLAW,arm.branch);
  }else{
    const b=lever.b+((keys.ArrowUp?-1:0)+(keys.ArrowDown?1:0)),a=lever.a+((keys.ArrowLeft?-1:0)+(keys.ArrowRight?1:0));
    const nt1=clamp(lever.t1+clamp(b,-1,1)*1.1*dt,-Math.PI-.6,.6),nrel=clamp(lever.rel+clamp(a,-1,1)*1.5*dt,-2.9,2.9);
    const f=fk(nt1,nt1+nrel);
    if(f.G.y<GY-6&&f.G.y>10){lever.t1=nt1;lever.rel=nrel;}
    T1=lever.t1;T2=lever.t1+lever.rel;
  }
  T1=normTop(T1);
  const k=mode==='touch'?18:7,c1=mode==='touch'?3.6:2.3,c2=mode==='touch'?4.5:3.2;
  arm.t1+=clamp((T1-arm.t1)*k*dt,-c1*dt,c1*dt);
  arm.t2+=clamp(angDiff(T2,arm.t2)*k*dt,-c2*dt,c2*dt);
  const f=fk(arm.t1,arm.t2),pg=arm.G;
  arm.E=f.E;arm.tip=f.T;arm.G=f.G;
  arm.v={x:clamp((f.G.x-pg.x)/Math.max(dt,1e-3),-700,700),y:clamp((f.G.y-pg.y)/Math.max(dt,1e-3),-700,700)};
  if(arm.snap>0){arm.snap-=dt;}
  const want=arm.held?clamp(arm.held.r/40,.3,.75):(arm.snap>0?.08:1);
  arm.open+=clamp(want-arm.open,-5*dt,5*dt);
}
function grabbable(){
  let best=null,bd=1e9;
  for(const r of rocks){if(r.dead||r.held)continue;const d=Math.hypot(r.x-arm.G.x,r.y-arm.G.y);
    if(d<r.r+16&&r.y>arm.G.y-12&&d<bd){bd=d;best=r;}}
  return best;
}
function pressGrab(){
  ac();
  if(modalOpen)return;
  if(arm.held){const r=arm.held;r.held=false;r.vx=arm.v.x;r.vy=arm.v.y;arm.held=null;sfx.snap();return;}
  const r=grabbable();
  if(r){arm.held=r;r.held=true;sfx.clank();vib(10);}
  else{arm.snap=.35;sfx.snap();toast('Move the claw right on top of a rock, then press GRAB.','', 'miss',10);}
}
function clawInJaws(){
  const g=arm.G;if(g.y<325||g.y>445)return false;
  const tl=(g.y-jawL.y1)/(jawL.y2-jawL.y1),xl=jawL.x1+(jawL.x2-jawL.x1)*tl;
  const tr=(g.y-jawR.y1)/(jawR.y2-jawR.y1),xr=jawR.x1+(jawR.x2-jawR.x1)*tr;
  return g.x>xl+2&&g.x<xr-2;
}

/* ================= power ================= */
const powerBtn=$('power');
function updatePowerBtn(){
  const st=power.state;
  powerBtn.textContent=st==='on'?'STOP':st==='warn'?'WAIT':'START';
  powerBtn.className='round'+(st==='on'?' on':st==='warn'?' warn':'')+((st==='off'||st==='tripped')&&rocksInCrusher()?' hint':'')+(st==='off'&&totalDust===0&&!rocks.length?' hint':'');
}
function pressPower(){
  ac();if(modalOpen)return;
  if(power.state==='off'||power.state==='tripped'){
    if(clawInJaws()){toast('Lift the claw out of the crusher first!','warn');return;}
    power.state='warn';power.t=1.4;sfx.horn();toast('📣 Stand clear! Machines starting…');
  }else{power.state='off';sfx.stop();toast('Machines stopping. Big machines take a while to slow down.','', 'coast',30);}
  updatePowerBtn();
}
function trip(){
  power.state='tripped';sfx.alarm();vib([60,40,60]);
  toast('⚠️ SAFETY STOP! The claw got too close to the crusher jaws. Lift the arm, then press START.','warn');
  updatePowerBtn();
}
const rocksInCrusher=()=>rocks.some(r=>!r.dead&&!r.held&&r.x>605&&r.x<810&&r.y>240&&r.y<440);

/* ================= truck ================= */
function needRocks(){
  let n=0;for(const r of rocks)if(!r.dead&&!r.held&&r.r>=15&&r.x<590)n++;
  return n<2&&rocks.length<60;
}
function updateTruck(dt){
  const t=truck;
  if(t.state==='idle'){
    if(t.cool>0)t.cool-=dt;
    else if(t.force||needRocks()){t.state='in';t.x=-320;t.load=6+(job>=2?1:0);t.beep=0;t.force=false;}
    return;
  }
  if(t.state==='in'){
    t.x+=190*dt;t.wheel+=190*dt/20;t.beep-=dt;if(t.beep<=0){sfx.beep();t.beep=.5;}
    if(t.x>=40){t.x=40;t.state='dump';t.t=0;t.spawnT=0;}
  }else if(t.state==='dump'){
    t.t+=dt;t.bed=Math.min(1,t.t/.8);
    if(t.bed>.55&&t.load>0){t.spawnT-=dt;if(t.spawnT<=0){
      const w=curJob().rocks,type=pickType(w),T=TYPES[type],r=rand(T.rmin,T.rmax);
      const rk=makeRock(type,r,t.x+222-r*.4,486-r*.3);rk.vx=rand(70,170);rk.vy=rand(-60,10);rocks.push(rk);t.load--;t.spawnT=.2;}}
    if(t.load<=0&&t.t>1.6){t.state='lower';}
  }else if(t.state==='lower'){
    t.bed-=dt/.7;if(t.bed<=0){t.bed=0;t.state='out';}
  }else if(t.state==='out'){
    t.x-=240*dt;t.wheel-=240*dt/20;if(t.x<-330){t.state='idle';t.cool=2.5;}
  }
}

/* ================= particles & gems ================= */
function puff(x,y,r,col){for(let i=0;i<r*.8;i++)parts.push({k:'dust',x:x+rand(-r,r)*.5,y:y+rand(-r,r)*.5,vx:rand(-60,60),vy:rand(-90,10),life:0,max:rand(.5,1.1),s:rand(3,7),col});}
function spawnGem(x,y){
  gems.push({x,y,vy:-260,t:0,ph:'pop',col:['#B05CFF','#4FC3F7','#FF5A8A','#5BE37A'][(Math.random()*4)|0]});
  sfx.chime();toast('💎 You cracked a geode and found a crystal!','good');
}
function confetti(){const c=['#FFC21A','#E2412B','#23A04A','#4FC3F7','#B05CFF','#fff'];
  for(let i=0;i<140;i++)parts.push({k:'conf',x:rand(0,W),y:rand(-120,-10),vx:rand(-60,60),vy:rand(60,200),life:0,max:rand(2.5,4),s:rand(5,9),col:c[i%c.length],a:rand(0,TAU),va:rand(-8,8)});}
function updateParts(dt){
  for(const p of parts){
    p.life+=dt;
    if(p.k==='dust'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy=p.vy*.95-12*dt;p.s+=8*dt;}
    else if(p.k==='fall'){p.vy+=500*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.y>p.floor)p.life=p.max;}
    else if(p.k==='conf'){p.vy=Math.min(p.vy+150*dt,220);p.x+=p.vx*dt+Math.sin(p.life*4+p.a)*30*dt;p.y+=p.vy*dt;p.a+=p.va*dt;}
  }
  parts=parts.filter(p=>p.life<p.max);
  const gemEl=$('gems');
  for(const g of gems){
    g.t+=dt;
    if(g.ph==='pop'){g.y+=g.vy*dt;g.vy+=380*dt;if(g.t>.9){g.ph='fly';}}
    else{const r=gemEl.getBoundingClientRect(),tw=toWorld(r.left+r.width*.3,r.top+r.height/2);
      g.x+=(tw.x-g.x)*Math.min(1,5*dt);g.y+=(tw.y-g.y)*Math.min(1,5*dt);
      if(Math.hypot(tw.x-g.x,tw.y-g.y)<25||g.t>4){g.done=true;gemsTotal++;jobGems++;sfx.chime();save();updateHUD();
        gemEl.classList.remove('pulse');void gemEl.offsetWidth;gemEl.classList.add('pulse');}}
  }
  gems=gems.filter(g=>!g.done);
}

/* ================= update ================= */
let hudT=0,grindT=0;
function update(dt){
  time+=dt;thudCD-=dt;
  if(power.state==='warn'){power.t-=dt;if(power.t<=0){power.state='on';updatePowerBtn();}}
  const on=power.state==='on';
  sp+=clamp((on?1:0)-sp,-.45*dt,.7*dt);
  const prev=crPhase;crPhase+=TAU*2.4*sp*dt;
  if(sp>.3&&Math.floor(crPhase/TAU)!==Math.floor(prev/TAU))sfx.stroke();
  jawR.x2=706+5*Math.sin(crPhase);jawR.x1=792+2.5*Math.sin(crPhase+.8);
  const closing=Math.cos(crPhase)<0;
  beltSpeed=95*sp;beltOff+=beltSpeed*dt;millRot+=1.7*sp*dt;ballPhase+=.85*sp*dt;

  updateArm(dt);
  if((power.state==='on'||power.state==='warn')&&clawInJaws())trip();

  for(const r of rocks){r.tL=r.tR=r.nL=r.nR=r.onBelt=false;}
  const n=4,h=dt/n;
  for(let i=0;i<n;i++)stepPhysics(h);

  if(sp>.4){
    for(const r of rocks){
      if(r.dead||r.held||r.r<MIN_SPLIT_R)continue;
      if(r.y<245||r.y>440||r.x<610||r.x>800)continue;
      if((r.tL||r.nL)&&(r.tR||r.nR)){
        r.hp-=dt*62*sp*(closing?1:.15);r.shake=.12;
        if(Math.random()<dt*4)puff(r.x,r.y,6,TYPES[r.type].cols[0]);
        if(r.hp<=0)split(r);
      }
    }
  }
  for(const r of rocks){
    if(r.shake>0)r.shake-=dt;
    if(r.dead||r.held)continue;
    const far=Math.hypot(r.x-S.x,r.y-S.y)>L1+L2+CLAW-14||r.x>850||r.x<-10||r.y>GY+40;
    if(far&&!r.onBelt&&r.vx*r.vx+r.vy*r.vy<400)r.idle+=dt;else r.idle=0;
    if(r.idle>2.2){
      if(r.r>MILL_MAX_R&&r.x>860&&r.y<440)toast('That rock is too big for the ball mill! Crush it in the jaw crusher first.','warn','big',6);
      r.x=rand(290,370);r.y=-40;r.vx=r.vy=0;r.idle=0;
    }
  }
  rocks=rocks.filter(r=>!r.dead);
  if(arm.held&&arm.held.dead)arm.held=null;

  if(mill.load>0&&sp>.3){
    const amt=Math.min(mill.load,16*sp*dt);mill.load-=amt;jobDust+=amt;totalDust+=amt;
    if(Math.random()<.9)parts.push({k:'fall',x:1040+rand(-3,3),y:514,vx:rand(-10,10),vy:rand(0,40),life:0,max:2,s:rand(2,4),col:'#EDE3CC',floor:GY-binShow*(GY-BIN.top)-4});
    grindT-=dt;if(grindT<=0){sfx.grind();grindT=.18;}
  }
  if(!on&&rocksInCrusher())toast('The crusher is off. Press the green START button!','', 'start',9);

  const jb=curJob();
  const target=jb.dust?jobDust/jb.dust:jb.gems?jobGems/jb.gems:(totalDust%300)/300;
  binShow+=(clamp(target,0,1)-binShow)*Math.min(1,3*dt);

  updateTruck(dt);updateParts(dt);
  if(toastT>0){toastT-=dt;if(toastT<=0)toastEl.classList.remove('show');}
  hudT-=dt;if(hudT<=0){hudT=.2;updateHUD();updateButtons();}

  if(!completing&&JOBS[job]&&((jb.dust&&jobDust>=jb.dust)||(jb.gems&&jobGems>=jb.gems))){
    completing=true;sfx.fanfare();confetti();save();setTimeout(showComplete,1100);
  }
}

/* ================= HUD ================= */
let lastHUD='';
function updateHUD(){
  const jb=curJob();
  let bar,val;
  if(jb.dust){bar=jobDust/jb.dust;val=Math.floor(Math.min(jobDust,jb.dust))+' / '+jb.dust+' kg';}
  else if(jb.gems){bar=jobGems/jb.gems;val=Math.min(jobGems,jb.gems)+' / '+jb.gems+' crystals';}
  else{bar=(totalDust%300)/300;val=Math.floor(totalDust)+' kg total';}
  const badges=JOBS.slice(0,Math.min(job,JOBS.length)).map(j=>j.badge).join('');
  const key=jb.title+val+badges+gemsTotal;
  if(key===lastHUD)return;lastHUD=key;
  $('jt').textContent=jb.title;$('jx').textContent=jb.text;$('jb').style.width=(clamp(bar,0,1)*100)+'%';
  $('jv').textContent=val;$('badges').textContent=badges;$('gc').textContent=gemsTotal;
  save();
}
const grabBtn=$('grab');
function updateButtons(){
  const holding=!!arm.held;
  grabBtn.textContent=holding?'DROP':'GRAB';
  const overHopper=holding&&arm.G.x>612&&arm.G.x<800&&arm.G.y<262;
  grabBtn.className='round'+(holding?' drop':'')+((!holding&&grabbable())||overHopper?' ready':'');
  updatePowerBtn();
}

/* ================= modals ================= */
const modal=$('modal'),sheet=$('sheet');
function openModal(html){sheet.innerHTML=html;modal.hidden=false;modalOpen=true;sheet.scrollTop=0;}
function closeModal(){modal.hidden=true;modalOpen=false;}
const howTo=`<ol>
<li>Press the green <b>START</b> button. Listen for the warning horn, then the machines turn on.</li>
<li><b>Touch and drag</b> anywhere on the site. The arm follows your finger.</li>
<li>Put the claw on a rock and press <b>GRAB</b>. Move it over the crusher and press <b>DROP</b>.</li>
<li>Watch it go: jaw crusher ➜ conveyor ➜ ball mill ➜ rock dust!</li></ol>`;
function showIntro(){
  openModal(`<h2>👷 Welcome to Construction School!</h2><p>Today's class: <b>grinding rocks into dust</b>, just like a real quarry.</p>${howTo}
  <div class="row"><button class="btn alt" data-act="help">How does it work?</button><button class="btn" data-act="close">Let's work!</button></div>`);
}
function showHelp(){
  const dots=Object.values(TYPES).map(t=>`<div><span class="dot" style="background:${t.cols[0]}"></span><b>${t.name}</b> · ${t.name==='Sandstone'?'soft':t.name==='Limestone'?'medium':t.name==='Granite'?'very hard!':'crystals inside'}</div>`).join('');
  openModal(`<h2>How to run the rock grinder</h2>${howTo}
  <p><b>Levers mode</b> (button next to START) lets you drive the arm like a real excavator: one lever moves the <b>boom</b>, the other moves the <b>arm</b>. Need more rocks? Tap 🚚.</p>
  <h3>Rocks</h3><div class="rocks">${dots}</div>
  <h3>How real rock grinders work</h3>
  <p><b>1. Jaw crusher.</b> Two heavy steel plates make a V. One stays still. The other is pushed back and forth by a spinning shaft with a big flywheel. Rocks get squeezed until they crack. The pieces drop lower and lower until they're small enough to fall out of the gap at the bottom.</p>
  <p><b>2. Conveyor belt.</b> A rubber belt carries the gravel to the next machine.</p>
  <p><b>3. Ball mill.</b> A spinning drum full of steel balls. The balls ride up the side and tumble down, smashing gravel into fine powder. Big rocks won't go in, so they have to be crushed first.</p>
  <p><b>4. Rock dust.</b> Ground limestone is used to make cement and concrete. It's even in some toothpaste!</p>
  <p><b>Safety.</b> Real plants sound a horn before machines start and have emergency stop buttons. If the claw gets close to the moving jaw, this crusher stops itself, just like a real safety guard.</p>
  <div class="row"><button class="btn alt" data-act="reset">Start over</button><button class="btn" data-act="close">Back to work</button></div>`);
}
function showComplete(){
  const jb=JOBS[job];if(!jb){completing=false;return;}
  openModal(`<h2>✅ Job complete!</h2><div class="big">${jb.badge}</div><p style="text-align:center">You earned the <b>${jb.bname}</b> badge!</p>
  <p style="text-align:center">${job+1<JOBS.length?'Next up: <b>'+JOBS[job+1].title+'</b>':'You finished every job. Now you can grind in <b>free play</b>.'}</p>
  <div class="row"><button class="btn" data-act="next">Next job ➜</button></div>`);
}
sheet.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;ac();const a=b.dataset.act;
  if(a==='close'){closeModal();seenIntro=true;save();}
  else if(a==='help')showHelp();
  else if(a==='next'){job++;jobDust=0;jobGems=0;completing=false;save();closeModal();lastHUD='';updateHUD();toast('New job: '+curJob().title,'good');}
  else if(a==='reset'){if(b.dataset.sure){job=0;jobDust=0;jobGems=0;totalDust=0;gemsTotal=0;completing=false;save();lastHUD='';updateHUD();closeModal();toast('Starting over at Job 1');}
    else{b.dataset.sure='1';b.textContent='Tap again to reset';}}
});

/* ================= input ================= */
const activePointers=new Set();
canvas.addEventListener('pointerdown',e=>{
  ac();if(modalOpen||mode!=='touch')return;e.preventDefault();
  activePointers.add(e.pointerId);dragging=true;try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  setTarget(e);
});
canvas.addEventListener('pointermove',e=>{if(dragging&&activePointers.has(e.pointerId))setTarget(e);});
const endPtr=e=>{activePointers.delete(e.pointerId);if(!activePointers.size)dragging=false;ac();};
canvas.addEventListener('pointerup',endPtr);canvas.addEventListener('pointercancel',endPtr);
function setTarget(e){const p=toWorld(e.clientX,e.clientY);arm.tgt.x=clamp(p.x,20,W-20);arm.tgt.y=clamp(p.y,40,GY-8);}
document.addEventListener('touchmove',e=>{if(!e.target.closest('.sheet'))e.preventDefault();},{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('dblclick',e=>e.preventDefault());
document.addEventListener('contextmenu',e=>e.preventDefault());

const tap=(el,fn)=>el.addEventListener('pointerdown',e=>{e.preventDefault();fn(e);});
tap(grabBtn,pressGrab);
tap(powerBtn,pressPower);
tap($('helpBtn'),()=>{ac();showHelp();});
tap($('snd'),()=>{muted=!muted;$('snd').textContent=muted?'🔇':'🔊';if(!muted)ac();});
tap($('truckBtn'),()=>{ac();if(truck.state!=='idle'){toast('The truck is already on its way!','', 'truck',3);return;}
  if(rocks.length>=55){toast('The site is full of rocks! Grind some first.','', 'full',5);return;}truck.force=true;truck.cool=0;});
tap($('rotOk'),()=>{rotDismissed=true;$('rot').hidden=true;});
tap($('mode'),()=>{
  ac();
  if(mode==='touch'){mode='lever';lever.t1=clamp(arm.t1,-Math.PI-.6,.6);lever.rel=angDiff(arm.t2,arm.t1);$('mode').textContent='🕹️ Levers';$('levers').hidden=false;}
  else{mode='touch';arm.tgt={x:arm.G.x,y:Math.min(arm.G.y,GY-8)};arm.cmd={x:arm.tgt.x,y:arm.tgt.y};
    const E=arm.E,T=arm.tip;arm.branch=((E.x-S.x)*(T.y-S.y)-(E.y-S.y)*(T.x-S.x))>0?1:-1;
    $('mode').textContent='✋ Touch';$('levers').hidden=true;}
});
document.querySelectorAll('.lv').forEach(b=>{
  const k=b.dataset.l[0],d=b.dataset.l[1]==='+'?1:-1;
  const down=e=>{e.preventDefault();ac();try{b.setPointerCapture(e.pointerId);}catch(_){}lever[k]=d;b.classList.add('on');};
  const up=()=>{if(lever[k]===d)lever[k]=0;b.classList.remove('on');};
  b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);
});
window.addEventListener('keydown',e=>{
  if(modalOpen)return;
  if(e.key.startsWith('Arrow')){keys[e.key]=true;e.preventDefault();}
  else if(e.key===' '&&!e.repeat){e.preventDefault();pressGrab();}
  else if(e.key==='Enter'&&!e.repeat){e.preventDefault();pressPower();}
});
window.addEventListener('keyup',e=>{keys[e.key]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;lever.a=lever.b=0;dragging=false;activePointers.clear();});

/* ================= drawing helpers ================= */
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function line(x1,y1,x2,y2,w,c){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=w;ctx.strokeStyle=c;ctx.stroke();}
function fillStroke(f,s,w){ctx.fillStyle=f;ctx.fill();if(s){ctx.lineWidth=w||3;ctx.strokeStyle=s;ctx.stroke();}}
const INK='#2A2118',YEL='#FFC21A',STEEL='#56626C';
const pebbles=[];for(let i=0;i<110;i++)pebbles.push([rand(-500,W+500),rand(GY+10,GY+300),rand(1.5,4),Math.random()<.5?'#9C6B3C':'#C99A66']);
const clouds=[[120,110,1],[520,60,.8],[860,120,1.2],[1250,80,.9]];

function drawBackground(){
  const g=ctx.createLinearGradient(0,-300,0,GY);g.addColorStop(0,'#5DB7E8');g.addColorStop(1,'#D9F1FB');
  ctx.fillStyle=g;ctx.fillRect(-3000,-3000,W+6000,GY+3000);
  ctx.fillStyle='rgba(255,236,150,.35)';ctx.beginPath();ctx.arc(150,95,60,0,TAU);ctx.fill();
  ctx.fillStyle='#FFE27A';ctx.beginPath();ctx.arc(150,95,36,0,TAU);ctx.fill();
  for(const c of clouds){const x=((c[0]+time*8*c[2])%(W+600))-250,y=c[1],s=c[2];
    ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.arc(x,y,22*s,0,TAU);ctx.arc(x+26*s,y-10*s,28*s,0,TAU);ctx.arc(x+56*s,y,22*s,0,TAU);ctx.rect(x,y,56*s,22*s);ctx.fill();}
  const hill=(base,amp,col,ph)=>{ctx.beginPath();ctx.moveTo(-3000,GY);for(let x=-1000;x<=W+1000;x+=40)ctx.lineTo(x,base-Math.sin(x/170+ph)*amp-Math.sin(x/63+ph*2)*amp*.25);ctx.lineTo(W+3000,GY);ctx.closePath();ctx.fillStyle=col;ctx.fill();};
  hill(430,30,'#B9D9A0',1);hill(475,22,'#9CC783',2.3);
  // quarry wall stripes in distance
  ctx.fillStyle='#C9B79A';ctx.beginPath();ctx.moveTo(-40,GY);ctx.lineTo(-40,400);ctx.lineTo(60,385);ctx.lineTo(150,410);ctx.lineTo(230,440);ctx.lineTo(260,GY);ctx.fill();
  ctx.strokeStyle='rgba(120,95,65,.35)';ctx.lineWidth=2;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-40,420+i*30);ctx.lineTo(160+i*28,440+i*30);ctx.stroke();}
  // sign
  ctx.save();ctx.translate(470,30);
  line(30,58,30,120,6,'#7A5532');line(230,58,230,120,6,'#7A5532');
  rr(-20,0,300,62,10);fillStroke('#FFF7E0',INK,3);
  ctx.save();rr(-20,0,300,62,10);ctx.clip();for(let i=-2;i<30;i++){ctx.fillStyle=i%2?YEL:INK;ctx.beginPath();ctx.moveTo(i*14,0);ctx.lineTo(i*14+14,0);ctx.lineTo(i*14+6,9);ctx.lineTo(i*14-8,9);ctx.fill();}ctx.restore();
  ctx.fillStyle=INK;ctx.textAlign='center';ctx.font='900 23px "Arial Rounded MT Bold","Trebuchet MS",sans-serif';ctx.fillText('CONSTRUCTION SCHOOL',130,38,280);
  ctx.font='700 13px "Trebuchet MS",sans-serif';ctx.fillText('Rock grinding class',130,55);
  ctx.restore();
  // ground
  ctx.fillStyle='#B6834F';ctx.fillRect(-3000,GY,W+6000,3000);
  ctx.fillStyle='#9C6B3C';ctx.fillRect(-3000,GY,W+6000,6);
  for(const p of pebbles){ctx.fillStyle=p[3];ctx.beginPath();ctx.arc(p[0],p[1],p[2],0,TAU);ctx.fill();}
}

function drawRock(r){
  const T=TYPES[r.type];
  ctx.save();
  ctx.translate(r.x+(r.shake>0?rand(-1.5,1.5):0),r.y+(r.shake>0?rand(-1.5,1.5):0));
  ctx.rotate(r.ang);
  ctx.beginPath();
  for(let i=0;i<9;i++){const a=i/9*TAU,q=r.r*r.pts[i]*1.04;i?ctx.lineTo(Math.cos(a)*q,Math.sin(a)*q):ctx.moveTo(Math.cos(a)*q,Math.sin(a)*q);}
  ctx.closePath();ctx.fillStyle=r.col;ctx.fill();ctx.lineWidth=r.r>10?2.2:1.5;ctx.strokeStyle=T.edge;ctx.stroke();
  if(r.r>6)for(const s of r.specks){ctx.fillStyle=T.speck;ctx.beginPath();ctx.arc(Math.cos(s[0])*s[1]*r.r,Math.sin(s[0])*s[1]*r.r,s[2]*(r.r/25+.4),0,TAU);ctx.fill();}
  if(r.type==='geode'&&r.opened&&r.r>5){
    ctx.beginPath();for(let i=0;i<9;i++){const a=i/9*TAU,q=r.r*r.pts[i]*.62;i?ctx.lineTo(Math.cos(a)*q,Math.sin(a)*q):ctx.moveTo(Math.cos(a)*q,Math.sin(a)*q);}
    ctx.closePath();ctx.fillStyle='#9B59D0';ctx.fill();ctx.fillStyle='rgba(255,255,255,.75)';
    for(let i=0;i<4;i++){const a=i*1.7;ctx.beginPath();ctx.moveTo(Math.cos(a)*r.r*.1,Math.sin(a)*r.r*.1);ctx.lineTo(Math.cos(a+.25)*r.r*.45,Math.sin(a+.25)*r.r*.45);ctx.lineTo(Math.cos(a-.15)*r.r*.4,Math.sin(a-.15)*r.r*.4);ctx.fill();}
  }
  const dmg=1-r.hp/r.maxhp;
  if(dmg>.25){ctx.strokeStyle='rgba(40,25,15,.75)';ctx.lineWidth=1.6;const nc=dmg>.6?3:dmg>.4?2:1;
    for(let i=0;i<nc;i++){const c=r.cracks[i];ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(c[0])*r.r*.45,Math.sin(c[0])*r.r*.45+3);ctx.lineTo(Math.cos(c[0]+.3)*r.r*c[1],Math.sin(c[0]+.3)*r.r*c[1]);ctx.stroke();}}
  ctx.restore();
  ctx.fillStyle='rgba(255,255,255,.22)';ctx.beginPath();ctx.ellipse(r.x-r.r*.3,r.y-r.r*.38,r.r*.32,r.r*.18,-.5,0,TAU);ctx.fill();
}

function drawFlywheel(cx,cy,R,a){
  ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);fillStroke('#3C454D',INK,3);
  ctx.beginPath();ctx.arc(cx,cy,R-8,0,TAU);ctx.fillStyle='#4B565F';ctx.fill();
  for(let i=0;i<6;i++){const q=a+i*TAU/6;line(cx,cy,cx+Math.cos(q)*(R-8),cy+Math.sin(q)*(R-8),6,'#3C454D');}
  ctx.beginPath();ctx.arc(cx,cy,10,0,TAU);fillStroke('#8C97A1',INK,2);
  ctx.beginPath();ctx.arc(cx+Math.cos(a)*4,cy+Math.sin(a)*4,4,0,TAU);ctx.fillStyle=INK;ctx.fill();
}
function drawCrusherBack(){
  ctx.fillStyle='#3E474F';ctx.fillRect(600,440,16,GY-440);ctx.fillRect(802,440,16,GY-440);
  ctx.fillRect(596,GY-8,24,8);ctx.fillRect(798,GY-8,24,8);
  rr(588,200,242,252,10);fillStroke(STEEL,INK,3);
  ctx.fillStyle='#3E474F';for(let i=0;i<6;i++){ctx.beginPath();ctx.arc(596,226+i*40,2.5,0,TAU);ctx.arc(822,226+i*40,2.5,0,TAU);ctx.fill();}
  drawFlywheel(806,238,50,crPhase);
  ctx.beginPath();ctx.moveTo(598,212);ctx.lineTo(622,250);ctx.lineTo(684,432);ctx.lineTo(jawR.x2,432);ctx.lineTo(jawR.x1,250);ctx.lineTo(816,212);ctx.closePath();
  ctx.fillStyle='#262B30';ctx.fill();
  // hopper glow when carrying a rock over it
  if(arm.held&&arm.G.x>612&&arm.G.x<800){ctx.strokeStyle='rgba(120,255,140,'+(.5+.4*Math.sin(time*8))+')';ctx.lineWidth=6;ctx.stroke();}
}
function teeth(s,inward){
  const dx=s.x2-s.x1,dy=s.y2-s.y1,L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
  let nx=-uy,ny=ux;if((703-s.x1)*nx+(340-s.y1)*ny<0){nx=-nx;ny=-ny;}
  // plate behind the line
  ctx.beginPath();ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.lineTo(s.x2-nx*12,s.y2-ny*12);ctx.lineTo(s.x1-nx*12,s.y1-ny*12);ctx.closePath();
  fillStroke(inward?'#8C97A1':'#9AA5AE',INK,2.5);
  ctx.beginPath();ctx.moveTo(s.x1,s.y1);
  for(let d=0;d<=L;d+=10){const k=(d/10)%2?3.5:0;ctx.lineTo(s.x1+ux*d+nx*k,s.y1+uy*d+ny*k);}
  ctx.lineTo(s.x2,s.y2);ctx.lineWidth=2;ctx.strokeStyle='#C7CFD5';ctx.stroke();
}
function drawCrusherFront(){
  teeth(jawL,true);
  // moving jaw body (pitman) up to eccentric shaft
  ctx.beginPath();ctx.moveTo(jawR.x1,jawR.y1);ctx.lineTo(806+Math.cos(crPhase)*4,238+Math.sin(crPhase)*4);ctx.lineTo(jawR.x1+26,jawR.y1+40);ctx.lineTo(jawR.x2+14,jawR.y2);ctx.lineTo(jawR.x2,jawR.y2);ctx.closePath();
  fillStroke('#7B8790',INK,2.5);
  teeth(jawR,false);
  // toggle plate + spring
  line(jawR.x2+10,436,822,444,7,'#3C454D');
  // hopper lips
  for(const [x1,y1,x2,y2] of [[598,212,622,250],[816,212,792,250]]){line(x1,y1,x2,y2,12,INK);line(x1,y1,x2,y2,7,YEL);}
  // label
  ctx.fillStyle='#FFF7E0';ctx.font='900 11px "Trebuchet MS",sans-serif';ctx.textAlign='center';ctx.fillText('JAW',624,397);ctx.fillText('CRUSHER',624,412);
  // beacon
  const st=power.state;let bc='#7a6a3a';
  if(st==='warn')bc=(time*6%1)<.5?'#FFB000':'#7a5a10';else if(st==='on')bc=(time*1.5%1)<.6?'#FFC21A':'#B88A10';else if(st==='tripped')bc=(time*5%1)<.5?'#FF3B2F':'#701810';
  ctx.fillStyle='#3E474F';ctx.fillRect(602,190,16,10);
  ctx.beginPath();ctx.arc(610,190,9,Math.PI,0);fillStroke(bc,INK,2);
  if(st==='warn'||st==='tripped'){ctx.fillStyle=st==='warn'?'rgba(255,190,0,.25)':'rgba(255,60,40,.25)';ctx.beginPath();ctx.arc(610,186,26,0,TAU);ctx.fill();}
}
function drawConveyor(){
  const {x1,y1,x2,y2}=belt,ux=BU.x,uy=BU.y,nx=-uy,ny=ux; // n points down-right(ish)
  const yAt=x=>y1+(x-x1)/(x2-x1)*(y2-y1);
  for(const lx of [692,846]){line(lx-14,yAt(lx)+12,lx-24,GY,6,'#4A5560');line(lx+14,yAt(lx)+12,lx+24,GY,6,'#4A5560');}
  ctx.beginPath();ctx.moveTo(x1,y1+3);ctx.lineTo(x2,y2+3);ctx.lineTo(x2+nx*14,y2+ny*14+3);ctx.lineTo(x1+nx*14,y1+ny*14+3);ctx.closePath();fillStroke(YEL,INK,2.5);
  line(x1,y1,x2,y2,6,'#222');
  const off=beltOff%20;ctx.strokeStyle='#555';ctx.lineWidth=2;
  for(let d=off;d<BL;d+=20){const px=x1+ux*d,py=y1+uy*d;ctx.beginPath();ctx.moveTo(px,py-2);ctx.lineTo(px+nx*3,py+ny*3+1);ctx.stroke();}
  for(const [cx,cy] of [[x1,y1+7],[x2,y2+7]]){ctx.beginPath();ctx.arc(cx,cy,8,0,TAU);fillStroke('#8C97A1',INK,2);
    const a=beltOff/8;line(cx,cy,cx+Math.cos(a)*7,cy+Math.sin(a)*7,2,INK);}
}
function drawMill(){
  ctx.beginPath();ctx.moveTo(920,538);ctx.lineTo(1000,538);ctx.lineTo(1012,GY);ctx.lineTo(908,GY);ctx.closePath();fillStroke('#4A5560',INK,2.5);
  rr(1000,404,84,22,6);fillStroke('#FFF7E0',INK,2.5);ctx.fillStyle=INK;ctx.font='900 12px "Trebuchet MS",sans-serif';ctx.textAlign='center';ctx.fillText('BALL MILL',1042,420);line(1020,426,1008,446,3,INK);
  // girth gear
  ctx.save();ctx.translate(M.x,M.y);ctx.rotate(millRot);ctx.fillStyle='#3C454D';
  for(let i=0;i<40;i++){ctx.rotate(TAU/40);ctx.fillRect(M.R+1,-2.5,6,5);}ctx.restore();
  const g=ctx.createRadialGradient(M.x-20,M.y-25,10,M.x,M.y,M.R);g.addColorStop(0,'#B9C3CB');g.addColorStop(1,'#6E7A84');
  ctx.beginPath();ctx.arc(M.x,M.y,M.R,0,TAU);fillStroke(g,INK,3);
  const Rw=M.R-9;ctx.beginPath();ctx.arc(M.x,M.y,Rw,0,TAU);ctx.fillStyle='#2E343A';ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(M.x,M.y,Rw,0,TAU);ctx.clip();
  for(let i=0;i<8;i++){const a=millRot+i*TAU/8;ctx.save();ctx.translate(M.x+Math.cos(a)*(Rw-3),M.y+Math.sin(a)*(Rw-3));ctx.rotate(a);ctx.fillStyle='#59636B';ctx.fillRect(-5,-3,8,6);ctx.restore();}
  // gravel chunks in the drum
  const nchunks=Math.min(12,Math.ceil(mill.load/2.5));
  for(let i=0;i<nchunks;i++){const a=Math.PI/2+.4+(i%6)*.16+Math.sin(time*6+i)*.05*sp,rad=Rw-8-Math.floor(i/6)*9;
    ctx.fillStyle=mill.colors[i%Math.max(1,mill.colors.length)]||'#ccc';ctx.beginPath();ctx.arc(M.x+Math.cos(a)*rad,M.y+Math.sin(a)*rad,4,0,TAU);ctx.fill();}
  // steel balls
  const N=10,mix=Math.min(1,sp*2),br=6;
  for(let i=0;i<N;i++){
    const ra=Math.PI/2+(i-N/2+.5)*.2,rest={x:M.x+Math.cos(ra)*(Rw-br-(i%2)*10),y:M.y+Math.sin(ra)*(Rw-br-(i%2)*10)};
    const p=(ballPhase+i/N)%1;let mv;
    if(p<.62){const a=Math.PI/2+(p/.62)*1.75;mv={x:M.x+Math.cos(a)*(Rw-br),y:M.y+Math.sin(a)*(Rw-br)};}
    else{const q=(p-.62)/.38,aA=Math.PI/2+1.75,aB=Math.PI/2-.3,Ax=M.x+Math.cos(aA)*(Rw-br),Ay=M.y+Math.sin(aA)*(Rw-br),Bx=M.x+Math.cos(aB)*(Rw-br),By=M.y+Math.sin(aB)*(Rw-br);
      mv={x:Ax+(Bx-Ax)*q,y:Ay+(By-Ay)*q*q};}
    const x=rest.x+(mv.x-rest.x)*mix,y=rest.y+(mv.y-rest.y)*mix;
    const bg=ctx.createRadialGradient(x-2,y-2,1,x,y,br);bg.addColorStop(0,'#F2F5F7');bg.addColorStop(1,'#7D8890');
    ctx.beginPath();ctx.arc(x,y,br,0,TAU);ctx.fillStyle=bg;ctx.fill();
  }
  if(mill.load>0&&sp>.3){ctx.fillStyle='rgba(235,225,200,.18)';ctx.fillRect(M.x-Rw,M.y-Rw,Rw*2,Rw*2);}
  ctx.restore();
  ctx.beginPath();ctx.arc(M.x,M.y,Rw,0,TAU);ctx.lineWidth=3;ctx.strokeStyle='#4B565F';ctx.stroke();
  // spout
  ctx.beginPath();ctx.moveTo(1012,494);ctx.quadraticCurveTo(1042,494,1046,514);ctx.lineTo(1034,516);ctx.quadraticCurveTo(1030,506,1010,508);ctx.closePath();fillStroke('#8C97A1',INK,2.5);
  // feed funnel + grate
  ctx.beginPath();ctx.moveTo(874,421);ctx.lineTo(952,421);ctx.lineTo(934,462);ctx.lineTo(902,462);ctx.closePath();fillStroke('rgba(140,151,161,.92)',INK,2.5);
  ctx.fillStyle='rgba(30,35,40,.6)';ctx.fillRect(904,440,28,20);
  for(let x=880;x<952;x+=9)line(x,417,x,425,2.5,'#3C454D');line(874,421,952,421,3,'#3C454D');
}
function drawBin(){
  const h=GY-BIN.top,lvl=binShow*h,top=GY-lvl;
  if(lvl>1){ctx.beginPath();ctx.moveTo(BIN.x1,GY);ctx.lineTo(BIN.x1,top+4);ctx.quadraticCurveTo((BIN.x1+BIN.x2)/2,top-10,BIN.x2,top+4);ctx.lineTo(BIN.x2,GY);ctx.closePath();ctx.fillStyle='#E6D8BC';ctx.fill();}
  ctx.beginPath();ctx.moveTo(BIN.x1-3,BIN.top);ctx.lineTo(BIN.x1,GY);ctx.lineTo(BIN.x2,GY);ctx.lineTo(BIN.x2+3,BIN.top);ctx.lineWidth=5;ctx.strokeStyle=INK;ctx.stroke();ctx.lineWidth=2.5;ctx.strokeStyle=YEL;ctx.stroke();
  ctx.fillStyle='rgba(42,33,24,.75)';ctx.font='900 11px "Trebuchet MS",sans-serif';ctx.textAlign='center';ctx.fillText('DUST',(BIN.x1+BIN.x2)/2,GY-6);
}
function drawExcavatorBody(){
  rr(370,532,120,28,14);fillStroke('#2E2E2E',INK,2.5);
  for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(386+i*22,546,6,0,TAU);ctx.fillStyle='#6B6B6B';ctx.fill();}
  rr(386,476,88,58,8);fillStroke(YEL,INK,3);
  ctx.save();rr(386,520,88,14,0);ctx.clip();for(let i=0;i<10;i++){ctx.fillStyle=i%2?YEL:INK;ctx.beginPath();ctx.moveTo(380+i*12,534);ctx.lineTo(392+i*12,520);ctx.lineTo(398+i*12,520);ctx.lineTo(386+i*12,534);ctx.fill();}ctx.restore();
  rr(394,484,36,30,5);fillStroke('#9ED8F5',INK,2);
  ctx.beginPath();ctx.arc(411,506,6.5,0,TAU);ctx.fillStyle='#E7B089';ctx.fill();
  ctx.beginPath();ctx.arc(411,502,7.5,Math.PI,0);ctx.fillStyle='#FF8A3D';ctx.fill();ctx.fillRect(402,501,18,2.5);
  ctx.beginPath();ctx.moveTo(418,477);ctx.lineTo(444,477);ctx.lineTo(S.x+6,S.y);ctx.lineTo(S.x-6,S.y);ctx.closePath();fillStroke('#E0A800',INK,2.5);
}
function cylinder(x1,y1,x2,y2){
  const mx=x1+(x2-x1)*.55,my=y1+(y2-y1)*.55;
  line(x1,y1,mx,my,9,INK);line(x1,y1,mx,my,6,'#59636B');line(mx,my,x2,y2,4,'#D9DEE2');
}
function drawArm(){
  const E=arm.E,T=arm.tip;
  const bp={x:S.x+(E.x-S.x)*.5,y:S.y+(E.y-S.y)*.5};
  cylinder(460,494,bp.x,bp.y);
  line(S.x,S.y,E.x,E.y,24,INK);line(S.x,S.y,E.x,E.y,18,YEL);
  const ux=(E.x-S.x)/L1,uy=(E.y-S.y)/L1,sa={x:S.x+ux*L1*.72-uy*14,y:S.y+uy*L1*.72+ux*14};
  const sx=(T.x-E.x)/L2,sy=(T.y-E.y)/L2,sb={x:E.x+sx*28,y:E.y+sy*28};
  cylinder(sa.x,sa.y,sb.x,sb.y);
  line(E.x,E.y,T.x,T.y,17,INK);line(E.x,E.y,T.x,T.y,11,YEL);
  for(const p of [S,E,T]){ctx.beginPath();ctx.arc(p.x,p.y,6,0,TAU);fillStroke('#59636B',INK,2);}
  if(arm.held)drawRock(arm.held);
  // claw
  const hy=T.y+9;line(T.x,T.y,T.x,hy,5,'#3C454D');
  ctx.beginPath();ctx.arc(T.x,hy,5.5,0,TAU);fillStroke('#59636B',INK,2);
  const ang=.1+arm.open*.72;
  for(const side of [-1,1]){
    const a=Math.PI/2-side*ang,ex=T.x+Math.cos(a)*25,ey=hy+Math.sin(a)*25;
    const cx=T.x+Math.cos(a-side*.5)*16,cy=hy+Math.sin(a-side*.5)*16;
    ctx.beginPath();ctx.moveTo(T.x,hy);ctx.quadraticCurveTo(cx,cy,ex,ey);ctx.lineTo(ex-side*8,ey+3);
    ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle=INK;ctx.stroke();ctx.lineWidth=5;ctx.strokeStyle='#59636B';ctx.stroke();ctx.lineCap='butt';
  }
}
function drawTruck(){
  const t=truck;if(t.state==='idle')return;
  ctx.save();ctx.translate(t.x,0);
  rr(4,516,226,14,4);fillStroke('#3A3A3A',INK,2);
  if(t.bed>0)line(140,522,150-t.bed*20,500-t.bed*40,6,'#C7CFD5');
  ctx.save();ctx.translate(228,516);ctx.rotate(t.bed*.55);
  if(t.load>0&&t.state!=='dump'){const cs=['#C9C4B6','#D9A86C','#B58E8C'];for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(-135+i*28,-54+Math.sin(i*2)*3,14,0,TAU);ctx.fillStyle=cs[i%3];ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=INK;ctx.stroke();}}
  ctx.beginPath();ctx.moveTo(-152,-56);ctx.lineTo(0,-56);ctx.lineTo(-6,0);ctx.lineTo(-146,0);ctx.closePath();fillStroke('#E8622C',INK,3);
  for(let i=1;i<5;i++)line(-152+i*30,-52,-150+i*30,-4,3,'#C24E1E');
  ctx.restore();
  rr(6,462,72,58,9);fillStroke(YEL,INK,3);
  rr(14,470,36,24,5);fillStroke('#9ED8F5',INK,2);
  ctx.beginPath();ctx.arc(36,486,6,0,TAU);ctx.fillStyle='#E7B089';ctx.fill();ctx.beginPath();ctx.arc(36,483,7,Math.PI,0);ctx.fillStyle='#FF8A3D';ctx.fill();
  ctx.fillStyle='#FFF2A8';ctx.fillRect(4,500,6,8);
  line(66,462,66,446,4,'#555');
  if(t.state==='in'&&(time*4%1)<.5){ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.arc(229,506,5,0,TAU);ctx.fill();}
  for(const wx of [44,130,196]){ctx.save();ctx.translate(wx,540);ctx.beginPath();ctx.arc(0,0,20,0,TAU);fillStroke('#222',INK,2);
    ctx.beginPath();ctx.arc(0,0,9,0,TAU);ctx.fillStyle='#BBB';ctx.fill();ctx.rotate(t.wheel);ctx.fillStyle='#555';for(let i=0;i<4;i++){ctx.rotate(TAU/4);ctx.fillRect(4,-1.5,4,3);}ctx.restore();}
  ctx.restore();
}
function drawParts(){
  for(const p of parts){const k=1-p.life/p.max;
    if(p.k==='dust'){ctx.globalAlpha=k*.55;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.s,0,TAU);ctx.fill();}
    else if(p.k==='fall'){ctx.globalAlpha=.9;ctx.fillStyle=p.col;ctx.fillRect(p.x,p.y,p.s,p.s);}
    else if(p.k==='conf'){ctx.globalAlpha=Math.min(1,k*3);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.fillStyle=p.col;ctx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);ctx.restore();}
  }
  ctx.globalAlpha=1;
  for(const g of gems){const s=12+Math.sin(g.t*10)*1.5;
    ctx.save();ctx.translate(g.x,g.y);ctx.fillStyle='rgba(255,255,255,.4)';ctx.beginPath();ctx.arc(0,0,s*1.8,0,TAU);ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.8,-s*.25);ctx.lineTo(0,s);ctx.lineTo(-s*.8,-s*.25);ctx.closePath();fillStroke(g.col,INK,2.5);
    ctx.fillStyle='rgba(255,255,255,.7)';ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.3,-s*.25);ctx.lineTo(0,s*.2);ctx.lineTo(-s*.3,-s*.25);ctx.fill();ctx.restore();}
}
function drawGuides(){
  const g=grabbable();
  if(g&&!arm.held){ctx.beginPath();ctx.arc(g.x,g.y,g.r+6+Math.sin(time*8)*2,0,TAU);ctx.setLineDash([6,5]);ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.9)';ctx.stroke();ctx.setLineDash([]);}
  if(mode==='touch'&&dragging){ctx.beginPath();ctx.arc(arm.tgt.x,arm.tgt.y,14,0,TAU);ctx.lineWidth=2.5;ctx.strokeStyle='rgba(42,33,24,.45)';ctx.stroke();
    line(arm.tgt.x-20,arm.tgt.y,arm.tgt.x-8,arm.tgt.y,2.5,'rgba(42,33,24,.45)');line(arm.tgt.x+8,arm.tgt.y,arm.tgt.x+20,arm.tgt.y,2.5,'rgba(42,33,24,.45)');}
}
function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cw,ch);
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*offX,dpr*offY);
  drawBackground();drawCrusherBack();drawConveyor();drawMill();drawBin();
  for(const r of rocks)if(!r.held)drawRock(r);
  drawCrusherFront();drawExcavatorBody();drawTruck();drawGuides();drawArm();drawParts();
}

/* ================= loop ================= */
let last=performance.now();
function frame(now){
  const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
  try{update(dt);draw();}catch(err){console.error(err);}
  // Test hook used by tests/smoke_test.py (harmless in production)
window.__cs={get rocks(){return rocks},arm,power,mill,truck,pressGrab,pressPower,get jobDust(){return jobDust}};
requestAnimationFrame(frame);
}
updateHUD();updatePowerBtn();
if(!seenIntro)showIntro();
// Test hook used by tests/smoke_test.py (harmless in production)
window.__cs={get rocks(){return rocks},arm,power,mill,truck,pressGrab,pressPower,get jobDust(){return jobDust}};
requestAnimationFrame(frame);
}
