(()=>{"use strict";
/* GoblinCrash — small-scale + frame-budget renderer (but pretty!) */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const now = ()=>performance.now();

function C(w,h){const c=document.createElement('canvas'); c.width=w; c.height=h; return c;}
/* Sprites leggeri, pensati per essere piccoli */
function sprGlow(sz=64){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2;
  let gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,'rgba(255,240,200,0.95)');
  gr.addColorStop(0.55,'rgba(255,155,30,0.55)');
  gr.addColorStop(1,'rgba(255,155,30,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill(); return c;}
function sprSpark(w=70,h=6){const c=C(w,h), g=c.getContext('2d');
  const gr=g.createLinearGradient(0,h/2,w,h/2);
  gr.addColorStop(0,'rgba(255,230,170,0)');
  gr.addColorStop(0.25,'rgba(255,240,190,0.95)');
  gr.addColorStop(0.7,'rgba(255,120,20,0.65)');
  gr.addColorStop(1,'rgba(255,120,20,0)');
  g.fillStyle=gr; g.fillRect(0,0,w,h); return c;}
function sprSmoke(sz=90){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2;
  let gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,'rgba(120,118,116,0.35)');
  gr.addColorStop(1,'rgba(120,118,116,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill(); return c;}
function sprDust(sz=54){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2;
  g.fillStyle='rgba(92,82,68,0.45)';
  for(let i=0;i<20;i++){const a=Math.random()*Math.PI*2, rr=rand(3,r*0.85), s=rand(0.7,1.6);
    g.beginPath(); g.arc(r+Math.cos(a)*rr, r+Math.sin(a)*rr, s, 0, Math.PI*2); g.fill();}
  return c;}
function sprDebris(sz=12){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2, cx=r, cy=r, n=5+Math.floor(Math.random()*2);
  g.fillStyle='#97866e'; g.beginPath();
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2+rand(-0.15,0.15), rr=r*rand(0.55,0.95);
    const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr; if(i===0) g.moveTo(x,y); else g.lineTo(x,y);}
  g.closePath(); g.fill(); return c;}
function sprScorch(sz=120){const c=C(sz,sz), g=c.getContext('2d'), r=sz/2;
  let gr=g.createRadialGradient(r,r,0,r,r,r);
  gr.addColorStop(0,'rgba(24,18,14,0.55)');
  gr.addColorStop(1,'rgba(24,18,14,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill(); return c;}

const SPR = {ready:false,
  ensure(){ if(this.ready) return;
    this.glow=sprGlow(); this.spark=sprSpark(); this.smoke=sprSmoke();
    this.dust=sprDust(); this.debris=sprDebris(); this.scorch=sprScorch();
    this.ready=true; }
};

/* ---------------- ENGINE ---------------- */
const Crash = {
  Cave:null, events:[], decals:[], grid:new Map(),

  // scala (4× più piccoli rispetto a prima)
  IMPACT_SCALE: 0.16,  // prima ~0.65

  // fisica/tempi compatti
  MIN_DIST:3, RESOLVE_PUSH:0.95, PAUSE_MS:[180,300], LIFETIME_MS:9000,

  // limiti globali
  MAX_EVENTS: 8,

  // per-evento (già piccoli)
  MAX_SPARKS: 18,
  MAX_DUST:   14,
  MAX_PUFFS:  6,
  MAX_DEBRIS: 8,
  MAX_EMBERS: 9,

  // fade/drag brevi
  SPARK_FADE_MS:650,
  DUST_FADE_MS:1400, DUST_GRAV:0.00055, DUST_DRAG:0.985,
  PUFF_FADE_MS:1600,
  DEBRIS_FADE_MS:1500, DEBRIS_DRAG:0.985, DEBRIS_GRAV:0.0015, DEBRIS_BOUNCE:0.3,
  EMBERS_FADE_MS:1800,

  // camera/flash mini
  SHOCK_MS:520, FLASH_MS:70, FLASH_ALPHA:0.12,
  SHAKE_MAX:1.6, SHAKE_MS:140, ZOOM_MAX:0.012, ZOOM_MS:90,

  // decals
  DECAL_MAX: 70, DECAL_FADE_MS:3000,

  // qualità adattiva + BUDGET per frame
  qLevel:2, emaDt:16.7, lastDrawT:0,
  BASE_BUDGET: 220,    // quante “particles” max per frame (high)
  MID_BUDGET:  150,
  LOW_BUDGET:  95,

  // hook opzionali
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
    const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||0.0001;
    if(d>=this.MIN_DIST) return 0;
    const overlap=this.MIN_DIST-d, nx=dx/d, ny=dy/d, push=overlap*this.RESOLVE_PUSH;
    a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
    const t=now(), p1=this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]),
          p2=this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]);
    a.pauseTil=Math.max(a.pauseTil||0,t+p1); b.pauseTil=Math.max(b.pauseTil||0,t+p2);
    a.digging=false; b.digging=false;
    return overlap;
  },

  _spawn(ev){
    const f=clamp(ev.f,0.25,1);
    const mul = this.qLevel===2?1 : this.qLevel===1?0.7 : 0.5;

    const nS = Math.min(this.MAX_SPARKS, Math.round(12*(0.6+0.8*f)*mul));
    const nD = Math.min(this.MAX_DUST,   Math.round(10*(0.6+0.7*f)*mul));
    const nP = Math.min(this.MAX_PUFFS,  Math.round(4*(0.5+0.8*f)*mul));
    const nB = Math.min(this.MAX_DEBRIS, Math.round(6*(0.6+0.9*f)*mul));
    const nE = Math.min(this.MAX_EMBERS, Math.round(6*(0.5+0.9*f)*mul));

    ev.sparks = Array.from({length:nS},()=>({ang:Math.random()*Math.PI*2, sp: 0.9+Math.random()*1.5, dist:0, life:this.SPARK_FADE_MS*(0.9+0.4*Math.random()), len: rand(26,58)}));
    ev.dust   = Array.from({length:nD},()=>({x:0,y:0, vx:Math.cos(Math.random()*Math.PI - Math.PI/2)*rand(0.35,0.9), vy:-Math.abs(Math.sin(Math.random()*Math.PI - Math.PI/2))*rand(0.35,0.9), life:this.DUST_FADE_MS*(0.9+0.5*Math.random())}));
    ev.puffs  = Array.from({length:nP},()=>({r: rand(7,14), grow: rand(0.06,0.11), life: this.PUFF_FADE_MS*(0.9+0.5*Math.random())}));
    ev.debris = Array.from({length:nB},()=>({x:0,y:0, vx:Math.cos(Math.random()*Math.PI*2)*rand(0.45,1.6), vy: -rand(0.25,0.7), a:rand(0,Math.PI*2), va:rand(-0.22,0.22), s: rand(0.7,1.0), life:this.DEBRIS_FADE_MS*(0.9+0.4*Math.random()), grounded:false}));
    ev.embers = Array.from({length:nE},()=>({x:0,y:0, up: rand(0.3,0.65)*(0.7+f*0.6), wob:rand(0.7,1.5), phase:Math.random()*Math.PI*2, life:this.EMBERS_FADE_MS*(0.9+0.5*Math.random()), scale:rand(0.55,1)}));

    // cursori round-robin per budget frame
    ev._iS=0; ev._iD=0; ev._iP=0; ev._iB=0; ev._iE=0;

    ev.timeline=[
      {t: ev.at+140, fn: ()=>{ ev.shock={t:now()}; }},
      {t: ev.at+260, fn: ()=>{ this._burstSparks(ev, mul*0.6); }},
      {t: ev.at+420, fn: ()=>{ this._puffDust(ev,   mul*0.7 ); }}
    ];
    ev.ti=0;
  },

  _spawnDecal(ev, cx, cy, cell){
    this.decals.push({ x:cx, y:cy, at:now(), f:ev.f, r: clamp(cell*(0.6+0.7*ev.f)*this.IMPACT_SCALE*5, cell*0.4, cell*1.1), life:this.DECAL_FADE_MS });
    if(this.decals.length>this.DECAL_MAX) this.decals.shift();
  },

  _ensureEvent(a,b,overlap){
    const id=this._pairId(a,b);
    let ev=this.events.find(e=>e.id===id);
    const t=now(), f=clamp(overlap/this.MIN_DIST,0.25,1);
    if(!ev){
      if(this.events.length>=this.MAX_EVENTS){ this.events.sort((x,y)=>x.until-y.until); this.events.shift(); }
      ev={ id, at:t, until:t+this.LIFETIME_MS, a,b, f, flash:{t}, shock:{t}, shake:{t}, zoom:{t},
           sparks:[], dust:[], puffs:[], debris:[], embers:[], timeline:[], ti:0 };
      this._spawn(ev);
      const cell=this._cell(), offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
      const ax=offX+a.x*(this.Cave.cellX||cell), ay=offY+a.y*(this.Cave.cellY||cell);
      const bx=offX+b.x*(this.Cave.cellX||cell), by=offY+b.y*(this.Cave.cellY||cell);
      const cx=(ax+bx)/2, cy=(ay+by)/2;
      this._spawnDecal(ev,cx,cy,cell);
      try{ if(typeof this.onImpact==='function') this.onImpact({strength:f}); }catch(_){}
      this.events.push(ev);
    }else{ ev.until=t+this.LIFETIME_MS; ev.f=Math.max(ev.f,f); }
    return ev;
  },

  _burstSparks(ev, mul){ const add=Math.min(6, Math.round(8*mul*(0.6+ev.f)));
    for(let i=0;i<add;i++){ ev.sparks.push({ang:Math.random()*Math.PI*2, sp:0.9+Math.random()*1.5, dist:0, life:540*(0.85+Math.random()*0.5), len:rand(22,44)}); if(ev.sparks.length>this.MAX_SPARKS) ev.sparks.shift(); }
  },
  _puffDust(ev, mul){ const add=Math.min(6, Math.round(8*mul*(0.6+ev.f)));
    for(let i=0;i<add;i++){ const a=(Math.random()*Math.PI - Math.PI/2), v=0.35+Math.random()*0.8;
      ev.dust.push({x:0,y:0, vx:Math.cos(a)*v, vy:-Math.abs(Math.sin(a))*v, life:1200*(0.9+Math.random()*0.7)}); if(ev.dust.length>this.MAX_DUST) ev.dust.shift(); }
  },

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
    if(this.emaDt<=17.2) this.qLevel=2;
    else if(this.emaDt<=22.0) this.qLevel=1;
    else this.qLevel=0;
  },
  _budgetForLevel(){ return this.qLevel===2? this.BASE_BUDGET : this.qLevel===1? this.MID_BUDGET : this.LOW_BUDGET; },

  draw(ctx){
    const T=now(); if(!this.lastDrawT) this.lastDrawT=T;
    const dt=T-this.lastDrawT; this.lastDrawT=T;
    this.emaDt = this.emaDt*0.9 + dt*0.1; this._updateQuality();

    if(!this.events.length && !this.decals.length) return;

    const offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
    const cellX=this.Cave.cellX||10, cellY=this.Cave.cellY||10;
    const cell=this._cell(), baseR=cell*this.IMPACT_SCALE;

    // camera mini
    let shakeX=0, shakeY=0, zoom=1;
    for(const ev of this.events){
      const sdt=T-(ev.shake?.t||0); if(sdt<this.SHAKE_MS){ const k=1-sdt/this.SHAKE_MS, amp=this.SHAKE_MAX*(0.4+0.6*ev.f)*k; shakeX+=(Math.random()*2-1)*amp; shakeY+=(Math.random()*2-1)*amp; }
      const zdt=T-(ev.zoom?.t||0);  if(zdt<this.ZOOM_MS){ const k=1-zdt/this.ZOOM_MS; zoom+= this.ZOOM_MAX*(0.3+0.7*ev.f)*k; }
    }
    if(shakeX||shakeY||zoom!==1){ ctx.save(); const cxv=ctx.canvas.width/2, cyv=ctx.canvas.height/2; ctx.translate(cxv+shakeX, cyv+shakeY); ctx.scale(zoom,zoom); ctx.translate(-cxv,-cyv); }

    /* --- DECALS (batch) --- */
    if(this.decals.length){
      ctx.save();
      for(const d of this.decals){
        const k = clamp(1 - (T - d.at) / d.life, 0, 1) * (0.35 + 0.35 * d.f);
        if(k<=0.02) continue;
        const R=d.r; 
        ctx.globalAlpha = 0.45 * k;
        ctx.drawImage(SPR.scorch, d.x-R, d.y-R, R*2, R*2);
      }
      ctx.restore();
    }

    /* --- BUDGET ROUND-ROBIN --- */
    let budget = this._budgetForLevel();           // “quante particelle posso disegnare”
    const nEv = this.events.length||1;

    for(let eIdx=0; eIdx<nEv; eIdx++){
      if(budget<=0) break;
      const ev = this.events[(eIdx + (T|0)) % nEv]; // spalmare equamente tra frame
      const ax=offX+ev.a.x*cellX, ay=offY+ev.a.y*cellY;
      const bx=offX+ev.b.x*cellX, by=offY+ev.b.y*cellY;
      const cx=(ax+bx)/2, cy=(ay+by)/2;

      // timeline
      if(ev.timeline && ev.ti<ev.timeline.length){
        while(ev.ti<ev.timeline.length && T>=ev.timeline[ev.ti].t){ try{ev.timeline[ev.ti].fn();}catch(_){}
          ev.ti++; }
      }

      // flash/shock (non contano nel budget, sono 1 draw)
      const fdt=T-(ev.flash?.t||0);
      if(fdt<this.FLASH_MS){
        const a=this.FLASH_ALPHA*(1-fdt/this.FLASH_MS)*ev.f;
        if(a>0.02){ const s=baseR*2.6; ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=a; ctx.drawImage(SPR.glow, cx-s/2, cy-s/2, s, s); ctx.restore(); }
      }
      const sdt=T-(ev.shock?.t||0);
      if(sdt<this.SHOCK_MS){
        const prog=sdt/this.SHOCK_MS, r=baseR*(0.9+prog*1.6), a=0.35*(1-prog)*(0.6+0.6*ev.f);
        if(a>0.02){ ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle='rgba(255,235,200,0.9)'; ctx.lineWidth=1.7; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
      }

      // helper round-robin per lista
      const stepList=(arr, cursorProp, step, fn)=>{
        if(!arr||!arr.length||budget<=0) return;
        let i = ev[cursorProp]||0, n=arr.length, count=Math.min(step,n);
        for(let k=0;k<count && budget>0;k++){
          const idx = i % n; i++; if(fn(arr[idx])!==false) budget--;
        }
        ev[cursorProp]=i;
      };

      // SPARKS
      ctx.save(); ctx.globalCompositeOperation='lighter';
      stepList(ev.sparks,'_iS', 6, (sp)=>{
        const alive=Math.max(0, sp.life-(T-ev.at)); if(alive<=0) return false;
        sp.dist += sp.sp * (cell*0.12);
        const px=cx+Math.cos(sp.ang)*sp.dist, py=cy+Math.sin(sp.ang)*sp.dist;
        const tFade=alive/sp.life; const L=sp.len*(0.5+0.5*tFade), a=0.75*tFade; if(a<0.04) return false;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(px, py);
        ctx.rotate(sp.ang);
        ctx.drawImage(SPR.spark, -L*0.9, -3, L, 6);
        ctx.restore(); // <-- non rompe shake/zoom della camera

      });
      ctx.restore();

      // DUST
      ctx.save();
      ctx.globalCompositeOperation = 'source-over'; // non scurisce il layer
      stepList(ev.dust,'_iD', 5, (d)=>{
        const alive=Math.max(0, d.life-(T-ev.at)); if(!alive) return false;
        d.vx*=this.DUST_DRAG; d.vy=d.vy*this.DUST_DRAG + this.DUST_GRAV*(cell);
        d.x+=d.vx; d.y+=d.vy;
        const a=clamp(alive/this.DUST_FADE_MS,0,1)*0.45*(0.5+0.6*ev.f); if(a<0.03) return false;
        ctx.globalAlpha=a; const px=cx+d.x*0.8, py=cy+d.y*0.8;
        ctx.drawImage(SPR.dust, px-27, py-27, 54, 54);
      });
      ctx.restore();

      // PUFFS
      stepList(ev.puffs,'_iP', 2, (p)=>{
        const alive=Math.max(0, p.life-(T-ev.at)); if(!alive) return false;
        p.r += p.grow*(1+ev.f);
        const k=clamp(alive/this.PUFF_FADE_MS,0,1)*0.18*(0.6+0.6*ev.f); if(k<0.02) return false;
        const sz=p.r*1.8; ctx.globalAlpha=k; ctx.drawImage(SPR.smoke, cx-sz/2, cy-sz/2, sz, sz);
      });

      // DEBRIS
      stepList(ev.debris,'_iB', 3, (d)=>{
        const alive=Math.max(0, d.life-(T-ev.at)); if(!alive) return false;
        if(!d.grounded){
          d.vx*=this.DEBRIS_DRAG; d.vy=d.vy*this.DEBRIS_DRAG + this.DEBRIS_GRAV*(cell);
          d.x+=d.vx; d.y+=d.vy; d.a+=d.va;
          const groundY = cy + cell*1.2, wy = cy + d.y*cell*0.07;
          if(wy>=groundY){ d.y -= Math.abs((wy-groundY)/(cell*0.07));
            d.vy = -Math.abs(d.vy)*this.DEBRIS_BOUNCE; d.vx*=0.84; d.va*=0.7;
            if(Math.abs(d.vy)<0.02) d.grounded=true; }
        }else{ d.vx*=0.95; d.va*=0.92; d.x+=d.vx*0.45; d.a+=d.va*0.45; }
        const k=clamp(alive/this.DEBRIS_FADE_MS,0,1)*0.8; if(k<0.04) return false;
        const px=cx + d.x*cell*0.07, py=cy + d.y*cell*0.07;
        const sx=SPR.debris.width*d.s, sy=SPR.debris.height*d.s;
        // ombra
        ctx.save(); ctx.globalAlpha=0.12*k; ctx.fillStyle='#0b0b0b';
        ctx.beginPath(); ctx.ellipse(px, py+1.5, sx*0.35, sy*0.16, 0,0,Math.PI*2); ctx.fill(); ctx.restore();
        // frammento
        ctx.save(); ctx.translate(px,py); ctx.rotate(d.a); ctx.globalAlpha=k*(0.6+0.5*ev.f);
        ctx.drawImage(SPR.debris, -sx/2, -sy/2, sx, sy); ctx.restore();
      });

      // EMBERS
      ctx.save(); ctx.globalCompositeOperation='lighter';
      stepList(ev.embers,'_iE', 3, (e)=>{
        const alive=Math.max(0, e.life-(T-ev.at)); if(!alive) return false;
        const t=(T-ev.at)/1000, wob=Math.sin(e.phase+t*e.wob)*cell*0.06;
        const px=cx+wob, py=cy - t*e.up*cell*0.45;
        const a=clamp(alive/this.EMBERS_FADE_MS,0,1)*0.55*(0.5+0.6*ev.f); if(a<0.03) return false;
        const s=14*e.scale; ctx.globalAlpha=a; ctx.drawImage(SPR.glow, px-s/2, py-s/2, s, s);
      });
      ctx.restore();
    }

    if(shakeX||shakeY||zoom!==1) ctx.restore();
  }
};

window.GoblinCrash=Crash;
})();
