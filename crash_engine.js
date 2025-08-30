(()=>{"use strict";
/* GoblinCrash — FX d'impatto televisivi per la Cave */
const Crash = {
  Cave:null, events:[], grid:new Map(), now:()=>performance.now(),

  // --- parametri
  MIN_DIST:3, RESOLVE_PUSH:0.95, PAUSE_MS:[220,420], LIFETIME_MS:18000,
  // sparks
  SPARKS:18, SPARK_SPEED:[1.1,2.4], SPARK_FADE_MS:850, SPARK_TRAIL:5,
  // dust
  DUST:16, DUST_GRAV:0.00042, DUST_DRAG:0.985, DUST_FADE_MS:1800,
  // smoke
  PUFFS:6, PUFF_FADE_MS:1600,
  // shockwave & shake
  SHOCK_MS:900, FLASH_MS:140, FLASH_ALPHA:0.22,
  SHAKE_MAX:3.0, SHAKE_MS:240,

  init(CaveRef){
    this.Cave=CaveRef;
    // stile per eventuali future micro-UI (placeholder)
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
        id, at:t, until:t+this.LIFETIME_MS, a,b, f:Math.max(0.2, Math.min(1, overlap/this.MIN_DIST)),
        // FX payload
        shock:{t, r0:2, alive:true}, flash:{t, alive:true},
        sparks:[], dust:[], puffs:[], trails:[], shake:{t, alive:true}
      };
      this._spawnFX(ev);
      this.events.push(ev);
    }else{
      ev.until=t+this.LIFETIME_MS;
      ev.f=Math.max(ev.f, Math.min(1, overlap/this.MIN_DIST));
    }
    return ev;
  },

  _spawnFX(ev){
    const f = ev.f || 0.6;
    const spn = Math.round(this.SPARKS * (0.6 + 0.8*f));
    ev.sparks.length=0;
    for(let i=0;i<spn;i++){
      const ang=Math.random()*Math.PI*2;
      const sp=this.SPARK_SPEED[0] + Math.random()*(this.SPARK_SPEED[1]-this.SPARK_SPEED[0]);
      ev.sparks.push({ang, sp, dist:0, life:this.SPARK_FADE_MS*(0.8+0.4*Math.random()), trail:[]});
    }
    const dn = Math.round(this.DUST * (0.6 + 0.7*f));
    ev.dust.length=0;
    for(let i=0;i<dn;i++){
      const a=(Math.random()*Math.PI - Math.PI/2); // semi-cono alto
      const v=0.5 + Math.random()*1.2;
      ev.dust.push({x:0,y:0, vx:Math.cos(a)*v, vy:-Math.abs(Math.sin(a))*v, life:this.DUST_FADE_MS*(0.9+0.6*Math.random())});
    }
    const pn = Math.max(3, Math.round(this.PUFFS*(0.5+0.8*f)));
    ev.puffs.length=0;
    for(let i=0;i<pn;i++){
      const r0 = 6 + Math.random()*14;
      ev.puffs.push({r:r0, grow:0.08+Math.random()*0.18, life:this.PUFF_FADE_MS*(0.9+0.6*Math.random())});
    }
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
  },

  draw(ctx){
    if(!this.events.length) return;
    const offX=this.Cave.offsetX||0, offY=this.Cave.offsetY||0;
    const cellX=this.Cave.cellX||10, cellY=this.Cave.cellY||10;
    const cell=this._cell(); const t=this.now();

    // screen-shake cumulativo
    let shakeX=0, shakeY=0;
    for(const ev of this.events){
      const dt=t-ev.shake.t;
      if(dt < this.SHAKE_MS){
        const k=1 - (dt/this.SHAKE_MS);
        const amp = this.SHAKE_MAX * (0.4 + 0.6*ev.f) * k;
        shakeX += (Math.random()*2-1)*amp;
        shakeY += (Math.random()*2-1)*amp;
      }
    }
    if (shakeX||shakeY){ ctx.save(); ctx.translate(shakeX, shakeY); }

    for(const ev of this.events){
      const ax=offX+ev.a.x*cellX, ay=offY+ev.a.y*cellY;
      const bx=offX+ev.b.x*cellX, by=offY+ev.b.y*cellY;
      const cx=(ax+bx)/2, cy=(ay+by)/2;

      // FLASH (brevissimo bagliore)
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

      // SHOCKWAVE
      const sdt=t-ev.shock.t;
      if(sdt < this.SHOCK_MS){
        const prog = sdt/this.SHOCK_MS;
        const r = (cell*1.2) + prog * (cell*4.0);
        const alpha = 0.55 * (1-prog) * (0.6+0.6*ev.f);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.strokeStyle=`rgba(255,245,180,${alpha.toFixed(3)})`;
        ctx.lineWidth=2.8;
        ctx.stroke();
        ctx.restore();
      }

      // SPARKS con trail
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
        ctx.strokeStyle = `rgba(255,210,90,${0.85*alpha})`;
        ctx.beginPath();
        for(let i=0;i<sp.trail.length;i++){
          const p=sp.trail[i];
          if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // DUST (gravità+drag)
      for(const d of ev.dust){
        const alive = Math.max(0, d.life - (t-ev.at));
        if(alive<=0) continue;
        d.vx *= this.DUST_DRAG; d.vy = d.vy*this.DUST_DRAG + this.DUST_GRAV*(cell);
        d.x += d.vx; d.y += d.vy;
        const a = Math.max(0.0, Math.min(0.55, alive/this.DUST_FADE_MS)) * (0.5+0.6*ev.f);
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
        const a = Math.max(0, Math.min(0.28, alive/this.PUFF_FADE_MS)) * (0.6+0.6*ev.f);
        ctx.save();
        const g=ctx.createRadialGradient(cx,cy, p.r*0.2, cx,cy, p.r);
        g.addColorStop(0, `rgba(200,200,200,${a})`);
        g.addColorStop(1, `rgba(200,200,200,0)`);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,p.r,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }

    if (shakeX||shakeY) ctx.restore();
  }
};
window.GoblinCrash=Crash;
})();
