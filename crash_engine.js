(()=>{"use strict";
/* GoblinCrash — FX avanzati d'impatto per la Cave (v2) */
const rand = (a,b)=>a+Math.random()*(b-a);
const rint = (a,b)=>Math.floor(rand(a,b+1));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp =(a,b,t)=>a+(b-a)*t;
const easeOut=(t)=>1-Math.pow(1-t,3);

const Crash = {
  Cave:null, events:[], grid:new Map(), decals:[], // decals persistenti
  now:()=>performance.now(),

  // ===== PARAMETRI PRINCIPALI =====
  MIN_DIST:3, RESOLVE_PUSH:0.95, PAUSE_MS:[220,420], LIFETIME_MS:18000,

  // sparks
  SPARKS:22, SPARK_SPEED:[1.15,2.6], SPARK_FADE_MS:950, SPARK_TRAIL:6,

  // dust
  DUST:18, DUST_GRAV:0.0005, DUST_DRAG:0.984, DUST_FADE_MS:2000,

  // smoke
  PUFFS:7, PUFF_FADE_MS:1700,

  // debris (nuovo)
  DEBRIS:10, DEBRIS_FADE_MS:1600, DEBRIS_DRAG:0.985, DEBRIS_GRAV:0.0012,
  DEBRIS_SIZE:[2,6], DEBRIS_SPIN:[-0.18,0.18],

  // embers (nuovo)
  EMBERS:12, EMBERS_FADE_MS:2200, EMBERS_UP:[0.3,0.7], EMBERS_WOBBLE:[0.8,2.2],

  // heat haze (nuovo – anelli tremolanti traslucidi)
  HAZE_RINGS:3, HAZE_MS:900,

  // shockwave, flash, shake, zoom kick, vignette
  SHOCK_MS:950, FLASH_MS:150, FLASH_ALPHA:0.22,
  SHAKE_MAX:3.2, SHAKE_MS:260,
  ZOOM_MAX:0.045, ZOOM_MS:220,           // zoom kick
  VIGNETTE_MS:220, VIGNETTE_ALPHA:0.18,  // vignetta

  // aberrazione cromatica finta (triple-stroke)
  CHROMA_MS:220, CHROMA_OFFSET:2.2,

  // decals (bruciature/crepe)
  DECAL_MAX:120, DECAL_FADE_MS:24000,

  // hook audio opzionale (assegnabile da fuori)
  onImpact:null,

  init(CaveRef){
    this.Cave=CaveRef;
    // keyframes placeholder (se servono micro-UI in futuro)
    const st=document.createElement("style");
    st.textContent=`@keyframes gc-pop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}`;
    document.head.appendChild(st);
  },

  _cell(){return Math.min(this.Cave.cellX,this.Cave.cellY)||10},
  _key(x,y,s){return ((x/s)|0)+":"+((y/s)|0)},

  _buildGrid(){
    this.grid.clear();
    for(const g of this.Cave.goblins){
      const k=this._key(g.x,g.y,1);
      let a=this.grid.get(k); if(!a){a=[];this.grid.set(k,a)} a.push(g);
    }
  },

  _pairId(a,b){
    const ax=`${a.wax_account||""}:${a.x.toFixed(2)},${a.y.toFixed(2)}`;
    const bx=`${b.wax_account||""}:${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    return ax<=bx ? `${ax}|${bx}` : `${bx}|${ax}`;
  },

  _ensureEvent(a,b,overlap){
    const id=this._pairId(a,b);
    let ev=this.events.find(e=>e.id===id);
    const t=this.now();
    if(!ev){
      ev={
        id, at:t, until:t+this.LIFETIME_MS, a,b,
        f:clamp(overlap/this.MIN_DIST,0.2,1),
        shock:{t, r0:2, alive:true},
        flash:{t, alive:true},
        sparks:[], dust:[], puffs:[], trails:[],
        shake:{t, alive:true},
        debris:[], embers:[], haze:{t,alive:true},
        zoom:{t,alive:true}, chroma:{t,alive:true}, vignette:{t,alive:true}
      };
      this._spawnFX(ev);
      this.events.push(ev);

      // decals persistenti al punto di impatto
      this._spawnDecal(ev);

      // hook audio (opzionale)
      try{ if(typeof this.onImpact==="function") this.onImpact({strength:ev.f}); }catch(_){}
    }else{
      ev.until=t+this.LIFETIME_MS;
      ev.f=Math.max(ev.f, clamp(overlap/this.MIN_DIST,0.2,1));
    }
    return ev;
  },

  _spawnFX(ev){
    const f = ev.f || 0.6;

    // Sparks
    const spn = Math.round(this.SPARKS * (0.6 + 0.8*f));
    ev.sparks.length=0;
    for(let i=0;i<spn;i++){
      const ang=Math.random()*Math.PI*2;
      const sp=this.SPARK_SPEED[0] + Math.random()*(this.SPARK_SPEED[1]-this.SPARK_SPEED[0]);
      ev.sparks.push({ang, sp, dist:0, life:this.SPARK_FADE_MS*(0.85+0.4*Math.random()), trail:[]});
    }

    // Dust
    const dn = Math.round(this.DUST * (0.6 + 0.7*f));
    ev.dust.length=0;
    for(let i=0;i<dn;i++){
      const a=(Math.random()*Math.PI - Math.PI/2);
      const v=0.5 + Math.random()*1.25;
      ev.dust.push({x:0,y:0, vx:Math.cos(a)*v, vy:-Math.abs(Math.sin(a))*v, life:this.DUST_FADE_MS*(0.9+0.6*Math.random())});
    }

    // Puffs
    const pn = Math.max(3, Math.round(this.PUFFS*(0.5+0.8*f)));
    ev.puffs.length=0;
    for(let i=0;i<pn;i++){
      const r0 = 6 + Math.random()*14;
      ev.puffs.push({r:r0, grow:0.08+Math.random()*0.18, life:this.PUFF_FADE_MS*(0.9+0.6*Math.random())});
    }

    // Debris (schegge)
    ev.debris.length=0;
    const dbn = Math.round(this.DEBRIS*(0.6+0.8*f));
    for(let i=0;i<dbn;i++){
      const ang = Math.random()*Math.PI*2;
      const spd = rand(0.6,2.2)*(0.6+f);
      ev.debris.push({
        x:0,y:0, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd*0.6 - rand(0.3,0.8),
        w:rand(this.DEBRIS_SIZE[0],this.DEBRIS_SIZE[1]),
        h:rand(this.DEBRIS_SIZE[0],this.DEBRIS_SIZE[1]),
        a:rand(0,Math.PI*2), va:rand(this.DEBRIS_SPIN[0],this.DEBRIS_SPIN[1]),
        life:this.DEBRIS_FADE_MS*(0.8+0.5*Math.random())
      });
    }

    // Embers (braci luminose)
    ev.embers.length=0;
    const emn = Math.round(this.EMBERS*(0.5+0.9*f));
    for(let i=0;i<emn;i++){
      ev.embers.push({
        x:0,y:0,
        up:rand(this.EMBERS_UP[0], this.EMBERS_UP[1])*(0.7+f*0.6),
        wob:rand(this.EMBERS_WOBBLE[0], this.EMBERS_WOBBLE[1]),
        phase:Math.random()*Math.PI*2,
        life:this.EMBERS_FADE_MS*(0.8+0.6*Math.random())
      });
    }
  },

  _spawnDecal(ev){
    // memorizza una “bruciatura/crepa” al centro dell’impatto
    const t=this.now();
    const cell=this._cell();
    const ax=(this.Cave.offsetX||0)+ev.a.x*(this.Cave.cellX||cell);
    const ay=(this.Cave.offsetY||0)+ev.a.y*(this.Cave.cellY||cell);
    const bx=(this.Cave.offsetX||0)+ev.b.x*(this.Cave.cellX||cell);
    const by=(this.Cave.offsetY||0)+ev.b.y*(this.Cave.cellY||cell);
    const cx=(ax+bx)/2, cy=(ay+by)/2;

    const cracks = rint(3,6);
    const rays=[];
    for(let i=0;i<cracks;i++){
      rays.push({
        ang:rand(0,Math.PI*2),
        len:rand(cell*1.2, cell*3.4)*(0.7+ev.f*0.6),
        w:rand(0.6,1.6),
        off:rand(-cell*0.4, cell*0.4)
      });
    }
    this.decals.push({x:cx,y:cy, at:t, f:ev.f, rays, life:this.DECAL_FADE_MS});
    if(this.decals.length>this.DECAL_MAX) this.decals.shift();
  },

  _resolve(a,b){
    const dx=b.x-a.x, dy=b.y-a.y;
    let d=Math.hypot(dx,dy)||0.0001;
    if(d>=this.MIN_DIST) return 0;
    const overlap=this.MIN_DIST-d, nx=dx/d, ny=dy/d, push=overlap*this.RESOLVE_PUSH;
    a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;

    const t=this.now();
    const p1=this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]);
    const p2=this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]);
    a.pauseTil=Math.max(a.pauseTil||0,t+p1); b.pauseTil=Math.max(b.pauseTil||0,t+p2);
    a.digging=false; b.digging=false;
    return overlap;
  },

  onAfterMove(){
    if(!this.Cave||!Array.isArray(this.Cave.goblins)||!this.Cave.goblins.length) return;
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
            if(ov>0){ this._ensureEvent(g,h,ov); }
          }
        }
      }
    }
    const t=this.now();
    this.events=this.events.filter(e=>t<=e.until);
    this.decals=this.decals.filter(d=>t-d.at<=d.life);
  },

  draw(ctx){
    const evs=this.events; if(!evs.length && !this.decals.length) return;

    const offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
    const cellX=this.Cave.cellX||10, cellY=this.Cave.cellY||10;
    const cell=this._cell(); const t=this.now();

    // ===== CAMERA: SHAKE CUMULATIVO + ZOOM KICK =====
    let shakeX=0, shakeY=0, zoom=1;
    for(const ev of evs){
      // shake
      const sdt=t-ev.shake.t;
      if(sdt < this.SHAKE_MS){
        const k=1 - (sdt/this.SHAKE_MS);
        const amp = this.SHAKE_MAX * (0.4 + 0.6*ev.f) * k;
        shakeX += (Math.random()*2-1)*amp;
        shakeY += (Math.random()*2-1)*amp;
      }
      // zoom kick
      const zdt=t-ev.zoom.t;
      if(zdt<this.ZOOM_MS){
        const zprog = 1 - (zdt/this.ZOOM_MS);
        zoom += this.ZOOM_MAX * (0.3+0.7*ev.f) * easeOut(zprog);
      }
    }
    if (shakeX||shakeY||zoom!==1){
      ctx.save();
      // zoom intorno al centro dello schermo (o media degli impatti?)
      // qui uso il centro canvas: semplice e stabile
      const cxView = ctx.canvas.width/2, cyView = ctx.canvas.height/2;
      ctx.translate(shakeX+cxView, shakeY+cyView);
      ctx.scale(zoom, zoom);
      ctx.translate(-cxView, -cyView);
    }

    // ===== DECALS SOTTO A TUTTO =====
    for(const d of this.decals){
      const age=t-d.at, k=clamp(1 - age/d.life, 0, 1) * (0.5+0.5*d.f);
      ctx.save();
      ctx.globalAlpha = 0.35 * k;
      // alone bruciatura
      const r0 = cell*1.2*(0.6+d.f*0.8);
      const g=ctx.createRadialGradient(d.x,d.y, r0*0.2, d.x,d.y, r0);
      g.addColorStop(0, `rgba(30,20,10,0.6)`);
      g.addColorStop(1, `rgba(30,20,10,0)`);
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(d.x,d.y,r0,0,Math.PI*2); ctx.fill();

      // crepe
      ctx.strokeStyle = `rgba(70,60,55,${0.7*k})`;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      for(const r of d.rays){
        const x1 = d.x + Math.cos(r.ang)*(r.off);
        const y1 = d.y + Math.sin(r.ang)*(r.off);
        const x2 = x1 + Math.cos(r.ang)*r.len*k;
        const y2 = y1 + Math.sin(r.ang)*r.len*k;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      }
      ctx.restore();
    }

    // ===== EV PER-EVENT =====
    for(const ev of evs){
      const ax=offX+ev.a.x*cellX, ay=offY+ev.a.y*cellY;
      const bx=offX+ev.b.x*cellX, by=offY+ev.b.y*cellY;
      const cx=(ax+bx)/2, cy=(ay+by)/2;

      // FLASH
      const fdt=t-ev.flash.t;
      if(fdt < this.FLASH_MS){
        const a = this.FLASH_ALPHA * (1 - fdt/this.FLASH_MS) * ev.f;
        ctx.save();
        const g=ctx.createRadialGradient(cx,cy,0, cx,cy, cell*3.8);
        g.addColorStop(0, `rgba(255,255,200,${a})`);
        g.addColorStop(1, `rgba(255,255,200,0)`);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,cell*3.8,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // SHOCKWAVE + CHROMA
      const sdt=t-ev.shock.t;
      if(sdt < this.SHOCK_MS){
        const prog = sdt/this.SHOCK_MS;
        const r = (cell*1.2) + prog * (cell*4.2);
        const alpha = 0.55 * (1-prog) * (0.6+0.6*ev.f);

        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.strokeStyle=`rgba(255,245,180,${alpha.toFixed(3)})`;
        ctx.lineWidth=2.8; ctx.stroke();

        // aberrazione cromatica breve
        const cdt = t-ev.chroma.t;
        if(cdt < this.CHROMA_MS){
          const k = 1 - cdt/this.CHROMA_MS;
          const off = this.CHROMA_OFFSET * (0.6+0.6*ev.f) * k;
          ctx.lineWidth=1.4;
          ctx.strokeStyle=`rgba(255,60,60,${alpha*0.5})`;
          ctx.beginPath(); ctx.arc(cx+off, cy, r, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(60,255,60,${alpha*0.5})`;
          ctx.beginPath(); ctx.arc(cx, cy+off, r, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle=`rgba(60,60,255,${alpha*0.5})`;
          ctx.beginPath(); ctx.arc(cx-off, cy-off*0.3, r, 0, Math.PI*2); ctx.stroke();
        }
        ctx.restore();
      }

      // HEAT HAZE (anelli tremolanti)
      const hdt=t-ev.haze.t;
      if(hdt < this.HAZE_MS){
        const baseR = cell*1.4;
        for(let i=0;i<this.HAZE_RINGS;i++){
          const prog = clamp(hdt/this.HAZE_MS + i*0.12, 0, 1);
          const rr = baseR + prog*(cell*4.4);
          const a = 0.08*(1-prog) * (0.6+0.6*ev.f);
          ctx.save();
          const wav = Math.sin((t*0.02 + i*1.7))*0.7;
          ctx.globalAlpha=a;
          ctx.beginPath();
          ctx.ellipse(cx+wav, cy-wav, rr*1.02, rr*(0.98+wav*0.02), 0, 0, Math.PI*2);
          ctx.strokeStyle="rgba(255,255,220,0.4)"; ctx.lineWidth=0.8;
          ctx.stroke();
          ctx.restore();
        }
      }

      // SPARKS (con trail)
      for(const sp of ev.sparks){
        const alive = Math.max(0, sp.life - (t-ev.at));
        if(alive<=0) continue;
        sp.dist += sp.sp * (cell*0.16);
        const px = cx + Math.cos(sp.ang)*sp.dist;
        const py = cy + Math.sin(sp.ang)*sp.dist;

        sp.trail.push({x:px,y:py});
        if (sp.trail.length>this.SPARK_TRAIL) sp.trail.shift();

        const alpha = Math.max(0, Math.min(1, alive/sp.life));
        ctx.save();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = `rgba(255,210,90,${0.9*alpha})`;
        ctx.beginPath();
        for(let i=0;i<sp.trail.length;i++){
          const p=sp.trail[i];
          if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // DUST (gravità + drag)
      for(const d of ev.dust){
        const alive = Math.max(0, d.life - (t-ev.at));
        if(alive<=0) continue;
        d.vx *= this.DUST_DRAG; d.vy = d.vy*this.DUST_DRAG + this.DUST_GRAV*(cell);
        d.x += d.vx; d.y += d.vy;
        const a = clamp(alive/this.DUST_FADE_MS,0,1) * (0.55) * (0.5+0.6*ev.f);
        ctx.save();
        ctx.globalAlpha=a;
        ctx.fillStyle="rgba(120,100,60,1)";
        ctx.beginPath();
        ctx.arc(cx + d.x*0.9, cy + d.y*0.9, 1.35, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }

      // SMOKE (puffs)
      for(const p of ev.puffs){
        const alive = Math.max(0, p.life - (t-ev.at));
        if(alive<=0) continue;
        p.r += p.grow * (1+ev.f);
        const a = clamp(alive/this.PUFF_FADE_MS,0,1) * 0.28 * (0.6+0.6*ev.f);
        ctx.save();
        const g=ctx.createRadialGradient(cx,cy, p.r*0.2, cx,cy, p.r);
        g.addColorStop(0, `rgba(200,200,200,${a})`);
        g.addColorStop(1, `rgba(200,200,200,0)`);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,p.r,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // DEBRIS (schegge)
      for(const d of ev.debris){
        const alive = Math.max(0, d.life - (t-ev.at));
        if(alive<=0) continue;
        d.vx *= this.DEBRIS_DRAG; d.vy = d.vy*this.DEBRIS_DRAG + this.DEBRIS_GRAV*(cell);
        d.x += d.vx; d.y += d.vy; d.a += d.va;

        const a = clamp(alive/this.DEBRIS_FADE_MS,0,1) * (0.8);
        ctx.save();
        ctx.translate(cx + d.x*cell*0.08, cy + d.y*cell*0.08);
        ctx.rotate(d.a);
        ctx.globalAlpha = a*(0.6+0.5*ev.f);
        ctx.fillStyle = "rgba(180,140,90,1)"; // pietrisco
        ctx.fillRect(-d.w*0.5, -d.h*0.5, d.w, d.h);
        ctx.restore();
      }

      // EMBERS (braci)
      for(const e of ev.embers){
        const alive = Math.max(0, e.life - (t-ev.at));
        if(alive<=0) continue;
        const dt = (t-ev.at)/1000;
        const wob = Math.sin(e.phase + dt*e.wob)*cell*0.12;
        const px = cx + wob;
        const py = cy - dt*e.up*cell*0.6;

        const a = clamp(alive/this.EMBERS_FADE_MS,0,1) * (0.65) * (0.5+0.6*ev.f);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const r = lerp(0.8, 2.0, 1-a);
        const gg = ctx.createRadialGradient(px,py,0, px,py,r*3.0);
        gg.addColorStop(0, `rgba(255,180,60,${a})`);
        gg.addColorStop(1, `rgba(255,180,60,0)`);
        ctx.fillStyle=gg;
        ctx.beginPath(); ctx.arc(px,py,r*3.0,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }

      // VIGNETTA PULSANTE (breve)
      const vdt=t-ev.vignette.t;
      if(vdt<this.VIGNETTE_MS){
        const k = 1 - vdt/this.VIGNETTE_MS;
        const a = this.VIGNETTE_ALPHA * k * (0.4+0.6*ev.f);
        ctx.save();
        const w=ctx.canvas.width, h=ctx.canvas.height;
        const g=ctx.createRadialGradient(w/2,h/2, Math.min(w,h)*0.2, w/2,h/2, Math.max(w,h)*0.8);
        g.addColorStop(0, `rgba(0,0,0,0)`);
        g.addColorStop(1, `rgba(0,0,0,${a})`);
        ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
        ctx.restore();
      }
    }

    // ripristino camera
    if (shakeX||shakeY||zoom!==1) ctx.restore();
  }
};
window.GoblinCrash=Crash;
})();
