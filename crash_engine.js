(()=>{"use strict";
/* GoblinCrash — Realistic FX (Adaptive LOD + scaled impacts) */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const now = ()=>performance.now();

/* ---------- SPRITES (1x, leggeri) ---------- */
function C(w,h){const c=document.createElement('canvas'); c.width=w; c.height=h; return c;}
function sprGlow(sz=84){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2; let gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,'rgba(255,240,200,0.95)');
  gr.addColorStop(0.5,'rgba(255,160,50,0.55)');
  gr.addColorStop(1,'rgba(255,160,50,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill(); return c;}
function sprSpark(w=100,h=8){const c=C(w,h), g=c.getContext('2d');
  const gr=g.createLinearGradient(0,h/2,w,h/2);
  gr.addColorStop(0,'rgba(255,210,120,0)');
  gr.addColorStop(0.2,'rgba(255,235,170,0.95)');
  gr.addColorStop(0.7,'rgba(255,120,10,0.65)');
  gr.addColorStop(1,'rgba(255,120,10,0)');
  g.fillStyle=gr; g.fillRect(0,0,w,h); return c;}
function sprSmoke(sz=120){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2;
  let gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,'rgba(115,110,105,0.35)');
  gr.addColorStop(1,'rgba(115,110,105,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill(); return c;}
function sprDust(sz=70){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2;
  g.fillStyle='rgba(90,78,62,0.45)';
  for(let i=0;i<28;i++){const a=Math.random()*Math.PI*2, rr=rand(4,r*0.9), s=rand(1,2.3);
    g.beginPath(); g.arc(r+Math.cos(a)*rr, r+Math.sin(a)*rr, s, 0, Math.PI*2); g.fill();}
  return c;}
function sprDebris(sz=16){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2, cx=r, cy=r, n=5+Math.floor(Math.random()*3);
  g.fillStyle='#998469'; g.beginPath();
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2+rand(-0.15,0.15), rr=r*rand(0.55,0.95);
    const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr; if(i===0) g.moveTo(x,y); else g.lineTo(x,y);}
  g.closePath(); g.fill(); return c;}
function sprScorch(sz=180){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2;
  let gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,'rgba(24,18,14,0.55)');
  gr.addColorStop(1,'rgba(24,18,14,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill(); return c;}

const SPR = {ready:false, glow:null, spark:null, smoke:null, dust:null, debris:null, scorch:null,
  ensure(){ if(this.ready) return;
    this.glow=sprGlow(); this.spark=sprSpark(); this.smoke=sprSmoke();
    this.dust=sprDust(); this.debris=sprDebris(); this.scorch=sprScorch();
    this.ready=true; }
};

/* ---------- ENGINE ---------- */
const Crash = {
  Cave:null, events:[], decals:[], grid:new Map(),

  // baseline fisica
  MIN_DIST:3, RESOLVE_PUSH:0.95, PAUSE_MS:[200,360], LIFETIME_MS:14000,

  // scala impatto (tutto prende dimensione da qui)
  IMPACT_SCALE: 0.65, // rispetto a cell

  // limiti/capping
  MAX_EVENTS: 10,
  MAX_SPARKS: 26,
  MAX_DUST:   22,
  MAX_PUFFS:  8,
  MAX_DEBRIS: 12,
  MAX_EMBERS: 14,

  // fade/drag leggeri
  SPARK_FADE_MS:900,
  DUST_FADE_MS:1800, DUST_GRAV:0.0005, DUST_DRAG:0.985,
  PUFF_FADE_MS:2200,
  DEBRIS_FADE_MS:2000, DEBRIS_DRAG:0.985, DEBRIS_GRAV:0.0013, DEBRIS_BOUNCE:0.32,
  EMBERS_FADE_MS:2400,

  // camera/flash
  SHOCK_MS:720, FLASH_MS:90, FLASH_ALPHA:0.16,
  SHAKE_MAX:2.0, SHAKE_MS:180, ZOOM_MAX:0.02, ZOOM_MS:120,

  // decals
  DECAL_MAX: 90, DECAL_FADE_MS:22000,

  // qualità adattiva
  qLevel:2,   // 2=high, 1=mid, 0=low
  emaDt:16.7, lastDrawT:0,
  hi(){return this.qLevel===2}, mid(){return this.qLevel===1}, low(){return this.qLevel===0},

  // opzionale: hook audio
  onImpact:null, onAftershock:null,

  init(CaveRef){ this.Cave=CaveRef; },

  _cell(){return Math.min(this.Cave.cellX,this.Cave.cellY)||10},
  _key(x,y){return (x|0)+":"+(y|0)},
  _pairId(a,b){const ax=`${a.wax_account||""}:${a.x.toFixed(2)},${a.y.toFixed(2)}`;
                const bx=`${b.wax_account||""}:${b.x.toFixed(2)},${b.y.toFixed(2)}`;
                return ax<=bx?`${ax}|${bx}`:`${bx}|${ax}`;},

  _buildGrid(){ this.grid.clear();
    for(const g of this.Cave.goblins){ const k=this._key(g.x,g.y);
      let a=this.grid.get(k); if(!a){a=[];this.grid.set(k,a)} a.push(g); } },

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
    const f=ev.f, lvl=this.qLevel;
    const mul = lvl===2?1 : lvl===1?0.65 : 0.42;

    // counts con capping
    const nS = Math.min(this.MAX_SPARKS, Math.round(22*(0.5+0.8*f)*mul));
    const nD = Math.min(this.MAX_DUST,   Math.round(16*(0.6+0.7*f)*mul));
    const nP = Math.min(this.MAX_PUFFS,  Math.round(6*(0.5+0.8*f)*mul));
    const nB = Math.min(this.MAX_DEBRIS, Math.round(10*(0.6+0.9*f)*mul));
    const nE = Math.min(this.MAX_EMBERS, Math.round(10*(0.5+0.9*f)*mul));

    ev.sparks = Array.from({length:nS},()=>({
      ang:Math.random()*Math.PI*2, sp: 1.0+Math.random()*1.9,
      dist:0, life:this.SPARK_FADE_MS*(0.85+0.5*Math.random()), len: rand(40,100)
    }));
    ev.dust   = Array.from({length:nD},()=>({
      x:0,y:0, vx:Math.cos(Math.random()*Math.PI - Math.PI/2)*(0.4+Math.random()*1.1),
      vy:-Math.abs(Math.sin(Math.random()*Math.PI - Math.PI/2))*(0.4+Math.random()*1.1),
      life:this.DUST_FADE_MS*(0.9+0.6*Math.random())
    }));
    ev.puffs  = Array.from({length:nP},()=>({
      r: rand(10,20), grow: rand(0.07,0.14), life: this.PUFF_FADE_MS*(0.9+0.6*Math.random())
    }));
    ev.debris = Array.from({length:nB},()=>({
      x:0,y:0, vx:Math.cos(Math.random()*Math.PI*2)*rand(0.5,2.2),
      vy: -rand(0.3,0.9), a:rand(0,Math.PI*2), va:rand(-0.24,0.24),
      s: rand(0.7,1.1), life:this.DEBRIS_FADE_MS*(0.85+0.6*Math.random()), grounded:false
    }));
    ev.embers = Array.from({length:nE},()=>({
      x:0,y:0, up: rand(0.35,0.75)*(0.7+f*0.6),
      wob:rand(0.8,1.8), phase:Math.random()*Math.PI*2,
      life:this.EMBERS_FADE_MS*(0.8+0.7*Math.random()), scale:rand(0.55,1.1)
    }));

    // timeline minimale (leggera per performance)
    ev.timeline=[
      {t: ev.at+160, fn: ()=> this._afterShock(ev) },
      {t: ev.at+320, fn: ()=> this._burstSparks(ev, mul*0.6) },
      {t: ev.at+520, fn: ()=> this._puffDust(ev,   mul*0.7) }
    ];
    ev.ti=0;
  },

  _spawnDecal(ev, cx, cy, cell){
    this.decals.push({ x:cx, y:cy, at:now(), f:ev.f, r: lerp(cell*0.8, cell*1.6, ev.f), life:this.DECAL_FADE_MS });
    if(this.decals.length>this.DECAL_MAX) this.decals.shift();
  },

  _ensureEvent(a,b,overlap){
    const id=this._pairId(a,b);
    let ev=this.events.find(e=>e.id===id);
    const t=now(), f=clamp(overlap/this.MIN_DIST,0.25,1);
    if(!ev){
      if(this.events.length>=this.MAX_EVENTS){ // rimuovi il più vecchio
        this.events.sort((x,y)=>x.until-y.until); this.events.shift();
      }
      ev={ id, at:t, until:t+this.LIFETIME_MS, a,b, f,
           flash:{t}, shock:{t}, shake:{t}, zoom:{t},
           sparks:[], dust:[], puffs:[], debris:[], embers:[], timeline:[], ti:0 };
      this._spawn(ev);
      const cell=this._cell(), offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
      const ax=offX+a.x*(this.Cave.cellX||cell), ay=offY+a.y*(this.Cave.cellY||cell);
      const bx=offX+b.x*(this.Cave.cellX||cell), by=offY+b.y*(this.Cave.cellY||cell);
      const cx=(ax+bx)/2, cy=(ay+by)/2;
      this._spawnDecal(ev,cx,cy,cell);
      try{ if(typeof this.onImpact==='function') this.onImpact({strength:f}); }catch(_){}
      this.events.push(ev);
    }else{
      ev.until=t+this.LIFETIME_MS; ev.f=Math.max(ev.f,f);
    }
    return ev;
  },

  _burstSparks(ev, mul){ const add = Math.min(8, Math.round(10*mul*(0.6+ev.f)));
    for(let i=0;i<add;i++){
      ev.sparks.push({ang:Math.random()*Math.PI*2, sp:1.0+Math.random()*1.9, dist:0, life:700*(0.85+Math.random()*0.5), len:rand(30,80)});
      if(ev.sparks.length>this.MAX_SPARKS) ev.sparks.shift();
    }
  },
  _puffDust(ev, mul){ const add=Math.min(8, Math.round(10*mul*(0.6+ev.f)));
    for(let i=0;i<add;i++){
      const a=(Math.random()*Math.PI - Math.PI/2), v=0.4+Math.random()*1.0;
      ev.dust.push({x:0,y:0, vx:Math.cos(a)*v, vy:-Math.abs(Math.sin(a))*v, life:1600*(0.9+Math.random()*0.7)});
      if(ev.dust.length>this.MAX_DUST) ev.dust.shift();
    }
  },
  _afterShock(ev){ ev.shock={t:now()}; try{ if(typeof this.onAftershock==='function') this.onAftershock({strength:ev.f}); }catch(_){} },

  onAfterMove(){
    if(!this.Cave||!Array.isArray(this.Cave.goblins)||!this.Cave.goblins.length) return;
    SPR.ensure(); this._buildGrid();
    const checked=new Set(); const neigh=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [k,arr] of this.grid){
      const [cx,cy]=k.split(':').map(Number);
      for(const [dx,dy] of neigh){
        const nb=this.grid.get((cx+dx)+":"+(cy+dy)); if(!nb) continue;
        for(let i=0;i<arr.length;i++){
          const g=arr[i]; const jStart=(dx===0&&dy===0)? i+1 : 0;
          for(let j=jStart;j<nb.length;j++){
            const h=nb[j]; if(g===h) continue;
            const pid = g.x<=h.x ? this._pairId(g,h) : this._pairId(h,g);
            if(checked.has(pid)) continue; checked.add(pid);
            const ov=this._resolve(g,h);
            if(ov>0){ const ev=this._ensureEvent(g,h,ov); if(!ev.timeline.length) this._spawn(ev); }
          }
        }
      }
    }
    const t=now();
    this.events=this.events.filter(e=>t<=e.until);
    this.decals=this.decals.filter(d=>t-d.at<=d.life);
  },

  _updateQuality(){
    // aggiorna LOD in base all'EMA del dt: ~16.7ms=60fps, ~20ms=50fps, >24ms≈40fps
    if(this.emaDt<=17.5) this.qLevel=2;
    else if(this.emaDt<=22.5) this.qLevel=1;
    else this.qLevel=0;
  },

  draw(ctx){
    const T=now(); if(!this.lastDrawT) this.lastDrawT=T;
    // EMA dt
    const dt=T-this.lastDrawT; this.lastDrawT=T;
    this.emaDt = this.emaDt*0.9 + dt*0.1; this._updateQuality();

    const evs=this.events; if(!evs.length && !this.decals.length) return;

    const offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
    const cellX=this.Cave.cellX||10, cellY=this.Cave.cellY||10;
    const cell=this._cell(), baseR=cell*this.IMPACT_SCALE;

    // CAMERA shake/zoom (molto leggeri)
    let shakeX=0, shakeY=0, zoom=1;
    for(const ev of evs){
      const sdt=T-ev.shake.t; if(sdt<this.SHAKE_MS){
        const k=1-sdt/this.SHAKE_MS, amp=this.SHAKE_MAX*(0.4+0.6*ev.f)*k;
        shakeX+=(Math.random()*2-1)*amp; shakeY+=(Math.random()*2-1)*amp;
      }
      const zdt=T-ev.zoom.t; if(zdt<this.ZOOM_MS){
        const k=1 - zdt/this.ZOOM_MS; zoom += this.ZOOM_MAX*(0.3+0.7*ev.f)*k;
      }
    }
    if(shakeX||shakeY||zoom!==1){
      ctx.save();
      const cxv=ctx.canvas.width/2, cyv=ctx.canvas.height/2;
      ctx.translate(cxv+shakeX, cyv+shakeY); ctx.scale(zoom,zoom); ctx.translate(-cxv,-cyv);
    }

    /* --- DECALS --- */
    if(this.decals.length){
      ctx.save(); // batch alpha/composite
      for(const d of this.decals){
        const k=clamp(1-(T-d.at)/d.life,0,1)*(0.55+0.45*d.f); if(k<=0.01) continue;
        const R=d.r; ctx.globalAlpha=0.8*k;
        ctx.drawImage(SPR.scorch, d.x-R, d.y-R, R*2, R*2);
      }
      ctx.restore();
    }

    /* --- EVENTS --- */
    for(const ev of evs){
      // timeline dispatch
      if(ev.timeline && ev.ti<ev.timeline.length){
        while(ev.ti<ev.timeline.length && T>=ev.timeline[ev.ti].t){ try{ev.timeline[ev.ti].fn();}catch(_){}
          ev.ti++; }
      }

      const ax=offX+ev.a.x*cellX, ay=offY+ev.a.y*cellY;
      const bx=offX+ev.b.x*cellX, by=offY+ev.b.y*cellY;
      const cx=(ax+bx)/2, cy=(ay+by)/2;

      // FLASH
      const fdt=T-ev.flash.t;
      if(fdt<this.FLASH_MS){
        const a=this.FLASH_ALPHA*(1-fdt/this.FLASH_MS)*ev.f;
        const s=baseR*3.2;
        if(a>0.02){ ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=a;
          ctx.drawImage(SPR.glow, cx-s/2, cy-s/2, s, s); ctx.restore(); }
      }

      // SHOCKWAVE
      const sdt=T-ev.shock.t;
      if(sdt<this.SHOCK_MS){
        const prog=sdt/this.SHOCK_MS, r=baseR*(1.1+prog*2.2), a=0.42*(1-prog)*(0.6+0.6*ev.f);
        if(a>0.02){ ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle='rgba(255,235,200,0.9)'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
      }

      // SPARKS
      if(ev.sparks.length){
        ctx.save(); ctx.globalCompositeOperation='lighter';
        for(const sp of ev.sparks){
          const alive=Math.max(0, sp.life-(T-ev.at)); if(alive<=0) continue;
          sp.dist += sp.sp * (cell*0.16);
          const px=cx+Math.cos(sp.ang)*sp.dist, py=cy+Math.sin(sp.ang)*sp.dist;
          const tFade=alive/sp.life; const L=sp.len*(0.5+0.5*tFade);
          const a=0.78*tFade; if(a<0.04) continue;
          ctx.globalAlpha=a; ctx.translate(px,py); ctx.rotate(sp.ang);
          ctx.drawImage(SPR.spark, -L*0.9, -4, L, 8); ctx.setTransform(1,0,0,1,0,0);
        }
        ctx.restore();
      }

      // DUST
      if(ev.dust.length){
        ctx.save(); ctx.globalCompositeOperation='multiply';
        for(const d of ev.dust){
          const alive=Math.max(0, d.life-(T-ev.at)); if(!alive) continue;
          d.vx*=this.DUST_DRAG; d.vy=d.vy*this.DUST_DRAG + this.DUST_GRAV*(cell);
          d.x+=d.vx; d.y+=d.vy;
          const a=clamp(alive/this.DUST_FADE_MS,0,1)*0.5*(0.5+0.6*ev.f); if(a<0.03) continue;
          ctx.globalAlpha=a; const px=cx+d.x*0.9, py=cy+d.y*0.9;
          ctx.drawImage(SPR.dust, px-35, py-35, 70, 70);
        }
        ctx.restore();
      }

      // PUFFS (smoke)
      if(ev.puffs.length){
        ctx.save();
        for(const p of ev.puffs){
          const alive=Math.max(0, p.life-(T-ev.at)); if(!alive) continue;
          p.r += p.grow*(1+ev.f);
          const k=clamp(alive/this.PUFF_FADE_MS,0,1)*0.22*(0.6+0.6*ev.f);
          if(k<0.02) continue;
          const sz=p.r*2.1;
          ctx.globalAlpha=k; ctx.drawImage(SPR.smoke, cx-sz/2, cy-sz/2, sz, sz);
        }
        ctx.restore();
      }

      // DEBRIS (con bounce leggero)
      if(ev.debris.length){
        for(const d of ev.debris){
          const alive=Math.max(0, d.life-(T-ev.at)); if(!alive) continue;
          if(!d.grounded){
            d.vx*=this.DEBRIS_DRAG; d.vy=d.vy*this.DEBRIS_DRAG + this.DEBRIS_GRAV*(cell);
            d.x+=d.vx; d.y+=d.vy; d.a+=d.va;
            const groundY = cy + cell*1.6, wy = cy + d.y*cell*0.08;
            if(wy>=groundY){ d.y -= Math.abs((wy-groundY)/(cell*0.08));
              d.vy = -Math.abs(d.vy)*this.DEBRIS_BOUNCE; d.vx*=0.85; d.va*=0.7;
              if(Math.abs(d.vy)<0.02) d.grounded=true; }
          }else{ d.vx*=0.95; d.va*=0.92; d.x+=d.vx*0.5; d.a+=d.va*0.5; }
          const k=clamp(alive/this.DEBRIS_FADE_MS,0,1)*0.85; if(k<0.04) continue;
          const px=cx + d.x*cell*0.08, py=cy + d.y*cell*0.08;
          const sx=SPR.debris.width*d.s, sy=SPR.debris.height*d.s;
          // ombra
          ctx.save(); ctx.globalAlpha=0.12*k; ctx.fillStyle='#0b0b0b';
          ctx.beginPath(); ctx.ellipse(px, py+2, sx*0.4, sy*0.2, 0,0,Math.PI*2); ctx.fill(); ctx.restore();
          // shard
          ctx.save(); ctx.translate(px,py); ctx.rotate(d.a); ctx.globalAlpha=k*(0.6+0.5*ev.f);
          ctx.drawImage(SPR.debris, -sx/2, -sy/2, sx, sy); ctx.restore();
        }
      }

      // EMBERS (glow in salita)
      if(ev.embers.length){
        ctx.save(); ctx.globalCompositeOperation='lighter';
        for(const e of ev.embers){
          const alive=Math.max(0, e.life-(T-ev.at)); if(!alive) continue;
          const t=(T-ev.at)/1000, wob=Math.sin(e.phase+t*e.wob)*cell*0.09;
          const px=cx+wob, py=cy - t*e.up*cell*0.55;
          const a=clamp(alive/this.EMBERS_FADE_MS,0,1)*0.6*(0.5+0.6*ev.f); if(a<0.03) continue;
          const s=18*e.scale;
          ctx.globalAlpha=a; ctx.drawImage(SPR.glow, px-s/2, py-s/2, s, s);
        }
        ctx.restore();
      }
    }

    if(shakeX||shakeY||zoom!==1) ctx.restore();
  }
};

window.GoblinCrash=Crash;
})();
