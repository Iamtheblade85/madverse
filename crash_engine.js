(()=>{"use strict";
const Crash={
  Cave:null,events:[],grid:new Map(),now:()=>performance.now(),
  MIN_DIST:0.8,RESOLVE_PUSH:0.55,PAUSE_MS:[220,420],LIFETIME_MS:20000,STAR_COUNT:9,STAR_SPREAD:0.6,STAR_RATE:0.015,
  init(CaveRef){
    this.Cave=CaveRef;
    const st=document.createElement("style");
    st.textContent='@keyframes gc-pop{0%{transform:scale(.8);opacity:0}100%{transform:scale(1);opacity:1}}';
    document.head.appendChild(st);
  },
  _cell(){return Math.min(this.Cave.cellX,this.Cave.cellY)||10},
  _key(x,y,s){return ((x/s)|0)+":"+((y/s)|0)},
  _buildGrid(){
    this.grid.clear();
    const s=this._cell();
    for(const g of this.Cave.goblins){
      const k=this._key(g.x,g.y,1);
      let a=this.grid.get(k); if(!a){a=[];this.grid.set(k,a)} a.push(g);
    }
  },
  _pairId(a,b){const x=String(a.wax_account||"")+":"+String(a.x.toFixed(2))+","+String(a.y.toFixed(2))+"|"+String(b.wax_account||"")+":"+String(b.x.toFixed(2))+","+String(b.y.toFixed(2));return x},
  _ensureEvent(a,b){
    const id=this._pairId(a,b);
    let ev=this.events.find(e=>e.id===id);
    if(!ev){
      const t=this.now();
      ev={id,at:t,until:t+this.LIFETIME_MS,a,b,stars:[],label:null,lastStar:t};
      this.events.push(ev);
    }
    return ev;
  },
  _spawnStars(ev){
    const t=this.now();
    if(t-ev.lastStar<1/this.STAR_RATE) return;
    ev.lastStar=t;
    const n=this.STAR_COUNT;
    ev.stars.length=0;
    for(let i=0;i<n;i++){
      const r=Math.random()*this.STAR_SPREAD;
      const ang=Math.random()*Math.PI*2;
      ev.stars.push({dx:Math.cos(ang)*r,dy:Math.sin(ang)*r,r:0.12+Math.random()*0.18,rot:Math.random()*Math.PI*2,vr:0.08+Math.random()*0.28});
    }
  },
  _resolve(a,b){
    const dx=b.x-a.x,dy=b.y-a.y;
    let d=Math.hypot(dx,dy);
    if(d===0){d=0.0001}
    const min=this.MIN_DIST;
    if(d>=min) return false;
    const overlap=min-d;
    const nx=dx/d,ny=dy/d;
    const push=overlap*this.RESOLVE_PUSH;
    a.x-=nx*push; a.y-=ny*push;
    b.x+=nx*push; b.y+=ny*push;
    const t=this.now();
    const p1=Math.floor(this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]));
    const p2=Math.floor(this.PAUSE_MS[0]+Math.random()*(this.PAUSE_MS[1]-this.PAUSE_MS[0]));
    a.pauseTil=Math.max(a.pauseTil||0,t+p1);
    b.pauseTil=Math.max(b.pauseTil||0,t+p2);
    a.digging=false; b.digging=false;
    return true;
  },
  onAfterMove(){
    if(!this.Cave||!Array.isArray(this.Cave.goblins)||!this.Cave.goblins.length) return;
    this._buildGrid();
    const checked=new Set();
    for(const [k,arr] of this.grid){
      for(let i=0;i<arr.length;i++){
        const g=arr[i];
        for(let j=i+1;j<arr.length;j++){
          const h=arr[j];
          const pid=g===h?null:(g.x<=h.x?g:h);
          const qid=g===h?null:(g.x<=h.x?h:g);
          if(pid&&qid){
            const mark=pid===g?this._pairId(pid,qid):this._pairId(qid,pid);
            if(checked.has(mark)) continue;
            checked.add(mark);
          }
          if(this._resolve(g,h)){
            const ev=this._ensureEvent(g,h);
            ev.until=this.now()+this.LIFETIME_MS;
            this._spawnStars(ev);
          }
        }
      }
    }
    const t=this.now();
    this.events=this.events.filter(e=>t<=e.until);
  },
  draw(ctx){
    if(!this.events.length) return;
    const offX=this.Cave.offsetX||0,offY=this.Cave.offsetY||0;
    const cellX=this.Cave.cellX||10,cellY=this.Cave.cellY||10;
    const cell=this._cell();
    const t=this.now();
    for(const ev of this.events){
      const ax=offX+ev.a.x*cellX, ay=offY+ev.a.y*cellY;
      const bx=offX+ev.b.x*cellX, by=offY+ev.b.y*cellY;
      const cx=(ax+bx)/2, cy=(ay+by)/2;
      const life=Math.max(0,ev.until-t);
      const fade=Math.min(1,life/600);
      this._spawnStars(ev);
      for(const s of ev.stars){
        s.rot+=s.vr;
        const px=cx+s.dx*cellX, py=cy+s.dy*cellY;
        this._star(ctx,px,py,s.r*cell,fade);
      }
      this._bubble(ctx,cx,cy-1.2*cell,"CRASH",fade);
    }
  },
  _star(ctx,x,y,r,alpha){
    const spikes=5,step=Math.PI/spikes;
    ctx.save();
    ctx.globalAlpha=0.75*alpha;
    ctx.beginPath();
    ctx.moveTo(x,y-r);
    for(let i=0;i<spikes;i++){
      ctx.lineTo(x+Math.cos((i*2+1)*step)*r*0.5,y+Math.sin((i*2+1)*step)*r*0.5);
      ctx.lineTo(x+Math.cos((i+1)*2*step)*r,y+Math.sin((i+1)*2*step)*r);
    }
    ctx.closePath();
    ctx.fillStyle="#ffe600";
    ctx.strokeStyle="rgba(0,0,0,.55)";
    ctx.lineWidth=Math.max(1,r*0.25);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  _bubble(ctx,x,y,text,alpha){
    const padX=10,padY=6;
    ctx.save();
    ctx.font=`900 ${Math.max(12,Math.floor(this._cell()*0.9))}px Orbitron, system-ui, sans-serif`;
    const w=ctx.measureText(text).width;
    const bw=w+padX*2,bh=padY*2+this._cell()*0.9;
    const rx=x-bw/2, ry=y-bh-8;
    ctx.globalAlpha=0.90*alpha;
    this._roundRect(ctx,rx,ry,bw,bh,10);
    const grd=ctx.createLinearGradient(0,ry,0,ry+bh);
    grd.addColorStop(0,"rgba(255,240,140,.98)");
    grd.addColorStop(1,"rgba(255,204,0,.98)");
    ctx.fillStyle=grd;
    ctx.strokeStyle="rgba(40,30,0,.65)";
    ctx.lineWidth=2;
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha=alpha;
    ctx.fillStyle="#1a1200";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillText(text,x,ry+bh/2);
    const tipW=14,tipH=10;
    ctx.beginPath();
    ctx.moveTo(x,ry+bh+2);
    ctx.lineTo(x-tipW/2,ry+bh-6);
    ctx.lineTo(x+tipW/2,ry+bh-6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  _roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
};
window.GoblinCrash=Crash;
})();
