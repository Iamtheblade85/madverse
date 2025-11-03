(()=>{"use strict";
/* GoblinCrash — Cinematic Realism FX (Canvas 2D, sprite + timeline)
   - Timeline di micro-eventi schedulati nel tempo per ogni impatto
   - Sprites offscreen HQ: glow, sparks streak, smoke granular, debris, dust puff, scorch+cracks
   - Effetti extra: embers, post-shock dust, aftershock ring, heat-haze fake refraction,
     vignetta breve, lens dirt, ground shadow, chromatic tint micro, crack propagation
*/

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const rint=(a,b)=>Math.floor(rand(a,b+1));
const easeOut=(t)=>1-Math.pow(1-t,3);
const now = ()=>performance.now();

/* ---------- SPRITE FACTORY (offscreen) ---------- */
function makeCanvas(w,h){const c=document.createElement('canvas'); c.width=w; c.height=h; return c;}
function mkGlow(size=96){
  const c=makeCanvas(size,size), g=c.getContext('2d'), r=size/2;
  let grad=g.createRadialGradient(r,r,0,r,r,r);
  grad.addColorStop(0,'rgba(255,244,210,0.98)');
  grad.addColorStop(0.22,'rgba(255,208,140,0.9)');
  grad.addColorStop(0.55,'rgba(255,145,40,0.6)');
  grad.addColorStop(1,'rgba(255,145,40,0)');
  g.fillStyle=grad; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill();
  return c;
}
function mkSpark(w=120,h=10){
  const c=makeCanvas(w,h), g=c.getContext('2d');
  g.filter='blur(0.6px)';
  const grad=g.createLinearGradient(0,h/2,w,h/2);
  grad.addColorStop(0,'rgba(255,190,80,0)');
  grad.addColorStop(0.15,'rgba(255,230,150,0.95)');
  grad.addColorStop(0.65,'rgba(255,140,28,0.75)');
  grad.addColorStop(1,'rgba(255,90,0,0)');
  g.fillStyle=grad; g.fillRect(0,0,w,h);
  // nucleo caldo
  g.globalCompositeOperation='lighter';
  g.fillStyle='rgba(255,250,210,0.6)'; g.fillRect(w*0.25,2,w*0.08,h-4);
  g.globalCompositeOperation='source-over';
  return c;
}
function mkSmoke(size=140){
  const c=makeCanvas(size,size), g=c.getContext('2d'), r=size/2;
  // base soft
  let grad=g.createRadialGradient(r,r,0,r,r,r);
  grad.addColorStop(0,'rgba(125,118,110,0.45)');
  grad.addColorStop(0.6,'rgba(95,90,84,0.25)');
  grad.addColorStop(1,'rgba(95,90,84,0)');
  g.fillStyle=grad; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill();
  // grana/dither
  const n=makeCanvas(size,size), ng=n.getContext('2d');
  const img=ng.createImageData(size,size);
  for(let i=0;i<img.data.length;i+=4){
    const a = Math.random()<0.5 ? 22 : 0;
    img.data[i]=110; img.data[i+1]=106; img.data[i+2]=100; img.data[i+3]=a;
  }
  ng.putImageData(img,0,0);
  g.globalCompositeOperation='overlay'; g.drawImage(n,0,0);
  g.globalCompositeOperation='source-over';
  return c;
}
function mkDust(size=80){
  const c=makeCanvas(size,size), g=c.getContext('2d'), r=size/2;
  g.fillStyle='rgba(80,70,58,0.55)'; g.filter='blur(0.4px)';
  for(let i=0;i<40;i++){
    const a=Math.random()*Math.PI*2, rr=rand(6,r*0.9), s=rand(1.2,2.8);
    g.beginPath(); g.arc(r+Math.cos(a)*rr, r+Math.sin(a)*rr, s, 0, Math.PI*2); g.fill();
  }
  g.filter='none';
  return c;
}
function mkDebris(size=18){
  const c=makeCanvas(size,size), g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,size,size);
  grad.addColorStop(0,'#4a3e2f'); grad.addColorStop(0.4,'#7c6a52'); grad.addColorStop(1,'#c2a77d');
  g.fillStyle=grad;
  const r=size/2, cx=r, cy=r, pts=rint(5,7);
  g.beginPath();
  for(let i=0;i<pts;i++){
    const a=i/pts*Math.PI*2 + rand(-0.2,0.2);
    const rr = r*rand(0.55,0.95);
    const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr;
    if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
  }
  g.closePath(); g.fill();
  // occlusione + specular
  g.globalCompositeOperation='multiply';
  g.fillStyle='rgba(30,20,10,0.25)';
  g.beginPath(); g.ellipse(cx,cy,r*0.9,r*0.6,Math.PI/5,0,Math.PI*2); g.fill();
  g.globalCompositeOperation='lighter';
  g.fillStyle='rgba(255,240,190,0.09)';
  g.beginPath(); g.moveTo(cx-r*0.2,cy-r*0.1); g.lineTo(cx+r*0.6,cy+r*0.1); g.lineTo(cx+r*0.2,cy+r*0.4); g.closePath(); g.fill();
  g.globalCompositeOperation='source-over';
  return c;
}
function mkScorch(size=230){
  const c=makeCanvas(size,size), g=c.getContext('2d'), r=size/2;
  // alone
  let grad=g.createRadialGradient(r,r,0,r,r,r);
  grad.addColorStop(0,'rgba(20,12,8,0.7)');
  grad.addColorStop(0.55,'rgba(20,12,8,0.35)');
  grad.addColorStop(1,'rgba(20,12,8,0)');
  g.fillStyle=grad; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill();
  // crack map tenue
  g.strokeStyle='rgba(58,48,44,0.75)'; g.lineWidth=1; g.lineCap='round';
  for(let k=0;k<6;k++){
    let a=rand(0,Math.PI*2), len=rand(r*0.5,r*1.2);
    g.beginPath();
    g.moveTo(r+Math.cos(a)*rand(0,r*0.18), r+Math.sin(a)*rand(0,r*0.18));
    for(let t=0;t<1;t+=0.16){
      const aa=a+rand(-0.22,0.22); const rr=t*len;
      g.lineTo(r+Math.cos(aa)*rr, r+Math.sin(aa)*rr);
    }
    g.stroke();
  }
  return c;
}
/* Heat haze strip: sottile gradiente semitrasparente (fake refraction) */
function mkHaze(w=140,h=70){
  const c=makeCanvas(w,h), g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,0,h);
  grad.addColorStop(0,'rgba(255,255,255,0)');
  grad.addColorStop(0.5,'rgba(255,255,255,0.16)');
  grad.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=grad; g.fillRect(0,0,w,h);
  return c;
}
/* Lens dirt: puntinatura leggera applicata additivamente */
function mkLensDirt(size=256){
  const c=makeCanvas(size,size), g=c.getContext('2d');
  const img=g.createImageData(size,size);
  for(let i=0;i<img.data.length;i+=4){
    const p=Math.random(); let a=0;
    if(p>0.995) a=18; else if(p>0.98) a=8; // pochi puntini
    img.data[i]=255; img.data[i+1]=245; img.data[i+2]=220; img.data[i+3]=a;
  }
  g.putImageData(img,0,0);
  g.filter='blur(0.6px)'; g.drawImage(c,0,0); g.filter='none';
  return c;
}

const SPR = {
  ready:false,
  glow:null, spark:null, smoke:null, dust:null, debris:null, scorch:null, haze:null, lens:null,
  ensure(){
    if(this.ready) return;
    this.glow  = mkGlow(110);
    this.spark = mkSpark(130,12);
    this.smoke = mkSmoke(150);
    this.dust  = mkDust(100);
    this.debris= mkDebris(18);
    this.scorch= mkScorch(240);
    this.haze  = mkHaze(160,80);
    this.lens  = mkLensDirt(256);
    this.ready = true;
  }
};

/* ---------- ENGINE ---------- */
const Crash = {
  Cave:null, events:[], decals:[], grid:new Map(),
  now,

  // fisica collisione
  MIN_DIST:3, RESOLVE_PUSH:0.95, PAUSE_MS:[220,420], LIFETIME_MS:20000,

  // sparks
  SPARKS:36, SPARK_SPEED:[1.0,2.4], SPARK_FADE_MS:1200,

  // dust
  DUST:26, DUST_GRAV:0.00055, DUST_DRAG:0.982, DUST_FADE_MS:2600,

  // smoke
  PUFFS:10, PUFF_FADE_MS:2600,

  // debris
  DEBRIS:16, DEBRIS_FADE_MS:2600, DEBRIS_DRAG:0.984, DEBRIS_GRAV:0.0014, DEBRIS_BOUNCE:0.34,

  // embers
  EMBERS:18, EMBERS_FADE_MS:3000, EMBERS_UP:[0.36,0.8], EMBERS_WOBBLE:[0.9,2.2],

  // heat haze
  HAZE_STRIPS:5,

  // camera
  SHOCK_MS:1000, FLASH_MS:120, FLASH_ALPHA:0.24,
  SHAKE_MAX:2.6, SHAKE_MS:260,
  ZOOM_MAX:0.035, ZOOM_MS:170,
  VIGNETTE_MS:180, VIGNETTE_ALPHA:0.18,

  // decals
  DECAL_MAX:140, DECAL_FADE_MS:34000,

  // timeline micro-events (ms)
  // vengono schedulati per ogni impatto
  schedule(ev){
    const t=ev.at;
    ev.timeline = [
      {t: t+90,  fn:()=> this._burstSparks(ev, 0.35) }, // picco immediato
      {t: t+180, fn:()=> this._puffDust(ev, 0.6)    }, // polvere secondaria
      {t: t+320, fn:()=> this._afterShock(ev)       }, // anello secondario
      {t: t+480, fn:()=> this._igniteEmbers(ev, 0.5)}, // brace si riaccende
      {t: t+700, fn:()=> this._propagateCracks(ev)  }, // crepe che “crescono”
      {t: t+1100,fn:()=> this._riseSmoke(ev, 0.7)   }, // colonna fumo lenta
      {t: t+1600,fn:()=> this._lensGlint(ev)        }, // alone di lente
      {t: t+2200,fn:()=> this._hazeKick(ev)         }, // distorsione termica
    ];
    ev.ti=0;
  },

  // hook audio opzionale
  onImpact:null,
  onAftershock:null,

  init(CaveRef){ this.Cave=CaveRef; },

  _cell(){return Math.min(this.Cave.cellX,this.Cave.cellY)||10},
  _key(x,y){return (x|0)+":"+(y|0)},

  _buildGrid(){
    this.grid.clear();
    for(const g of this.Cave.goblins){
      const k=this._key(g.x,g.y);
      let a=this.grid.get(k); if(!a){a=[];this.grid.set(k,a)} a.push(g);
    }
  },

  _pairId(a,b){
    const ax=`${a.wax_account||""}:${a.x.toFixed(2)},${a.y.toFixed(2)}`;
    const bx=`${b.wax_account||""}:${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    return ax<=bx ? `${ax}|${bx}` : `${bx}|${ax}`;
  },

  _resolve(a,b){
    const dx=b.x-a.x, dy=b.y-a.y;
    let d=Math.hypot(dx,dy)||0.0001;
    if(d>=this.MIN_DIST) return 0;
    const overlap=this.MIN_DIST-d, nx=dx/d, ny=dy/d, push=overlap*this.RESOLVE_PUSH;
    a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
    const t=now();
    const p1=this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]);
    const p2=this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]);
    a.pauseTil=Math.max(a.pauseTil||0,t+p1); b.pauseTil=Math.max(b.pauseTil||0,t+p2);
    a.digging=false; b.digging=false;
    return overlap;
  },

  _spawn(ev){
    const f=ev.f;
    // sparks base
    ev.sparks=[];
    const spn=Math.round(this.SPARKS*(0.5+0.9*f));
    for(let i=0;i<spn;i++){
      const ang=Math.random()*Math.PI*2;
      const sp=this.SPARK_SPEED[0]+Math.random()*(this.SPARK_SPEED[1]-this.SPARK_SPEED[0]);
      ev.sparks.push({ang, sp, dist:0, life:this.SPARK_FADE_MS*(0.9+0.5*Math.random()), len:rand(50,130)});
    }
    // dust
    ev.dust=[];
    const dn=Math.round(this.DUST*(0.6+0.7*f));
    for(let i=0;i<dn;i++){
      const a=(Math.random()*Math.PI - Math.PI/2);
      const v=0.5+Math.random()*1.25;
      ev.dust.push({x:0,y:0, vx:Math.cos(a)*v, vy:-Math.abs(Math.sin(a))*v, life:this.DUST_FADE_MS*(0.9+0.7*Math.random())});
    }
    // smoke puffs brevi
    ev.puffs=[];
    const pn=Math.max(4,Math.round(this.PUFFS*(0.5+0.8*f)));
    for(let i=0;i<pn;i++){
      const r0=rand(12,26);
      ev.puffs.push({r:r0, grow:rand(0.08,0.18), life:this.PUFF_FADE_MS*(0.9+0.7*Math.random()), tint:rand(0.0,1.0)});
    }
    // debris
    ev.debris=[];
    const dbn=Math.round(this.DEBRIS*(0.6+0.9*f));
    for(let i=0;i<dbn;i++){
      const ang=Math.random()*Math.PI*2;
      const spd = rand(0.6,2.6)*(0.6+f);
      ev.debris.push({
        x:0,y:0, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd*0.55 - rand(0.35,0.95),
        a:rand(0,Math.PI*2), va:rand(-0.28,0.28),
        s:rand(0.7,1.35), life:this.DEBRIS_FADE_MS*(0.85+0.6*Math.random()), grounded:false
      });
    }
    // embers iniziali
    ev.embers=[];
    const emn=Math.round(this.EMBERS*(0.5+0.9*f));
    for(let i=0;i<emn;i++){
      ev.embers.push({
        x:0,y:0, up:rand(this.EMBERS_UP[0],this.EMBERS_UP[1])*(0.7+f*0.6),
        wob:rand(this.EMBERS_WOBBLE[0],this.EMBERS_WOBBLE[1]),
        phase:Math.random()*Math.PI*2,
        life:this.EMBERS_FADE_MS*(0.8+0.7*Math.random()),
        scale:rand(0.6,1.2)
      });
    }
    // haze strips
    ev.haze=[];
    for(let i=0;i<this.HAZE_STRIPS;i++){
      ev.haze.push({x:rand(-12,12), y:rand(-10,2), w:rand(120,180), h:rand(46,82), life:1200+rand(0,800), phase:Math.random()*Math.PI*2});
    }
    // lens glint
    ev.lensAt = 0;

    // timeline
    this.schedule(ev);
  },

  _spawnDecal(ev, cx, cy, cell){
    this.decals.push({
      x:cx, y:cy, at:now(), f:ev.f,
      r: lerp(cell*1.2, cell*2.5, ev.f),
      life:this.DECAL_FADE_MS,
      growth: rand(0.08,0.16), // per propagazione crepe
      cracks: 0                 // avanzamento (0..1)
    });
    if(this.decals.length>this.DECAL_MAX) this.decals.shift();
  },

  _ensureEvent(a,b,overlap){
    const id=this._pairId(a,b);
    let ev=this.events.find(e=>e.id===id);
    const t=now();
    const f=clamp(overlap/this.MIN_DIST,0.3,1);
    if(!ev){
      ev={ id, at:t, until:t+this.LIFETIME_MS, a,b, f,
           flash:{t}, shock:{t}, shake:{t}, zoom:{t},
           sparks:[], dust:[], puffs:[], debris:[], embers:[], haze:[], timeline:[], ti:0, lensAt:0 };
      this._spawn(ev);
      // decal
      const cell=this._cell(), offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
      const ax=offX+a.x*(this.Cave.cellX||cell), ay=offY+a.y*(this.Cave.cellY||cell);
      const bx=offX+b.x*(this.Cave.cellX||cell), by=offY+b.y*(this.Cave.cellY||cell);
      const cx=(ax+bx)/2, cy=(ay+by)/2;
      this._spawnDecal(ev,cx,cy,cell);
      try{ if(typeof this.onImpact==='function') this.onImpact({strength:f}); }catch(_){}
      this.events.push(ev);
    }else{
      ev.until=t+this.LIFETIME_MS;
      ev.f=Math.max(ev.f,f);
    }
    return ev;
  },

  /* ---------- Timeline callbacks ---------- */
  _burstSparks(ev, mult=1){
    // scarica altri streak brevi
    const extra = Math.round(10*mult*(0.6+ev.f));
    for(let i=0;i<extra;i++){
      const ang=Math.random()*Math.PI*2;
      const sp=this.SPARK_SPEED[0]+Math.random()*(this.SPARK_SPEED[1]-this.SPARK_SPEED[0]);
      ev.sparks.push({ang, sp, dist:0, life:800*(0.8+Math.random()*0.6), len:rand(40,100)});
    }
  },
  _puffDust(ev, mult=1){
    const dn=Math.round(12*mult*(0.6+ev.f));
    for(let i=0;i<dn;i++){
      const a=(Math.random()*Math.PI - Math.PI/2);
      const v=0.45+Math.random()*1.1;
      ev.dust.push({x:0,y:0, vx:Math.cos(a)*v, vy:-Math.abs(Math.sin(a))*v, life:2200*(0.9+Math.random()*0.8)});
    }
  },
  _afterShock(ev){
    ev.shock = { t: now() };
    try{ if(typeof this.onAftershock==='function') this.onAftershock({strength:ev.f}); }catch(_){}
  },
  _igniteEmbers(ev, mult=1){
    const emn=Math.round(8*mult*(0.6+ev.f));
    for(let i=0;i<emn;i++){
      ev.embers.push({
        x:0,y:0, up:rand(this.EMBERS_UP[0],this.EMBERS_UP[1])*(0.7+ev.f*0.6),
        wob:rand(0.9,2.0), phase:Math.random()*Math.PI*2,
        life:2600*(0.8+0.7*Math.random()), scale:rand(0.5,1.1)
      });
    }
  },
  _propagateCracks(ev){
    // marca l'ultimo decal vicino per far crescere le crepe
    const T=now();
    let nearest=null, dmin=1e9;
    for(const d of this.decals){
      const dt=T-d.at; if(dt>this.DECAL_FADE_MS) continue;
      // pick il più recente
      const dd = Math.abs(dt);
      if(dd<dmin){dmin=dd; nearest=d;}
    }
    if(nearest) nearest.cracks = Math.min(1, nearest.cracks + rand(0.35,0.6));
  },
  _riseSmoke(ev, mult=1){
    const pn=Math.round(6*mult);
    for(let i=0;i<pn;i++){
      ev.puffs.push({r:rand(18,30), grow:rand(0.06,0.12), life:3200*(0.9+Math.random()*0.8), tint:rand(0,1)});
    }
  },
  _lensGlint(ev){ ev.lensAt = now(); },
  _hazeKick(ev){ // rinnova strips
    ev.haze.forEach(h=>{ h.life += 600+rand(0,600); h.phase += Math.PI*rand(0.5,1.5); });
  },

  onAfterMove(){
    if(!this.Cave||!Array.isArray(this.Cave.goblins)||!this.Cave.goblins.length) return;
    SPR.ensure();
    this._buildGrid();
    const checked=new Set();
    const neigh=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [k,arr] of this.grid){
      const [cx,cy]=k.split(':').map(Number);
      for(const [dx,dy] of neigh){
        const nb=this.grid.get((cx+dx)+":"+(cy+dy)); if(!nb) continue;
        for(let i=0;i<arr.length;i++){
          const g=arr[i];
          const jStart=(dx===0&&dy===0)? i+1 : 0;
          for(let j=jStart;j<nb.length;j++){
            const h=nb[j]; if(g===h) continue;
            const pid = g.x<=h.x ? this._pairId(g,h) : this._pairId(h,g);
            if(checked.has(pid)) continue; checked.add(pid);
            const ov = this._resolve(g,h);
            if(ov>0){
              const ev=this._ensureEvent(g,h,ov);
              if(!ev.timeline||!ev.timeline.length) this.schedule(ev);
            }
          }
        }
      }
    }
    const t=now();
    this.events=this.events.filter(e=>t<=e.until);
    this.decals=this.decals.filter(d=>t-d.at<=d.life);
  },

  /* ---------- DRAW ---------- */
  draw(ctx){
    const evs=this.events, T=now();
    if(!evs.length && !this.decals.length) return;
    const offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
    const cellX=this.Cave.cellX||10, cellY=this.Cave.cellY||10;
    const cell=this._cell();

    // ==== CAMERA: shake + zoom (minimi) ====
    let shakeX=0, shakeY=0, zoom=1;
    for(const ev of evs){
      const sdt=T-ev.shake.t;
      if(sdt<this.SHAKE_MS){
        const k=1-sdt/this.SHAKE_MS;
        const amp=this.SHAKE_MAX*(0.4+0.6*ev.f)*k;
        shakeX+=(Math.random()*2-1)*amp;
        shakeY+=(Math.random()*2-1)*amp;
      }
      const zdt=T-ev.zoom.t;
      if(zdt<this.ZOOM_MS){
        const k=easeOut(1 - zdt/this.ZOOM_MS);
        zoom += this.ZOOM_MAX*(0.3+0.7*ev.f)*k;
      }
    }
    if(shakeX||shakeY||zoom!==1){
      ctx.save();
      const cxView=ctx.canvas.width/2, cyView=ctx.canvas.height/2;
      ctx.translate(cxView+shakeX, cyView+shakeY);
      ctx.scale(zoom, zoom); ctx.translate(-cxView, -cyView);
    }

    /* --- DECALS (sotto tutto) + crescita crepe --- */
    for(const d of this.decals){
      const k=clamp(1 - (T-d.at)/d.life,0,1)*(0.5+0.5*d.f);
      // crescita crepe “morbida”
      const add = d.cracks>0 ? clamp(d.cracks,0,1)*0.35 : 0;
      ctx.save();
      ctx.globalAlpha=0.82*k;
      const R = d.r*(1+add*0.35);
      ctx.drawImage(SPR.scorch, d.x-R, d.y-R, R*2, R*2);
      ctx.restore();
    }

    /* --- PER EVENT --- */
    for(const ev of evs){
      // timeline dispatch
      if(ev.timeline && ev.ti < ev.timeline.length){
        while(ev.ti<ev.timeline.length && T>=ev.timeline[ev.ti].t){
          try{ ev.timeline[ev.ti].fn(); }catch(_){}
          ev.ti++;
        }
      }

      const ax=offX+ev.a.x*cellX, ay=offY+ev.a.y*cellY;
      const bx=offX+ev.b.x*cellX, by=offY+ev.b.y*cellY;
      const cx=(ax+bx)/2, cy=(ay+by)/2;

      // FLASH
      const fdt=T-ev.flash.t;
      if(fdt<this.FLASH_MS){
        const a=this.FLASH_ALPHA*(1-fdt/this.FLASH_MS)*ev.f;
        const size=cell*6.2;
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha=a;
        ctx.drawImage(SPR.glow, cx-size/2, cy-size/2, size, size);
        ctx.restore();
      }

      // SHOCKWAVE
      const sdt=T-ev.shock.t;
      if(sdt<this.SHOCK_MS){
        const prog=sdt/this.SHOCK_MS;
        const r=(cell*1.25)+prog*(cell*4.6);
        const a=0.5*(1-prog)*(0.6+0.6*ev.f);
        ctx.save();
        ctx.globalAlpha=a; ctx.strokeStyle='rgba(255,240,210,0.85)';
        ctx.lineWidth=2.6;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }

      // GROUND SHADOW morbida dell'impatto
      ctx.save();
      ctx.globalCompositeOperation='multiply';
      ctx.globalAlpha=0.12*(0.6+0.6*ev.f);
      ctx.filter='blur(3px)';
      ctx.fillStyle='#0b0b0b';
      ctx.beginPath(); ctx.ellipse(cx, cy+2, cell*2.2, cell*1.2, 0, 0, Math.PI*2); ctx.fill();
      ctx.filter='none'; ctx.restore();

      // SPARKS (additive streak)
      for(const sp of ev.sparks){
        const alive=Math.max(0, sp.life-(T-ev.at)); if(!alive) continue;
        sp.dist += sp.sp * (cell*0.18);
        const px = cx + Math.cos(sp.ang)*sp.dist;
        const py = cy + Math.sin(sp.ang)*sp.dist;
        const tFade=alive/sp.life;
        const L = sp.len * (0.4 + 0.6*tFade);
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha = 0.86 * tFade;
        ctx.translate(px,py); ctx.rotate(sp.ang);
        ctx.drawImage(SPR.spark, -L*0.9, -6, L, 12);
        ctx.restore();
      }

      // DUST particellare + sprite “puff”
      for(const d of ev.dust){
        const alive=Math.max(0, d.life-(T-ev.at)); if(!alive) continue;
        d.vx*=this.DUST_DRAG; d.vy=d.vy*this.DUST_DRAG + this.DUST_GRAV*(cell);
        d.x+=d.vx; d.y+=d.vy;
        const a = clamp(alive/this.DUST_FADE_MS,0,1)*(0.55)*(0.5+0.6*ev.f);
        const px = cx + d.x*0.9, py= cy + d.y*0.9;
        ctx.save();
        ctx.globalCompositeOperation='multiply';
        ctx.globalAlpha=a;
        ctx.drawImage(SPR.dust, px-40, py-40, 80, 80);
        ctx.restore();
      }

      // SMOKE (puffs sprite con tinta calda → grigio)
      for(const p of ev.puffs){
        const alive=Math.max(0, p.life-(T-ev.at)); if(!alive) continue;
        p.r += p.grow*(1+ev.f);
        const k = clamp(alive/this.PUFF_FADE_MS,0,1)*(0.85)*(0.6+0.6*ev.f);
        const size = p.r*2.6;
        ctx.save();
        ctx.filter='blur(0.5px)';
        ctx.globalAlpha = 0.26*k;
        ctx.drawImage(SPR.smoke, cx-size/2, cy-size/2, size, size);
        // tinta calda vicino all'impatto
        const warm = clamp(1-p.tint,0,1);
        ctx.globalCompositeOperation='multiply';
        ctx.globalAlpha = 0.08*warm*k;
        ctx.fillStyle='rgba(120,90,60,1)';
        ctx.beginPath(); ctx.arc(cx,cy,size*0.36,0,Math.PI*2); ctx.fill();
        ctx.filter='none';
        ctx.restore();
      }

      // DEBRIS con rimbalzo “terra”
      const groundY = cy + cell*2.2; // piano virtuale (grezzo, ma efficace)
      for(const d of ev.debris){
        const alive=Math.max(0, d.life-(T-ev.at)); if(!alive) continue;
        if(!d.grounded){
          d.vx*=this.DEBRIS_DRAG; d.vy=d.vy*this.DEBRIS_DRAG + this.DEBRIS_GRAV*(cell);
          d.x+=d.vx; d.y+=d.vy; d.a+=d.va;
          const wy = cy + d.y*cell*0.08;
          if(wy>=groundY){ // collide col suolo virtuale
            d.y -= Math.abs((wy-groundY)/(cell*0.08));
            d.vy = -Math.abs(d.vy)*this.DEBRIS_BOUNCE;
            d.vx *= 0.85; d.va *= 0.7;
            if(Math.abs(d.vy)<0.02) d.grounded=true;
          }
        }else{
          // striscia e si ferma
          d.vx*=0.95; d.va*=0.92; d.x+=d.vx*0.5; d.a+=d.va*0.5;
        }
        const k = clamp(alive/this.DEBRIS_FADE_MS,0,1)*(0.9);
        const sx = SPR.debris.width*d.s, sy=SPR.debris.height*d.s;
        // ombra
        ctx.save();
        const px = cx + d.x*cell*0.08, py = cy + d.y*cell*0.08;
        ctx.globalCompositeOperation='multiply';
        ctx.globalAlpha=0.14*k;
        ctx.filter='blur(1px)';
        ctx.beginPath(); ctx.ellipse(px, py+2, sx*0.45, sy*0.22, 0, 0, Math.PI*2); ctx.fillStyle='#0a0a0a'; ctx.fill();
        ctx.filter='none'; ctx.restore();
        // shard
        ctx.save();
        ctx.translate(px,py); ctx.rotate(d.a);
        ctx.globalAlpha=k*(0.7+0.5*ev.f);
        ctx.drawImage(SPR.debris, -sx/2, -sy/2, sx, sy);
        ctx.restore();
      }

      // EMBERS (glow caldo che sale)
      for(const e of ev.embers){
        const alive=Math.max(0, e.life-(T-ev.at)); if(!alive) continue;
        const dt = (T-ev.at)/1000;
        const wob = Math.sin(e.phase + dt*e.wob)*cell*0.12;
        const px = cx + wob;
        const py = cy - dt*e.up*cell*0.62;
        const a = clamp(alive/this.EMBERS_FADE_MS,0,1)*(0.7)*(0.5+0.6*ev.f);
        const size = 22*e.scale;
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha=a;
        ctx.drawImage(SPR.glow, px-size/2, py-size/2, size, size);
        ctx.restore();
      }

      // HEAT HAZE (falsa rifrazione)
      for(const h of ev.haze){
        const alive = 1 - (T-ev.at)/h.life; if(alive<=0) continue;
        const wob = Math.sin(h.phase + (T-ev.at)*0.006)*6;
        const w = h.w, hh = h.h;
        ctx.save();
        ctx.globalAlpha = 0.12*alive*(0.6+0.6*ev.f);
        ctx.filter='blur(0.6px)';
        ctx.drawImage(SPR.haze, cx-w/2 + h.x, cy-hh/2 + h.y + wob*0.2, w, hh);
        ctx.filter='none'; ctx.restore();
      }

      // LENS GLINT veloce
      if(ev.lensAt && T-ev.lensAt<140){
        const k = 1 - (T-ev.lensAt)/140;
        ctx.save();
        ctx.globalCompositeOperation='lighter';
        ctx.globalAlpha=0.08*k*(0.5+0.5*ev.f);
        const s = cell*7;
        ctx.drawImage(SPR.lens, cx-s/2, cy-s/2, s, s);
        ctx.restore();
      }

      // VIGNETTE istantanea (brevissima)
      const vdt=T-ev.at;
      if(vdt<this.VIGNETTE_MS){
        const k=1-vdt/this.VIGNETTE_MS;
        const a=this.VIGNETTE_ALPHA*k*(0.4+0.6*ev.f);
        ctx.save();
        const w=ctx.canvas.width,h=ctx.canvas.height;
        const grd=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.18,w/2,h/2,Math.max(w,h)*0.9);
        grd.addColorStop(0,'rgba(0,0,0,0)');
        grd.addColorStop(1,`rgba(0,0,0,${a})`);
        ctx.fillStyle=grd; ctx.fillRect(0,0,w,h);
        ctx.restore();
      }
    }

    // ripristino camera
    if(shakeX||shakeY||zoom!==1) ctx.restore();
  }
};

window.GoblinCrash = Crash;
})();
