(()=>{"use strict";
/* GoblinCrash — FX d'impatto + oggetti ambientali (pipistrelli/monete/ragni/serpenti) */

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const rint=(a,b)=>Math.floor(rand(a,b+1));

const Crash = {
  Cave:null, events:[], grid:new Map(), now:()=>performance.now(),

  /* ---------- Parametri collisioni / FX ---------- */
  MIN_DIST:3, RESOLVE_PUSH:0.95, PAUSE_MS:[220,420], LIFETIME_MS:18000,

  // Sparks con trail
  SPARKS:18, SPARK_SPEED:[1.1,2.4], SPARK_FADE_MS:900, SPARK_TRAIL:6,

  // Polvere
  DUST:16, DUST_GRAV:0.00042, DUST_DRAG:0.985, DUST_FADE_MS:1800,

  // Fumo
  PUFFS:6, PUFF_FADE_MS:1600,

  // Shock & Flash
  SHOCK_MS:850, FLASH_MS:120, FLASH_ALPHA:0.22,
  SHAKE_MAX:3.0, SHAKE_MS:240,

  /* ---------- Oggetti ambientali ---------- */
  ambient:[],
  AMB_MAX:10,
  AMB_LIFE_MS:30_000,
  AMB_MIN_MS:60_000,  // 1 minuto
  AMB_MAX_MS:240_000, // 4 minuti
  nextAmbientAt:0,

  init(CaveRef){
    this.Cave=CaveRef;
    this._scheduleAmbient();
  },

  _scheduleAmbient(){
    const t=this.now();
    this.nextAmbientAt = t + rint(this.AMB_MIN_MS, this.AMB_MAX_MS);
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
        f:Math.max(0.2, Math.min(1, overlap/this.MIN_DIST)),
        shock:{t, alive:true}, flash:{t, alive:true}, shake:{t, alive:true},
        sparks:[], dust:[], puffs:[]
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

    // SPARKS
    const spn = Math.round(this.SPARKS * (0.6 + 0.8*f));
    ev.sparks.length=0;
    for(let i=0;i<spn;i++){
      const ang=Math.random()*Math.PI*2;
      const sp=this.SPARK_SPEED[0] + Math.random()*(this.SPARK_SPEED[1]-this.SPARK_SPEED[0]);
      ev.sparks.push({ang, sp, dist:0, life:this.SPARK_FADE_MS*(0.85+0.45*Math.random()), trail:[]});
    }

    // DUST
    const dn = Math.round(this.DUST * (0.6 + 0.7*f));
    ev.dust.length=0;
    for(let i=0;i<dn;i++){
      const a=(Math.random()*Math.PI - Math.PI/2); // semi-cono alto
      const v=0.45 + Math.random()*1.1;
      ev.dust.push({x:0,y:0, vx:Math.cos(a)*v, vy:-Math.abs(Math.sin(a))*v, life:this.DUST_FADE_MS*(0.9+0.6*Math.random())});
    }

    // PUFFS
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

  /* ---------- Ambient: spawn & draw ---------- */
  _spawnAmbientOne(viewW, viewH){
    if(this.ambient.length>=this.AMB_MAX) return;
    const t=this.now();
    const typePick = ["bat","coin","spider","snake"][rint(0,3)];
    const x = rand(24, viewW-24);
    const y = rand(24, viewH-24);
    let obj={type:typePick, x, y, at:t, until:t+this.AMB_LIFE_MS, vx:0, vy:0, data:{}};

    switch(typePick){
      case "bat": {
        obj.y = rand(30, Math.min(140, viewH-30));
        const leftToRight = Math.random()<0.5;
        obj.x = leftToRight ? -30 : viewW+30;
        obj.vx = (leftToRight?1:-1)*rand(0.6,1.2);
        obj.data = {flapHz: rand(4,7), amp: rand(6,12), phase: Math.random()*Math.PI*2};
        break;
      }
      case "coin": {
        obj.data = {spin:0, spinSpd: rand(5,9), bobAmp: rand(4,9), bobHz: rand(1,1.8)};
        break;
      }
      case "spider": {
        obj.x = rand(20, viewW-20);
        obj.y = -10;
        obj.vy = rand(0.2,0.45);
        obj.data = {thread:true, baseY: rand(30, Math.min(140, viewH-30)), sway: rand(2,5), swayHz: rand(0.6,1.2)};
        break;
      }
      case "snake": {
        obj.y = rand(viewH*0.65, viewH-18);
        obj.x = Math.random()<0.5 ? -40 : viewW+40;
        obj.vx = (obj.x<0?1:-1)*rand(0.25,0.5);
        obj.data = {len:rint(8,12), waveAmp:rand(3,7), waveHz:rand(1.2,2.2), dir: (obj.vx>0?1:-1)};
        break;
      }
    }
    this.ambient.push(obj);
  },

  _updateAmbient(ctx,t){
    const W=ctx.canvas.width, H=ctx.canvas.height;

    // spawn irregolare 1–4 minuti
    if(t>=this.nextAmbientAt){
      this._spawnAmbientOne(W,H);
      this._scheduleAmbient();
    }

    // aggiornamento + culling
    this.ambient=this.ambient.filter(o=>{
      if(t>o.until) return false;
      // update posizione semplice
      o.x += o.vx; o.y += o.vy;

      // regole specifiche
      if(o.type==="spider"){
        // scende fino a baseY, poi ondeggia
        const by=o.data.baseY;
        if(o.y<by) { /* ancora in discesa */ }
        else { o.vy=0; // oscillazione laterale
          const tt=(t-o.at)/1000;
          o.x += Math.sin(tt*o.data.swayHz*2*Math.PI)*0.3;
        }
      }
      // culling offscreen (solo se ha velocità orizzontale)
      if((o.type==="bat"||o.type==="snake") && (o.x<-60 || o.x>W+60)) return false;
      return true;
    });
  },

  /* ---------- Disegno ---------- */
  draw(ctx){
    const hasFX = this.events.length>0;
    const t=this.now();
    const offX=this.Cave?.offsetX||0, offY=this.Cave?.offsetY||0;
    const cellX=this.Cave?.cellX||10, cellY=this.Cave?.cellY||10;
    const cell=this._cell();

    // ambient: spawn/aggiorna sempre, anche senza eventi
    this._updateAmbient(ctx,t);

    if(!hasFX && this.ambient.length===0) return;

    // screen-shake cumulativo per FX
    let shakeX=0, shakeY=0;
    if(hasFX){
      for(const ev of this.events){
        const dt=t-ev.shake.t;
        if(dt < this.SHAKE_MS){
          const k=1 - (dt/this.SHAKE_MS);
          const amp = this.SHAKE_MAX * (0.4 + 0.6*ev.f) * k;
          shakeX += (Math.random()*2-1)*amp;
          shakeY += (Math.random()*2-1)*amp;
        }
      }
    }
    if (shakeX||shakeY){ ctx.save(); ctx.translate(shakeX, shakeY); }

    /* ----- FX di impatto ----- */
    if(hasFX){
      for(const ev of this.events){
        const ax=offX+ev.a.x*cellX, ay=offY+ev.a.y*cellY;
        const bx=offX+ev.b.x*cellX, by=offY+ev.b.y*cellY;
        const cx=(ax+bx)/2, cy=(ay+by)/2;

        // FLASH
        const fdt=t-ev.flash.t;
        if(fdt < this.FLASH_MS){
          const a = this.FLASH_ALPHA * (1 - fdt/this.FLASH_MS) * ev.f;
          ctx.save();
          ctx.globalCompositeOperation='lighter';
          const g=ctx.createRadialGradient(cx,cy,0, cx,cy, cell*3.4);
          g.addColorStop(0, `rgba(255,255,200,${a})`);
          g.addColorStop(1, `rgba(255,255,200,0)`);
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,cell*3.4,0,Math.PI*2); ctx.fill();
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
          ctx.lineWidth=2.4;
          ctx.setLineDash([6,6]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // SPARKS con trail sfumato
        for(const sp of ev.sparks){
          const alive = Math.max(0, sp.life - (t-ev.at));
          if(alive<=0) continue;
          sp.dist += sp.sp * (cell*0.16);
          const px = cx + Math.cos(sp.ang)*sp.dist;
          const py = cy + Math.sin(sp.ang)*sp.dist;

          sp.trail.push({x:px,y:py});
          if (sp.trail.length>this.SPARK_TRAIL) sp.trail.shift();

          const alphaHead = clamp(alive/sp.life, 0, 1);
          // disegna la coda con segmenti che sfumano
          for(let i=1;i<sp.trail.length;i++){
            const p0=sp.trail[i-1], p1=sp.trail[i];
            const k=i/(sp.trail.length-1);
            const a = 0.85*alphaHead*k;
            ctx.save();
            ctx.lineCap='round';
            ctx.lineWidth = 1.2 + (1.8*(1-k));
            ctx.strokeStyle = `rgba(255,210,90,${a})`;
            ctx.beginPath();
            ctx.moveTo(p0.x,p0.y);
            ctx.lineTo(p1.x,p1.y);
            ctx.stroke();
            ctx.restore();
          }
        }

        // DUST (gravità+drag)
        for(const d of ev.dust){
          const alive = Math.max(0, d.life - (t-ev.at));
          if(alive<=0) continue;
          d.vx *= this.DUST_DRAG; d.vy = d.vy*this.DUST_DRAG + this.DUST_GRAV*(cell);
          d.x += d.vx; d.y += d.vy;
          const a = Math.max(0.0, Math.min(0.55, alive/this.DUST_FADE_MS)) * (0.5+0.6*ev.f);
          const px=cx + d.x*0.9, py=cy + d.y*0.9;
          ctx.save();
          ctx.globalAlpha=a;
          // piccolo puff circolare più morbido
          const r=1.3 + (1.0*(1 - alive/this.DUST_FADE_MS));
          const g=ctx.createRadialGradient(px,py,0, px,py,r);
          g.addColorStop(0, `rgba(120,100,60,0.85)`);
          g.addColorStop(1, `rgba(120,100,60,0)`);
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
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
    }

    /* ----- Oggetti ambientali (sempre) ----- */
    if(this.ambient.length){
      for(const o of this.ambient){
        switch(o.type){
          case "bat": this._drawBat(ctx,o,t); break;
          case "coin": this._drawCoin(ctx,o,t); break;
          case "spider": this._drawSpider(ctx,o,t); break;
          case "snake": this._drawSnake(ctx,o,t); break;
        }
      }
    }

    if (shakeX||shakeY) ctx.restore();
  },

  /* ---------- Draw helpers per oggetti ambientali ---------- */

  _drawBat(ctx,o,t){
    const W=ctx.canvas.width;
    // aggiornamento volo
    o.data.phase += 0.03*o.data.flapHz;
    const flap = Math.sin(o.data.phase)*o.data.amp;
    // lieve serpentina in y
    o.y += Math.sin(o.data.phase*0.5)*0.2;

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(o.vx>=0?1:-1, 1);

    // corpo
    ctx.fillStyle="#2b2b2b";
    ctx.beginPath();
    ctx.ellipse(0,0,6,4,0,0,Math.PI*2);
    ctx.fill();

    // testa
    ctx.beginPath();
    ctx.ellipse(6,0,3,2.6,0,0,Math.PI*2);
    ctx.fill();

    // ali (triangoli curvi)
    ctx.fillStyle="#1e1e1e";
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.quadraticCurveTo(-10,-6-flap, -18, 2);
    ctx.quadraticCurveTo(-8, -2, 0,0);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.quadraticCurveTo(10,-6-flap, 18, 2);
    ctx.quadraticCurveTo(8, -2, 0,0);
    ctx.fill();

    // occhietto
    ctx.fillStyle="rgba(255,80,60,0.9)";
    ctx.beginPath(); ctx.arc(7, -0.6, 0.8, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  },

  _drawCoin(ctx,o,t){
    const tt=(t-o.at)/1000;
    o.data.spin += o.data.spinSpd*0.04;
    const squish = 0.35 + 0.65*Math.abs(Math.cos(o.data.spin)); // effetto "flip"
    const bob = Math.sin(tt*o.data.bobHz*2*Math.PI)*o.data.bobAmp;

    ctx.save();
    ctx.translate(o.x, o.y + bob);

    // bordo
    ctx.fillStyle="#b8891c";
    ctx.beginPath();
    ctx.ellipse(0,0,7,7*squish,0,0,Math.PI*2);
    ctx.fill();

    // faccia con bagliore
    const grad=ctx.createRadialGradient(-3,-2,0, 0,0,10);
    grad.addColorStop(0,"#ffd66b");
    grad.addColorStop(1,"#c9992a");
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.ellipse(0,0,6,6*squish,0,0,Math.PI*2);
    ctx.fill();

    // highlight
    ctx.globalAlpha=0.5;
    ctx.strokeStyle="rgba(255,255,255,0.9)";
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.ellipse(-2,-2,3,3*squish,0,0,Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha=1;

    ctx.restore();
  },

  _drawSpider(ctx,o,t){
    const tt=(t-o.at)/1000;
    // se non ha ancora raggiunto baseY continua a scendere
    if(o.vy>0 && o.y<o.data.baseY) {
      // ok, scende naturalmente
    } else {
      o.vy=0;
      // lieve oscillazione orizzontale
      o.x += Math.sin(tt*o.data.swayHz*2*Math.PI)*0.2;
    }

    ctx.save();
    // filo
    if(o.data.thread){
      ctx.strokeStyle="rgba(200,200,200,0.45)";
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(o.x, 0);
      ctx.lineTo(o.x, o.y-6);
      ctx.stroke();
    }

    ctx.translate(o.x,o.y);
    // corpo + testa
    ctx.fillStyle="#1d1d1d";
    ctx.beginPath(); ctx.arc(0,0,4.5,0,Math.PI*2); ctx.fill(); // corpo
    ctx.beginPath(); ctx.arc(5,0,3,0,Math.PI*2); ctx.fill();   // testa

    // zampe (4 per lato)
    ctx.strokeStyle="#262626";
    ctx.lineWidth=1;
    const leg=[[-4,-1,-8,-4],[-4,1,-8,4],[-2,-2,-6,-6],[-2,2,-6,6]];
    for(const L of leg){
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(L[0],L[1]); ctx.lineTo(L[2],L[3]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5,0); ctx.lineTo(5-L[0],L[1]); ctx.lineTo(5-(L[2]),L[3]); ctx.stroke();
    }

    ctx.restore();
  },

  _drawSnake(ctx,o,t){
    const tt=(t-o.at)/1000;
    const n=o.data.len;
    const amp=o.data.waveAmp;
    const hz=o.data.waveHz;
    const dir=o.data.dir;

    ctx.save();
    ctx.translate(o.x,o.y);

    ctx.strokeStyle="#2e7d32";
    ctx.lineWidth=3;
    ctx.lineCap="round";
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const x = i*6*dir;
      const y = Math.sin((tt*hz + i*0.5)*2*Math.PI)*amp;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    // testa
    ctx.fillStyle="#2e7d32";
    const hx = (n*6+2)*dir, hy = Math.sin((tt*hz + (n+0.2)*0.5)*2*Math.PI)*amp;
    ctx.beginPath(); ctx.arc(hx,hy,3.5,0,Math.PI*2); ctx.fill();

    // lingua
    ctx.strokeStyle="#b71c1c";
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(hx+6*dir, hy+ (Math.sin(tt*8)*1.2)); ctx.stroke();

    ctx.restore();
  }
};

window.GoblinCrash=Crash;
})();
