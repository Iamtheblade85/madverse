/* =========================================================================================
   Dwarfs Cave — Game Frontend Runtime (ULTRA build, EN-only)
   Fileset:  index2.html  +  styles_goblin_game.css  +  app.js (this file)
   -----------------------------------------------------------------------------------------
   What’s inside
   - Canvas scene (16:9) with one RAF, HiDPI, cached background, SSE live events.
   - Expeditions with selectable durations: 10m/30m/1h/6h/24h and multipliers
     (2.0 / 1.3 / 1.0 / 0.7 / 0.4).
   - Reward tokens are fully dynamic (accepted exactly as the backend sends them).
   - Chest & Expedition rewards: tokens, NFTs, and **consumables** (supported & rendered).
   - 8 Equipment slots per Goblin (NFT equipment you own, passed from backend) with categories:
        Boost Reward, Boost Speed, Boost Resistance, Boost Accuracy.
     Rarity: Common/Rare/Epic/Legendary/Mythic, Levels 1–5.
     RULES:
       • A unique NFT (asset_id) can be equipped on only one goblin at a time (global uniqueness).
       • The **same template** (same schema_name + template_id) **cannot** be present on multiple
         slots of the **same goblin**, even if you own multiple copies. (Allowed across different
         goblins if you own multiple.)
   - Consumables (new gamification):
       • Inventory with quantities.
       • Up to 3 expedition-wide consumables per run + optional 1 per goblin.
       • Consumables can also be **won** from chests/expeditions and will show immediately.
       • Effects and calculus remain server-driven; frontend sends selections if provided.
   - Season Pass page runtime:
       • Points come from expeditions/chests/consumables used/equipment installed (server-calculated).
       • Full progress view, dual track (Standard & ELITE), tier cards, claim buttons, states:
         “Frozen” (locked), “Claimed” (fiery), and “Claimable” with button.
       • Global leaderboard for the active season.
   - Robust networking (timeouts, retries), visibility-aware polling, a11y, safe escaping, dedup.
   -----------------------------------------------------------------------------------------
   API NOTES (best-effort, server is source of truth):
   - /user_nfts → array of user items including:
       { type: "goblin" | "equipment" | "consumable",
         asset_id, name, img, rarity, level, category, quantity,
         schema_name, template_id, equipped_to, slot, ... }
   - /start_expedition:
       {
         wax_account, user_id, usx_token,
         goblin_ids: string[],
         duration_key, duration_minutes, multiplier,
         equipment_by_goblin: { [goblinId]: {slot, asset_id}[] },
         consumables_exp: {asset_id, qty}[],
         consumables_by_goblin: { [goblinId]: {asset_id, qty}[] }
       }
   - /all_expeditions, /recent_expeditions, /recent_winners
   - /try_chest_perk, /check_perk_command, /spawn_chest, /claim_chest
   - /expedition_status, /end_expedition
   - /set_equipment (optional convenience for saving per-goblin equipment)
   - Season Pass:
       GET /season_pass/status
       POST /season_pass/claim  { reward_id }
       GET /season_pass/leaderboard
   ========================================================================================= */

(() => {
  "use strict";

  // -----------------------------------
  // Config
  // -----------------------------------
  const BASE_URL = window.BASE_URL || "https://iamemanuele.pythonanywhere.com";

  // Canvas grid (16:9)
  const GRID_COLS = 90;
  const GRID_ROWS = Math.round(GRID_COLS * 9 / 16); // ~51
  const MARGIN_PCT = 0.15; // safe area

  // Refresh intervals
  const GLOBAL_REFRESH_MS = 23000;
  const COMMAND_POLL_MS = 31000;

  // UI caps
  const MAX_RECENT_EXPEDITIONS = 10;
  const MAX_BONUS_ROWS = 12;

  // Trails
  const TRAIL_LEN = 18;
  const TRAIL_MIN_DIST = 0.6;

  // Durations & multipliers
  const DURATIONS = {
    "10m": { minutes: 10,   multiplier: 2.0,  label: "10m (2.0×)" },
    "30m": { minutes: 30,   multiplier: 1.3,  label: "30m (1.3×)" },
    "1h" : { minutes: 60,   multiplier: 1.0,  label: "1h (1.0×)" },
    "6h" : { minutes: 360,  multiplier: 0.7,  label: "6h (0.7×)" },
    "24h": { minutes: 1440, multiplier: 0.4,  label: "24h (0.4×)" }
  };
  const DEFAULT_DURATION_KEY = (JSON.parse(localStorage.getItem("caveDuration"))?.key) || "1h";

  // Equipment categories
  const EQUIP_CATEGORIES = ["Boost Reward","Boost Speed","Boost Resistance","Boost Accuracy"];

  // Consumable limits
  const CONSUMABLE_LIMIT_EXPEDITION = 3; // expedition-wide
  const CONSUMABLE_LIMIT_PER_GOBLIN = 1; // per goblin

  const COLOR_PALETTE = ['#ffd700','#00ffff','#ff69b4','#7fff00','#ffa500','#00ff7f','#ff4500'];

  const DEBUG = false;
  const log = (...a) => DEBUG && console.log("[CAVE]", ...a);

  // -----------------------------------
  // State
  // -----------------------------------
  const Cave = {
    // canvas
    canvas: null, ctx: null, dpr: Math.max(1, window.devicePixelRatio || 1),
    rafId: null, running: false,
    bgCache: null,

    // grid
    gridW: 0, gridH: 0, cellX: 10, cellY: 10, cell: 10, offsetX: 0, offsetY: 0,

    // assets
    assets: {
      loaded: false,
      goblin: null, shovel: null, chest: null, bg: null,
      perks: { dragon: null, dwarf: null, skeleton: null, black_cat: null }
    },

    // entities
    goblins: [],
    perks: [],
    chests: new Map(),

    // timers
    intervals: { global: null, globalCountdown: null, command: null },

    // dedup
    recentExpKeys: new Set(),
    bonusKeys: new Set(),
    inFlightClaims: new Set(),

    // visibility
    visible: !document.hidden,

    // user
    user: {
      wax_account: window.userData?.wax_account || "",
      user_id: window.userData?.userId || "",
      usx_token: window.userData?.usx_token || ""
    },

    // UI refs (populated by renderDwarfsCave / renderSeasonPass)
    el: {
      // cave page
      toast: null, videoOrCanvas: null,
      globalCards: null, recentGrid: null, bonusGrid: null,
      search: null, rarity: null, power: null, powerVal: null,
      sortSegment: null, durationSegment: null,
      goblinList: null, selectionSummary: null, activeFilters: null,
      chestPerkBtn: null, expConsPanel: null,

      // season pass page
      seasonRoot: null
    },

    // selection & filters
    selectedGoblinIds: new Set(),
    sortBy: "rarity",
    filterQuery: "",
    filterRarity: "",
    minPower: 0,
    selectedDurationKey: DEFAULT_DURATION_KEY,

    // inventories
    equipmentInventory: [],
    equipmentIndex: new Map(),         // asset_id -> equipment item
    equippedGlobal: new Map(),         // asset_id -> { goblin_id, slot }
    equipmentByGoblin: new Map(),      // goblinId -> Array(8) asset_id|null

    consumablesInventory: [],
    consumableIndex: new Map(),        // asset_id -> consumable item
    expConsumables: new Map(),         // asset_id -> qty (expedition-wide)
    goblinConsumables: new Map(),      // goblinId -> [{asset_id, qty}] (max 1)

    // season pass cache
    seasonData: null,
    seasonLeaderboard: null,
  };

  // -----------------------------------
  // Utils
  // -----------------------------------
  const qs  = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));
  const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  const timeHM = (d=new Date()) => d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const safe = (v) => (v==null) ? "" : String(v).replace(/[&<>"'`]/g, (m)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[m]));
  const rarityKey = (r="") => String(r).toLowerCase();

  function bounds(){
    const minX = Math.floor(GRID_COLS * MARGIN_PCT);
    const maxX = Math.ceil(GRID_COLS * (1 - MARGIN_PCT)) - 1;
    const minY = Math.floor(GRID_ROWS * MARGIN_PCT);
    const maxY = Math.ceil(GRID_ROWS * (1 - MARGIN_PCT)) - 1;
    return {minX, maxX, minY, maxY};
  }
  function colorByIndex(i){ return COLOR_PALETTE[i % COLOR_PALETTE.length]; }

  function tokensFromAny(reward){
    // accept any token map without enforcing keys
    const t = (reward?.stats?.tokens) || reward?.tokens || {};
    return (t && typeof t === "object") ? t : {};
  }
  function countConsumablesFromAny(reward){
    // support formats: reward.consumables = array or map {id:qty}
    if (Array.isArray(reward?.consumables)) return reward.consumables.length;
    const obj = reward?.consumables;
    if (obj && typeof obj === "object") return Object.values(obj).reduce((a,b)=>a + Number(b||0), 0);
    return 0;
  }
  function tokensSummaryText(toks){
    const ents = Object.entries(toks || {}).filter(([,v]) => Number(v) > 0);
    if (!ents.length) return "0 tokens";
    const parts = ents.map(([k,v])=>`${v} ${k}`);
    return parts.length>2 ? `${parts[0]} +${parts.length-1}` : parts.join(" · ");
  }

  function toast(msg, type="ok", ttl=6000){
    const host = Cave.el.toast; if (!host) return;
    const div = document.createElement("div");
    div.className = `cv-toast ${type}`;
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), ttl);
  }

  function restoreUser(){
    const mem = window.userData || JSON.parse(localStorage.getItem("userData") || "{}");
    Cave.user.wax_account = mem?.wax_account || "";
    Cave.user.user_id     = (mem?.user_id ?? mem?.userId) || "";
    Cave.user.usx_token   = mem?.usx_token || "";
  }
  function assertAuth(){
    if (!Cave.user.wax_account || !Cave.user.user_id || !Cave.user.usx_token) {
      throw new Error("Missing auth data. Please log in.");
    }
  }

  // template key helper for “identical equipment” rule
  function templateKey(it){
    const schema = it?.schema_name ?? it?.schema ?? "";
    const tid = it?.template_id ?? it?.template ?? "";
    return `${schema}::${tid}`;
  }
  function hasSameTemplateEquipped(gId, candidateIt, excludeSlotIdx = -1){
    if (!candidateIt) return false;
    const key = templateKey(candidateIt);
    const slots = Cave.equipmentByGoblin.get(gId) || [];
    for (let i=0;i<slots.length;i++){
      if (i === excludeSlotIdx) continue;
      const assetId = slots[i];
      if (!assetId) continue;
      const eqIt = Cave.equipmentIndex.get(assetId);
      if (!eqIt) continue;
      if (templateKey(eqIt) === key) return true;
    }
    return false;
  }

  // -----------------------------------
  // Network
  // -----------------------------------
  async function fetchJSON(url, opts = {}, timeout = 15000){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort("timeout"), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      const txt = await res.text();
      let data; try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
      return { ok: res.ok, status: res.status, data };
    } catch(err){
      if (err?.name === "AbortError") return { ok:false, status:499, aborted:true, data:{error:"timeout"} };
      throw err;
    } finally { clearTimeout(t); }
  }
  async function fetchWithRetry(path, opts={}, tries=1, timeout=15000){
    let attempt=0, last;
    while (attempt<=tries){
      last = await fetchJSON(`${BASE_URL}${path}`, opts, timeout);
      if (last.ok || last.aborted) return last;
      attempt++;
      await new Promise(r=>setTimeout(r, 300 + attempt*300));
    }
    return last;
  }
  const API = {
    get: (path, t=15000) => fetchJSON(`${BASE_URL}${path}`, {}, t),
    post: (path, body, t=15000) =>
      fetchWithRetry(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body||{}) }, 1, t),
  };

  // -----------------------------------
  // Assets
  // -----------------------------------
  function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
  async function loadAssets(){
    if (Cave.assets.loaded) return;
    const [goblin, shovel, chest, bg, dragon, dwarf, skeleton, black_cat] = await Promise.all([
      loadImg("goblin.png"),
      loadImg("shovel_sprite.png"),
      loadImg("chest.png"),
      loadImg("cave-grid.png"),
      loadImg("perk_dragon.png"),
      loadImg("perk_dwarf.png"),
      loadImg("perk_skeleton.png"),
      loadImg("perk_blackcat.png")
    ]);
    Object.assign(Cave.assets, { goblin, shovel, chest, bg });
    Object.assign(Cave.assets.perks, { dragon, dwarf, skeleton, black_cat });
    Cave.assets.loaded = true;
    buildBGCache();
  }
  function buildBGCache(){
    if (!Cave.canvas || !Cave.assets.bg?.complete) return;
    const w = Math.max(1, Math.floor(Cave.gridW));
    const h = Math.max(1, Math.floor(Cave.gridH));
    try{
      const can = ('OffscreenCanvas' in window) ? new OffscreenCanvas(w, h) : document.createElement('canvas');
      can.width = w; can.height = h;
      const cx = can.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(Cave.assets.bg, 0, 0, Cave.assets.bg.width, Cave.assets.bg.height, 0, 0, w, h);
      Cave.bgCache = can;
    }catch{ Cave.bgCache = null; }
  }

  // -----------------------------------
  // SSE
  // -----------------------------------
  function initRealtime(){
    if (Cave._es) return;
    try {
      const es = new EventSource(`${BASE_URL}/events`);
      es.onmessage = (ev)=>{
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "chest_spawned") {
          const {minX,maxX,minY,maxY} = bounds();
          upsertChest({
            id: String(msg.chest_id),
            x: clamp(msg.x, minX, maxX),
            y: clamp(msg.y, minY, maxY),
            from: msg.perk_type || "unknown",
            wax_account: msg.wax_account || "",
            taken:false, claimable:true, pending:false
          });
          toast(`Chest #${safe(msg.chest_id)} spawned by ${safe(msg.wax_account)}`, "ok");
        }
        if (msg.type === "chest_claimed") {
          Cave.chests.delete(String(msg.chest_id));
          toast(`Chest #${safe(msg.chest_id)} claimed by ${safe(msg.claimed_by)}`, "warn");
        }
      };
      es.onerror = ()=> log("SSE reconnect/error");
      Cave._es = es;
      window.addEventListener("beforeunload", ()=> es.close(), { once:true });
    } catch(err){ log("SSE init fail", err); }
  }

  // -----------------------------------
  // Canvas
  // -----------------------------------
  function setupCanvas(c){
    Cave.canvas = c; Cave.ctx = c.getContext("2d");
    resizeCanvas();
    observeCanvasVisibility();
    observeContainerResize();
    window.addEventListener("resize", resizeCanvas, { passive:true });
  }
  function resizeCanvas(){
    const c=Cave.canvas; if(!c || !c.parentElement) return;
    const cssW = c.parentElement.clientWidth;
    const cssH = Math.floor(cssW * 9/16);
    c.style.width  = `${cssW}px`;
    c.style.height = `${cssH}px`;
    c.width  = Math.floor(cssW * Cave.dpr);
    c.height = Math.floor(cssH * Cave.dpr);
    Cave.ctx.setTransform(Cave.dpr,0,0,Cave.dpr,0,0);
    Cave.ctx.imageSmoothingEnabled = false; Cave.ctx.imageSmoothingQuality="low";
    Cave.gridW = cssW; Cave.gridH = cssH; Cave.offsetX = 0; Cave.offsetY = 0;
    Cave.cellX = Cave.gridW / GRID_COLS; Cave.cellY = Cave.gridH / GRID_ROWS; Cave.cell = Math.min(Cave.cellX, Cave.cellY);
    buildBGCache();
  }
  function observeCanvasVisibility(){
    if (!('IntersectionObserver' in window) || !Cave.canvas) return;
    Cave._io?.disconnect?.();
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if (e.isIntersecting){ startRAF(); startCommandPolling(); }
        else { stopRAF(); stopCommandPolling(); }
      });
    }, {threshold:0.01});
    io.observe(Cave.canvas); Cave._io = io;
  }
  function observeContainerResize(){
    const host = Cave.canvas?.parentElement;
    if (!('ResizeObserver' in window) || !host) return;
    Cave._ro?.disconnect?.();
    const ro = new ResizeObserver(()=> resizeCanvas());
    ro.observe(host); Cave._ro = ro;
  }
  function clearCanvas(){
    const {ctx,canvas} = Cave;
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.restore();
  }
  function drawBG(){
    const {ctx,bgCache,assets,gridW,gridH,offsetX,offsetY} = Cave;
    if (bgCache) ctx.drawImage(bgCache, offsetX, offsetY);
    else if (assets.bg?.complete) ctx.drawImage(assets.bg, 0,0, assets.bg.width, assets.bg.height, offsetX, offsetY, gridW, gridH);
  }
  function hexToRgba(hex, a=1){
    const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex||"#ffe600");
    const r=m?parseInt(m[1],16):255, g=m?parseInt(m[2],16):230, b=m?parseInt(m[3],16):0;
    return `rgba(${r},${g},${b},${a})`;
  }
  function drawGoblinTrail(g){
    if (!g.trail || g.trail.length<2) return;
    const ctx=Cave.ctx, t=g.trail;
    ctx.save(); ctx.lineCap="round"; ctx.lineWidth = Math.max(1, Math.min(Cave.cellX,Cave.cellY)*.18);
    for(let i=0;i<t.length-1;i++){
      const a=t[i], b=t[i+1], alpha = (1 - i/t.length) * .82;
      ctx.strokeStyle = hexToRgba(g.color||"#ffe600", alpha);
      ctx.beginPath();
      ctx.moveTo(Cave.offsetX + a.x*Cave.cellX, Cave.offsetY + a.y*Cave.cellY);
      ctx.lineTo(Cave.offsetX + b.x*Cave.cellX, Cave.offsetY + b.y*Cave.cellY);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawChests(){
    if (!Cave.assets.chest?.complete) return;
    const {ctx,assets} = Cave;
    Cave.chests.forEach(ch=>{
      if (ch.taken) return;
      const cx = Cave.offsetX + ch.x*Cave.cellX;
      const cy = Cave.offsetY + ch.y*Cave.cellY;
      const w = assets.chest.width * .45, h = assets.chest.height * .45;
      ctx.drawImage(assets.chest, cx - w/2, cy - h/2, w, h);
    });
  }
  function drawGoblin(g){
    const {ctx,assets} = Cave;
    const cell = Math.min(Cave.cellX, Cave.cellY);
    const px = Cave.offsetX + g.x*Cave.cellX, py = Cave.offsetY + g.y*Cave.cellY;

    drawGoblinTrail(g);

    const gSize = cell*5, gOff = (gSize-cell)/2;
    if (assets.goblin?.complete) ctx.drawImage(assets.goblin, px-gOff, py-gOff, gSize, gSize);

    // label
    ctx.font = `${Math.max(10, cell*.9)}px Orbitron, system-ui, sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    const labelW=cell*2.2, labelH=cell*.8, footY=py+(gSize/2), margin=cell*.25;
    let boxX=px - labelW/2, boxY = footY + margin;
    boxX = Math.max(0, Math.min(boxX, Cave.gridW-labelW));
    boxY = Math.max(0, Math.min(boxY, Cave.gridH-labelH));
    ctx.fillStyle="rgba(0,0,0,.65)"; ctx.fillRect(boxX,boxY,labelW,labelH);
    ctx.fillStyle=g.color||"#ffe600"; ctx.fillText(g.wax_account, boxX+labelW/2, boxY+labelH/2);

    // shovel anim
    if (g.digging){
      const frames=6, fw=assets.shovel.width/frames, fh=assets.shovel.height, sx=g.shovelFrame*fw;
      const sSize=24, m2=2, top=py-(gSize/2), dx=px-(sSize/2), dy=top-m2-sSize;
      ctx.drawImage(assets.shovel, sx,0,fw,fh, dx,dy, sSize,sSize);
    }
  }
  function drawPerksAndAdvance(){
    if (!Cave.perks.length) return;
    const {minX,maxX,minY,maxY} = bounds();
    for (let p of Cave.perks){
      if (!p.image?.complete) continue;
      p.tick++; if (p.tick>=p.frameDelay){ p.tick=0; p.frame=(p.frame+1)%p.frames; }
      const wy = p.waveY(p.x);
      const px = Cave.offsetX + p.x*Cave.cellX;
      const py = Cave.offsetY + wy*Cave.cellY;
      if (p.x<minX-1 || p.x>maxX+1 || wy<minY-1 || wy>maxY+1){ p.done=true; continue; }
      const srcW=p.image.width/p.frames, srcH=p.image.height, sx=Math.floor(p.frame)*srcW;
      Cave.ctx.drawImage(p.image, sx,0,srcW,srcH, px-16,py-16, 32,32);

      // single drop chance
      if (!p.hasDropped && Math.random()<0.25){
        p.hasDropped=true;
        const dx=randInt(minX,maxX), dy=randInt(minY,maxY);
        const chest = { id:null, x:dx, y:dy, from:p.perkName, wax_account:p.wax_account, taken:false, claimable:false, pending:true };
        API.post("/spawn_chest", { wax_account:p.wax_account, perk_type:p.perkName, x:dx, y:dy }, 12000)
          .then(r=>{
            if (r.ok && r?.data?.chest_id!=null){ chest.id=String(r.data.chest_id); chest.pending=false; chest.claimable=true; upsertChest(chest); }
            else { chest.pending=false; chest.claimable=false; }
          }).catch(()=>{ chest.pending=false; chest.claimable=false; });
      }
      p.x += p.dir==="left-to-right" ? p.speed : -p.speed;
      if (p.x<minX-1 || p.x>maxX+1) p.done=true;
    }
    Cave.perks = Cave.perks.filter(p=>!p.done);
  }

  // -----------------------------------
  // Loop
  // -----------------------------------
  let lastTS = performance.now();
  function tick(ts){
    if(!Cave.running) return;
    const dt = ts-lastTS; lastTS = ts;
    clearCanvas(); drawBG(); drawPerksAndAdvance(); drawChests();
    Cave.goblins.forEach(moveGoblin); Cave.goblins.forEach(drawGoblin);
    updateGoblinAnim(dt);
    Cave.rafId = requestAnimationFrame(tick);
  }
  function startRAF(){ if (Cave.running || !Cave.canvas) return; Cave.running=true; lastTS=performance.now(); Cave.rafId=requestAnimationFrame(tick); }
  function stopRAF(){ Cave.running=false; if(Cave.rafId) cancelAnimationFrame(Cave.rafId); Cave.rafId=null; }

  // -----------------------------------
  // Goblin movement/claim
  // -----------------------------------
  function genPath(x1,y1,x2,y2){ const p=[]; let cx=x1, cy=y1; while(cx!==x2 || cy!==y2){ if(cx!==x2) cx += x2>cx?1:-1; else if(cy!==y2) cy += y2>cy?1:-1; p.push([cx,cy]); } return p; }
  function moveGoblin(g){
    if (g.digging){ tryClaimNearby(g); return; }
    if (!g.path.length){
      const {minX,maxX,minY,maxY} = bounds();
      g.path = genPath(g.x,g.y, randInt(minX,maxX), randInt(minY,maxY));
    }
    const [nx,ny] = g.path.shift();
    const {minX,maxX,minY,maxY} = bounds();
    g.x = Math.min(maxX, Math.max(minX, nx));
    g.y = Math.min(maxY, Math.max(minY, ny));

    // trail
    if (g._lastTrailX==null || g._lastTrailY==null){
      g.trail=[{x:g.x,y:g.y}]; g._lastTrailX=g.x; g._lastTrailY=g.y;
    } else {
      const dx = g.x-g._lastTrailX, dy=g.y-g._lastTrailY;
      if ((dx*dx+dy*dy) >= (TRAIL_MIN_DIST*TRAIL_MIN_DIST)){
        g.trail.unshift({x:g.x,y:g.y});
        g._lastTrailX=g.x; g._lastTrailY=g.y;
        if (g.trail.length>TRAIL_LEN) g.trail.pop();
      }
    }

    if (!g.path.length){
      g.digging=true; g.shovelFrame=0; g.frameTimer=0;
      g.trail = g.trail.slice(0, Math.ceil(TRAIL_LEN/2));
      tryClaimNearby(g);
      setTimeout(()=> g.digging=false, 2000);
    }
  }
  function updateGoblinAnim(delta){
    Cave.goblins.forEach(g=>{
      if (!g.digging) return;
      g.frameTimer += delta;
      if (g.frameTimer>=100){ g.shovelFrame=(g.shovelFrame+1)%6; g.frameTimer=0; }
    });
  }
  function tryClaimNearby(g){
    Cave.chests.forEach((ch, key)=>{
      const inside2x2 = (g.x >= ch.x && g.x <= ch.x + 1) && (g.y >= ch.y && g.y <= ch.y + 1);
      if (g.digging && inside2x2 && ch.claimable && !ch.taken && !ch.claiming){
        if (ch.id != null){
          const cid = String(ch.id);
          if (Cave.inFlightClaims.has(cid)) return;
          Cave.inFlightClaims.add(cid);
        }
        ch.claiming=true; ch.taken=true; ch.taken_by=g.wax_account;
        (async()=>{
          try{
            restoreUser(); assertAuth();
            if (!ch.id || isNaN(Number(ch.id))) return;
            const rs = await API.post("/claim_chest", { wax_account:g.wax_account, chest_id:Number(ch.id) }, 15000);
            if (rs.status===409){
              Cave.chests.delete(key);
              toast(`Chest #${safe(ch.id)} already claimed${rs.data?.claimed_by?` by ${safe(rs.data.claimed_by)}`:""}.`,"warn");
              return;
            }
            if (!rs.ok) throw new Error(`HTTP ${rs.status}`);
            const reward = rs.data;
            const toks = tokensFromAny(reward);
            const nfts = Array.isArray(reward?.nfts) ? reward.nfts.length : 0;
            const cons = countConsumablesFromAny(reward);

            if (!Object.values(toks).some(v=>Number(v)>0) && nfts===0 && cons===0)
              toast(`${g.wax_account} opened Chest #${safe(ch.id)} (${ch.from})… it was empty.`, "warn");
            else
              toast(`${g.wax_account} won ${tokensSummaryText(toks)}, ${nfts} NFT(s), ${cons} consumable(s) from Chest #${safe(ch.id)} (${ch.from})!`, "ok");

            // reflect new winners UI
            if (Array.isArray(reward?.winners)) renderBonusListFromBackend(reward.winners);
            else appendBonusReward({ ...reward, chest_id: ch.id }, g.wax_account, ch.from);

            // optimistic inventory add for consumables (if structure is provided)
            tryUpdateConsumablesFromReward(reward);

            Cave.chests.delete(key);
          } catch(e){
            ch.taken=false; ch.claiming=false;
            toast(`Chest reward failed: ${e.message}`, "err");
          } finally {
            if (ch.id != null) Cave.inFlightClaims.delete(String(ch.id));
          }
        })();
      }
    });
  }

  // optimistic consumables update (best-effort)
  function tryUpdateConsumablesFromReward(reward){
    const arr = Array.isArray(reward?.consumables) ? reward.consumables : null;
    const obj = !arr && reward?.consumables && typeof reward.consumables === "object" ? reward.consumables : null;
    if (!arr && !obj) return;

    const addOne = (c) => {
      // try to match by asset_id or by template key if provided
      const assetId = c.asset_id || c.id || null;
      const schema = c.schema_name || c.schema || null;
      const tid = c.template_id || c.template || null;
      const name = c.name || c.title || (assetId || `${schema||""}:${tid||""}`);
      const qty = Number(c.qty || c.quantity || 1);

      // find existing by asset_id OR (schema+template) fallback
      let found = null;
      if (assetId && Cave.consumableIndex.has(assetId)) {
        found = Cave.consumableIndex.get(assetId);
        found.quantity = Number(found.quantity||0) + qty;
      } else {
        // try to find by same template
        const key = `${schema||""}::${tid||""}`;
        for (const item of Cave.consumablesInventory){
          const k2 = `${item.schema_name||""}::${item.template_id||""}`;
          if (k2 === key){ found = item; found.quantity = Number(found.quantity||0) + qty; break; }
        }
      }
      if (!found){
        // add new as generic inventory entry
        const newItem = {
          type:"consumable",
          asset_id: assetId || `temp::${Date.now()}::${Math.random().toString(16).slice(2)}`,
          name, quantity: qty,
          schema_name: schema, template_id: tid,
          rarity: c.rarity || "Common",
          level: c.level || 1,
          category: c.category || "Boost",
          img: c.img || c.image || "consumable.png"
        };
        Cave.consumablesInventory.push(newItem);
        Cave.consumableIndex.set(newItem.asset_id, newItem);
      }
    };

    if (arr){
      arr.forEach(addOne);
    } else if (obj){
      Object.entries(obj).forEach(([id,qty])=> addOne({ asset_id:id, quantity:qty }));
    }

    // refresh UI panels if present
    if (Cave.el.expConsPanel) renderExpConsumablesPanel();
    // also refresh any open goblin consumable panels
    Cave.selectedGoblinIds.forEach(gid=>{
      const card = qs(`.cv-gob-card[data-id="${CSS.escape(gid)}"]`);
      if (card){ const panel=card.querySelector(".cv-cons-panel"); if (panel) panel.replaceWith(renderConsumablePanelForGoblin(gid)); }
    });
  }

  // -----------------------------------
  // Chests helpers
  // -----------------------------------
  function chestKey(ch){ return ch.id ? String(ch.id) : `${ch.wax_account}|${ch.from}|${ch.x}|${ch.y}`; }
  function upsertChest(ch){
    const k=chestKey(ch), ex=Cave.chests.get(k);
    Cave.chests.set(k, ex ? {...ex, ...ch} : ch);
  }
  function clearChests(){ Cave.chests.clear(); }

  // -----------------------------------
  // Perks
  // -----------------------------------
  function triggerPerk(perkName, wax_account){
    if (!Cave.assets.loaded || !Cave.canvas) return;
    const pack = {
      dragon:   {img:Cave.assets.perks.dragon,   frames:6},
      dwarf:    {img:Cave.assets.perks.dwarf,    frames:6},
      skeleton: {img:Cave.assets.perks.skeleton, frames:6},
      black_cat:{img:Cave.assets.perks.black_cat,frames:6},
    }[perkName] || {img:Cave.assets.perks.dragon,frames:6};
    if (!pack.img?.complete) return;

    const dir = Math.random()<.5 ? "left-to-right":"right-to-left";
    const {minX,maxX,minY,maxY} = bounds();
    const amp  = 3 + Math.random()*4;
    const freq = 0.15 + Math.random()*0.15;
    const startX = dir==="left-to-right" ? minX : maxX;
    const baseY  = randInt(minY + Math.ceil(amp), maxY - Math.ceil(amp));
    const speed  = (0.3 + Math.random()*0.3) * 0.5; // slower

    Cave.perks.push({
      image:pack.img, frames:pack.frames, frame:0, tick:0, frameDelay:8,
      x:startX, y:baseY, dir, speed,
      waveY:(x)=> clamp(baseY + Math.sin(x*freq)*amp, minY, maxY),
      perkName, wax_account,
      hasDropped:false, done:false
    });
  }

  // -----------------------------------
  // Live lists
  // -----------------------------------
  function renderBonusListFromBackend(winners=[]){
    const host=Cave.el.bonusGrid; if(!host) return;
    const frag=document.createDocumentFragment();
    winners.forEach(w=>{
      const toks = w.tokens || w.stats?.tokens || {};
      const cons = countConsumablesFromAny(w);
      const dk = w.chest_id ? `ch:${w.chest_id}` : `${w.wax_account}|${w.perk_type}|${w.created_at}|${JSON.stringify(toks)}|${cons}`;
      if (Cave.bonusKeys.has(dk)) return;
      Cave.bonusKeys.add(dk);
      const card = document.createElement("div");
      card.className="cv-card-mini";
      card.innerHTML = `
        <div class="cv-mini-head">
          <div class="cv-mini-title">${safe(w.wax_account)}</div>
          <div class="cv-time" title="${new Date(w.created_at).toLocaleString()}">${timeHM(new Date(w.created_at))}</div>
        </div>
        <div class="cv-mini-kv">
          <div class="kv"><div class="k">Chest</div><div class="v">${safe(w.perk_type||"perk")}${w.chest_id?` #${safe(w.chest_id)}`:""}</div></div>
          <div class="kv"><div class="k">Tokens</div><div class="v">${tokensSummaryText(toks)}</div></div>
          <div class="kv"><div class="k">NFTs</div><div class="v">${safe(w.nfts_count ?? (Array.isArray(w.nfts)?w.nfts.length:0))}</div></div>
          <div class="kv"><div class="k">Consumables</div><div class="v">${cons}</div></div>
        </div>`;
      frag.appendChild(card);
    });
    host.prepend(frag);
    while (host.children.length>MAX_BONUS_ROWS) host.lastElementChild?.remove();
  }
  function appendBonusReward(reward, wax_account, source){
    const host=Cave.el.bonusGrid; if(!host) return;
    const toks=tokensFromAny(reward);
    const nfts=Array.isArray(reward?.nfts)?reward.nfts.length:0;
    const cons=countConsumablesFromAny(reward);
    const chestId=reward?.chest_id;
    const dk = chestId ? `ch:${chestId}` : `${wax_account}|${source}|${JSON.stringify(toks)}|${nfts}|${cons}|${new Date().getMinutes()}`;
    if (Cave.bonusKeys.has(dk)) return; Cave.bonusKeys.add(dk);
    const card=document.createElement("div");
    card.className="cv-card-mini";
    card.innerHTML = `
      <div class="cv-mini-head">
        <div class="cv-mini-title">${safe(wax_account)}</div>
        <div class="cv-time" title="${new Date().toLocaleString()}">${timeHM()}</div>
      </div>
      <div class="cv-mini-kv">
        <div class="kv"><div class="k">Chest</div><div class="v">${safe(source)}${chestId?` #${safe(chestId)}`:""}</div></div>
        <div class="kv"><div class="k">Tokens</div><div class="v">${tokensSummaryText(toks)}</div></div>
        <div class="kv"><div class="k">NFTs</div><div class="v">${nfts}</div></div>
        <div class="kv"><div class="k">Consumables</div><div class="v">${cons}</div></div>
      </div>`;
    host.prepend(card);
    while (host.children.length>MAX_BONUS_ROWS) host.lastElementChild?.remove();

    // optimistic consumables update
    tryUpdateConsumablesFromReward(reward);
  }
  async function renderRecentList(){
    const c=Cave.el.recentGrid; if(!c || !Cave.visible) return;
    c.innerHTML = skeletons(6,72);
    Cave.recentExpKeys.clear();
    try{
      const r=await API.get("/recent_expeditions",20000);
      if (r.aborted) return;
      const arr = Array.isArray(r.data) ? r.data
               : Array.isArray(r.data?.items)? r.data.items
               : Array.isArray(r.data?.results)? r.data.results : [];
      c.innerHTML="";
      arr.slice(0,MAX_RECENT_EXPEDITIONS).forEach(item=>{
        const ts=item.timestamp ?? item.created_at ?? item.time;
        const toks=item.tokens || item.stats?.tokens || {};
        const nftsCount=item.nfts_count ?? (Array.isArray(item.nfts)?item.nfts.length:0);
        const cons=countConsumablesFromAny(item);
        const key=`${item.wax_account}|${ts}|${JSON.stringify(toks)}|${nftsCount}|${cons}`;
        if (Cave.recentExpKeys.has(key)) return;
        Cave.recentExpKeys.add(key);
        const card=document.createElement("div");
        card.className="cv-card-mini";
        card.innerHTML=`
          <div class="cv-mini-head">
            <div class="cv-mini-title">${safe(item.wax_account)}</div>
            ${ts?`<div class="cv-time" title="${new Date(ts).toLocaleString()}">${timeHM(new Date(ts))}</div>`:""}
          </div>
          <div class="cv-mini-kv">
            <div class="kv"><div class="k">Tokens</div><div class="v">${tokensSummaryText(toks)}</div></div>
            <div class="kv"><div class="k">NFTs</div><div class="v">${safe(nftsCount)}</div></div>
            <div class="kv"><div class="k">Consumables</div><div class="v">${cons}</div></div>
          </div>`;
        c.appendChild(card);
      });
      (qs("#cv-recent-empty")||{}).hidden = c.children.length!==0;
    }catch{ c.insertAdjacentHTML("beforeend", `<div class="cv-toast err">Failed to load recent expeditions.</div>`); }
  }
  function prependRecentFromResult(result, wax_account){
    const grid=Cave.el.recentGrid; if(!grid) return;
    const toks=tokensFromAny(result); const nfts=Array.isArray(result?.nfts)?result.nfts.length:0;
    const cons=countConsumablesFromAny(result);
    const k=`${wax_account}|${new Date().getHours()}${new Date().getMinutes()}|${JSON.stringify(toks)}|${nfts}|${cons}`;
    if(Cave.recentExpKeys.has(k)) return; Cave.recentExpKeys.add(k);
    const card=document.createElement("div"); card.className="cv-card-mini";
    card.innerHTML=`
      <div class="cv-mini-head">
        <div class="cv-mini-title">${safe(wax_account)}</div>
        <div class="cv-time" title="${new Date().toLocaleString()}">${timeHM()}</div>
      </div>
      <div class="cv-mini-kv">
        <div class="kv"><div class="k">Tokens</div><div class="v">${tokensSummaryText(toks)}</div></div>
        <div class="kv"><div class="k">NFTs</div><div class="v">${nfts}</div></div>
        <div class="kv"><div class="k">Consumables</div><div class="v">${cons}</div></div>
      </div>`;
    grid.prepend(card);
    while (grid.children.length>MAX_RECENT_EXPEDITIONS) grid.lastElementChild?.remove();

    tryUpdateConsumablesFromReward(result);
  }
  function skeletons(count=6, h=74){
    return Array.from({length:count}).map(()=>`<div class="cv-skel" style="height:${h}px;margin-bottom:.6rem;"></div>`).join("");
  }

  // -----------------------------------
  // Global Expeditions board
  // -----------------------------------
  let globalFetchBusy=false;
  async function renderGlobalExpeditions(){
    if (globalFetchBusy) return; globalFetchBusy=true;
    try{
      if (!Cave.visible || !Cave.el.globalCards || !Cave.el.videoOrCanvas) { globalFetchBusy=false; return; }
      restoreUser(); assertAuth();
      const r=await API.post("/all_expeditions",{},20000);
      if (r.aborted){ globalFetchBusy=false; return; }
      const data = Array.isArray(r.data)? r.data: [];
      const list = Cave.el.globalCards, wrap = Cave.el.videoOrCanvas;
      list.innerHTML="";

      if (data.length===0){
        clearChests(); Cave.goblins=[];
        if (!Cave.canvas) setupCanvas(qs("#caveCanvas", wrap));
        startRAF(); startCommandPolling();
        globalFetchBusy=false; return;
      }
      if (!Cave.canvas){ setupCanvas(qs("#caveCanvas", wrap)); startRAF(); startCommandPolling(); }

      // goblins
      Cave.goblins = data.map((e,i)=>{
        const {minX,maxX,minY,maxY}=bounds();
        const gx=randInt(minX,maxX), gy=randInt(minY,maxY);
        return { x:gx,y:gy, wax_account:e.wax_account, path:[], trail:[{x:gx,y:gy}],
          _lastTrailX:gx, _lastTrailY:gy, digging:false, shovelFrame:0, frameTimer:0, color: colorByIndex(i) };
      });

      // chests sync
      const liveIds = new Set();
      data.forEach(e=>{
        (e.chests||[]).forEach(ch=>{
          if (ch.id==null || isNaN(Number(ch.id))) return;
          const id=String(ch.id); liveIds.add(id);
          const {minX,maxX,minY,maxY}=bounds();
          upsertChest({ id, x: clamp(ch.x,minX,maxX), y: clamp(ch.y,minY,maxY),
            from: ch.from||"unknown", wax_account:e.wax_account, taken:false, claimable:true, pending:false });
        });
      });
      Cave.chests.forEach((ch,key)=>{ if(ch.id!=null && !liveIds.has(String(ch.id))) Cave.chests.delete(key); });

      // cards with countdown
      const timers = data.map((e,i)=>{
        const end = Date.now() + (e.seconds_remaining||0)*1000;
        const id = `cv-timer-${i}`;
        const card = document.createElement("div");
        card.className="cv-card-mini";
        card.innerHTML = `
          <div class="cv-mini-head">
            <div class="cv-mini-title">${safe(e.wax_account)}</div>
            <div class="cv-time" id="${safe(id)}">⏳ …</div>
          </div>
          <div class="cv-mini-kv">
            <div class="kv"><div class="k">Goblins</div><div class="v">${safe(e.total_goblins)}</div></div>
          </div>`;
        list.appendChild(card);
        return {id,end};
      });
      if (Cave.intervals.globalCountdown) clearInterval(Cave.intervals.globalCountdown);
      Cave.intervals.globalCountdown = setInterval(()=>{
        const now=Date.now();
        timers.forEach(t=>{
          const el=document.getElementById(t.id); if(!el) return;
          const rem=t.end-now;
          if (rem<=0) el.textContent="✅ Completed";
          else { const m=Math.floor(rem/60000), s=Math.floor((rem%60000)/1000); el.textContent=`⏳ ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`; }
        });
      },1000);

    } catch(e){ log("Global expeditions error",e); }
    finally{ globalFetchBusy=false; }
  }

  // -----------------------------------
  // User countdown
  // -----------------------------------
  async function renderUserCountdown(expedition_id, seconds, assetIds=[]){
    const host = qs("#expedition-summary-block"); if(!host) return;
    const wax = Cave.user.wax_account; if(!wax) return;
    window.expeditionTimersRunning = window.expeditionTimersRunning || {};
    if (window.expeditionTimersRunning[wax]) return;
    window.expeditionTimersRunning[wax]=true;

    const prev=qs("#user-exp-countdown"); prev?.remove();
    const box=document.createElement("div");
    box.id="user-exp-countdown"; box.className="cv-toast";
    box.textContent="⏳ Expedition in progress…";
    host.appendChild(box);

    let end=Date.now()+seconds*1000;
    const t=setInterval(async()=>{
      const rem=end-Date.now();
      if (rem<=0){
        clearInterval(t);
        box.textContent="⏳ Expedition completed! Checking status…";
        try{
          restoreUser(); assertAuth();
          const status = await API.post("/expedition_status",{ wax_account:wax, user_id:Cave.user.user_id, usx_token:Cave.user.usx_token },12000);
          if(!status.ok) throw new Error(`Status ${status.status}`);
          const result = await API.post("/end_expedition",{ wax_account:wax, user_id:Cave.user.user_id, usx_token:Cave.user.usx_token, expedition_id },15000);
          if (!result.ok){ box.textContent="❌ Failed to retrieve expedition result."; window.expeditionTimersRunning[wax]=false; return; }
          await renderRecentList(); await renderGlobalExpeditions(); prependRecentFromResult(result.data, wax);
          box.textContent="✅ Expedition complete!"; setTimeout(()=>box.remove(), 2000);
        } catch { box.textContent="⚠️ Expedition fetch error."; }
        finally{ window.expeditionTimersRunning[wax]=false; }
      } else {
        const m=Math.floor(rem/60000), s=Math.floor((rem%60000)/1000);
        box.textContent=`⏳ Time Left: ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
      }
    },1000);
  }

  // -----------------------------------
  // Command polling
  // -----------------------------------
  function startCommandPolling(){
    if (Cave.intervals.command) return;
    Cave.intervals.command = setInterval(async()=>{
      if (!Cave.visible || !Cave.canvas) return;
      try{
        restoreUser(); assertAuth();
        const r=await API.post("/check_perk_command", { wax_account:Cave.user.wax_account }, 12000);
        if (!r.ok) return;
        if (r.data?.perk){
          triggerPerk(r.data.perk, r.data.wax_account);
          toast(`${safe(r.data.wax_account)} triggered ${r.data.perk}`,"ok",4000);
        }
      }catch(e){ log("perk polling err",e); }
    }, COMMAND_POLL_MS);
  }
  function stopCommandPolling(){
    if (Cave.intervals.command){ clearInterval(Cave.intervals.command); Cave.intervals.command=null; }
  }

  // -----------------------------------
  // Equipment UI
  // -----------------------------------
  function ensureEquipArray(gId){
    if (!Cave.equipmentByGoblin.has(gId)) {
      Cave.equipmentByGoblin.set(gId, Array.from({length:8}).map(()=>null));
    }
    return Cave.equipmentByGoblin.get(gId);
  }
  function equipOptionsFor(gId, currentAssetId=null, slotIdx=0){
    const usedAssets = Cave.equippedGlobal; // asset_id cannot be used twice globally
    const opts = [{ value:"", label:"— Empty —", disabled:false, reason:"" }];
    EQUIP_CATEGORIES.forEach(cat=>{
      Cave.equipmentInventory
        .filter(it=>{
          const catKey = String(it.category||"").toLowerCase().replace("boost ","");
          const matches = cat.toLowerCase().replace("boost ","");
          return catKey.includes(matches);
        })
        .forEach(it=>{
          // Is same asset_id used on another goblin?
          const globallyUsedByOtherGoblin = usedAssets.has(it.asset_id) && usedAssets.get(it.asset_id)?.goblin_id !== gId;
          // Would this violate same-template-on-same-goblin rule?
          const wouldDuplicateTemplate = hasSameTemplateEquipped(gId, it, slotIdx) && it.asset_id !== currentAssetId;

          let disabled = false;
          let reason = "";
          if (globallyUsedByOtherGoblin){ disabled = true; reason = "Already equipped on another goblin."; }
          else if (wouldDuplicateTemplate){ disabled = true; reason = "Same template already on this goblin."; }

          const label = `[${cat}] ${it.name||it.template_name||it.asset_id} • ${it.rarity} • L${it.level||1}`;
          opts.push({ value: it.asset_id, label, disabled, reason, _it: it });
        });
    });
    return opts;
  }
  function renderEquipPanel(goblin){
    const gId=goblin.asset_id;
    const arr=ensureEquipArray(gId);
    const panel=document.createElement("div"); panel.className="cv-equip-panel"; panel.dataset.goblin=gId;

    // Rule hint
    const rules=document.createElement("div");
    rules.className="cv-equip-rules";
    rules.innerHTML = `
      <div class="cv-note"><strong>Equipment Rules</strong></div>
      <ul class="cv-note-list">
        <li>Each NFT (asset) can be equipped on only one goblin at a time.</li>
        <li><em>Identical items</em> (same <code>schema_name</code> + <code>template_id</code>) cannot occupy multiple slots on the same goblin.</li>
        <li>You can still equip identical templates on different goblins if you own multiple copies.</li>
      </ul>
    `;
    panel.appendChild(rules);

    const grid=document.createElement("div"); grid.className="cv-slot-grid";

    arr.forEach((assetId,idx)=>{
      const slot=document.createElement("div"); slot.className="cv-slot"+(assetId?" filled":""); slot.dataset.slot=String(idx);
      const title=document.createElement("div"); title.className="cv-slot-title"; title.innerHTML=`<span>Slot ${idx+1}</span>`;
      const container=document.createElement("div"); container.className="cv-slot-item";

      if (assetId && Cave.equipmentIndex.has(assetId)){
        const it=Cave.equipmentIndex.get(assetId);
        const img=document.createElement("img"); img.src=it.img||it.image||"equip.png"; img.alt="";
        const name=document.createElement("div");
        name.innerHTML = `
          <strong>${safe(it.name||it.template_name||it.asset_id)}</strong><br>
          <span class="cv-tag ${rarityKey(it.rarity)}">${safe(it.rarity)}</span>
          <span class="cv-tag">${safe(it.category)}</span>
          <span class="cv-tag">L${safe(it.level||1)}</span>
          <div class="cv-subtle">Template: ${safe(templateKey(it))}</div>`;
        container.appendChild(img); container.appendChild(name);
      } else {
        container.innerHTML=`<span class="cv-subtle">Empty</span>`;
      }

      const controls=document.createElement("div"); controls.className="cv-slot-controls";
      const select=document.createElement("select"); select.className="cv-equip-select";
      const options = equipOptionsFor(gId, assetId, idx);
      options.forEach(o=>{
        const opt=document.createElement("option"); opt.value=o.value; opt.textContent=o.label;
        if (o.value===assetId) opt.selected=true;
        if (o.disabled){ opt.disabled=true; opt.title = o.reason || "Not available"; }
        select.appendChild(opt);
      });

      select.addEventListener("change", ()=>{
        const newAsset=select.value||null;
        // Prevent violating rules
        if (newAsset){
          const newIt = Cave.equipmentIndex.get(newAsset);
          if (!newIt){
            // defensive: if backend did not expose the item, disallow
            toast("This equipment is not available.", "warn");
            select.value = assetId || "";
            return;
          }
          // same-template-on-same-goblin rule
          if (hasSameTemplateEquipped(gId, newIt, idx)){
            toast("You cannot equip the same template on multiple slots of the same goblin.", "warn");
            select.value = assetId || "";
            return;
          }
          // unique asset rule
          const usedElsewhere = Cave.equippedGlobal.has(newAsset) && Cave.equippedGlobal.get(newAsset)?.goblin_id !== gId;
          if (usedElsewhere){
            toast("This exact NFT is already equipped on another goblin.", "warn");
            select.value = assetId || "";
            return;
          }
        }

        // release previous asset_id from global map if it belonged to this goblin/slot
        if (assetId && Cave.equippedGlobal.get(assetId)?.goblin_id===gId) Cave.equippedGlobal.delete(assetId);
        // commit
        arr[idx]=newAsset;
        if (newAsset) Cave.equippedGlobal.set(newAsset, { goblin_id:gId, slot:idx });
        // re-render the panel to reflect visuals
        panel.replaceWith(renderEquipPanel(goblin));
      });

      controls.appendChild(select);
      slot.appendChild(title); slot.appendChild(container); slot.appendChild(controls);
      grid.appendChild(slot);
    });

    const saveWrap=document.createElement("div"); saveWrap.className="cv-equip-save";
    const saveBtn=document.createElement("button"); saveBtn.className="cv-btn"; saveBtn.textContent="💾 Save Equipment";
    saveBtn.addEventListener("click", async ()=>{
      try{
        restoreUser(); assertAuth();
        const slots=ensureEquipArray(gId).map((asset_id,slot)=>asset_id?{slot,asset_id}:null).filter(Boolean);
        const rs=await API.post("/set_equipment",{ wax_account:Cave.user.wax_account, user_id:Cave.user.user_id, usx_token:Cave.user.usx_token, goblin_id:gId, slots },15000);
        if (!rs.ok) throw new Error(`HTTP ${rs.status}`);
        toast("Equipment saved.","ok");
      }catch{ toast("Failed to save equipment.","err"); }
    });
    saveWrap.appendChild(saveBtn);
    panel.appendChild(grid); panel.appendChild(saveWrap);
    return panel;
  }

  // -----------------------------------
  // Consumables UI
  // -----------------------------------
  function addExpConsumable(asset_id){
    const item=Cave.consumableIndex.get(asset_id); if(!item) return;
    const inUse = Cave.expConsumables.get(asset_id)||0;
    const totalOwned = Number(item.quantity||0);
    if (inUse >= totalOwned) { toast("Quantity exhausted.", "warn"); return; }
    const totalSelected = Array.from(Cave.expConsumables.values()).reduce((a,b)=>a+b,0);
    if (totalSelected >= CONSUMABLE_LIMIT_EXPEDITION){ toast("Expedition consumable limit reached.", "warn"); return; }
    Cave.expConsumables.set(asset_id, inUse+1);
    renderExpConsumablesPanel();
  }
  function removeExpConsumable(asset_id){
    const inUse=Cave.expConsumables.get(asset_id)||0; if(inUse<=0) return;
    Cave.expConsumables.set(asset_id, inUse-1);
    if (Cave.expConsumables.get(asset_id)<=0) Cave.expConsumables.delete(asset_id);
    renderExpConsumablesPanel();
  }
  function setGoblinConsumable(goblinId, asset_id){
    const item=Cave.consumableIndex.get(asset_id); if(!item) return;
    const arr = Cave.goblinConsumables.get(goblinId)||[];
    if (arr.length>=CONSUMABLE_LIMIT_PER_GOBLIN){ toast("This goblin already has a consumable.", "warn"); return; }
    // ensure quantity is available vs expedition + other goblins
    const selectedExp = Cave.expConsumables.get(asset_id)||0;
    const selectedGob = Array.from(Cave.goblinConsumables.values()).flat().filter(x=>x.asset_id===asset_id).length;
    if (selectedExp + selectedGob >= Number(item.quantity||0)) { toast("Quantity exhausted.", "warn"); return; }
    Cave.goblinConsumables.set(goblinId, [...arr, {asset_id, qty:1}]);
    const card = qs(`.cv-gob-card[data-id="${CSS.escape(goblinId)}"]`);
    if (card){ const panel=card.querySelector(".cv-cons-panel"); if(panel) panel.replaceWith(renderConsumablePanelForGoblin(goblinId)); }
  }
  function clearGoblinConsumable(goblinId){
    Cave.goblinConsumables.delete(goblinId);
    const card = qs(`.cv-gob-card[data-id="${CSS.escape(goblinId)}"]`);
    if (card){ const panel=card.querySelector(".cv-cons-panel"); if(panel) panel.replaceWith(renderConsumablePanelForGoblin(goblinId)); }
  }
  function renderExpConsumablesPanel(){
    const host = Cave.el.expConsPanel; if(!host) return;
    host.innerHTML = `
      <div class="cv-cons-head">
        <div class="cv-card-title amber">🎯 Expedition Consumables</div>
        <div class="cv-chip amber-outline">Max ${CONSUMABLE_LIMIT_EXPEDITION}</div>
      </div>
      <div class="cv-cons-grid"></div>
      <div class="cv-cons-inventory"></div>
    `;
    const grid = host.querySelector(".cv-cons-grid");

    // selected
    if (Cave.expConsumables.size===0){
      grid.innerHTML = `<div class="cv-empty">No consumables selected for this expedition.</div>`;
    } else {
      grid.innerHTML = "";
      Cave.expConsumables.forEach((qty,asset_id)=>{
        const it=Cave.consumableIndex.get(asset_id); if(!it) return;
        const row=document.createElement("div"); row.className="cv-cons-row";
        row.innerHTML = `
          <div class="cv-cons-item">
            <img src="${safe(it.img||"consumable.png")}" alt="">
            <div>
              <strong>${safe(it.name||it.asset_id)}</strong><br>
              <span class="cv-tag ${rarityKey(it.rarity)}">${safe(it.rarity||"Common")}</span>
              <span class="cv-tag">${safe(it.category||"Boost")}</span>
              <span class="cv-tag">L${safe(it.level||1)}</span>
            </div>
          </div>
          <div class="cv-cons-qty">${qty}</div>
          <div class="cv-cons-actions">
            <button class="cv-btn" data-act="minus" data-id="${safe(asset_id)}">−</button>
            <button class="cv-btn" data-act="plus"  data-id="${safe(asset_id)}">＋</button>
          </div>
        `;
        grid.appendChild(row);
      });
      grid.addEventListener("click",(e)=>{
        const btn=e.target.closest("button[data-act]"); if(!btn) return;
        const id=btn.dataset.id;
        if (btn.dataset.act==="minus") removeExpConsumable(id);
        else addExpConsumable(id);
      }, { once:true });
    }

    // inventory
    const inv = host.querySelector(".cv-cons-inventory");
    inv.innerHTML = `<div class="cv-card-title">Inventory</div>`;
    const list=document.createElement("div"); list.className="cv-cards";
    Cave.consumablesInventory.forEach(it=>{
      const selectedExp = Cave.expConsumables.get(it.asset_id)||0;
      const selectedGob = Array.from(Cave.goblinConsumables.values()).flat().filter(x=>x.asset_id===it.asset_id).length;
      const left = Math.max(0, Number(it.quantity||0) - selectedExp - selectedGob);
      const card=document.createElement("div"); card.className="cv-card-mini";
      card.innerHTML = `
        <div class="cv-mini-head">
          <div class="cv-mini-title">${safe(it.name||it.asset_id)}</div>
          <div class="cv-chip">${left}/${safe(it.quantity||0)}</div>
        </div>
        <div class="cv-mini-kv">
          <div class="kv"><div class="k">Rarity</div><div class="v">${safe(it.rarity||"Common")}</div></div>
          <div class="kv"><div class="k">Category</div><div class="v">${safe(it.category||"Boost")}</div></div>
        </div>
        <div class="cv-cons-row-actions">
          <button class="cv-btn" ${left<=0?"disabled":""} data-cons-add="${safe(it.asset_id)}">Add to Expedition</button>
        </div>`;
      list.appendChild(card);
    });
    inv.appendChild(list);
    inv.addEventListener("click",(e)=>{
      const btn=e.target.closest("button[data-cons-add]"); if(!btn) return;
      addExpConsumable(btn.dataset.consAdd);
    });
  }
  function renderConsumablePanelForGoblin(goblinId){
    const panel=document.createElement("div"); panel.className="cv-cons-panel";
    const arr=Cave.goblinConsumables.get(goblinId)||[];
    panel.innerHTML = `
      <div class="cv-cons-head">
        <div class="cv-card-title green">🧪 Consumables (Goblin)</div>
        <div class="cv-chip green-outline">Max ${CONSUMABLE_LIMIT_PER_GOBLIN}</div>
      </div>
      <div class="cv-cons-grid"></div>
      <div class="cv-cons-inventory"></div>
    `;
    const grid=panel.querySelector(".cv-cons-grid");
    if (arr.length===0) grid.innerHTML=`<div class="cv-empty">No consumables set for this goblin.</div>`;
    else {
      grid.innerHTML="";
      arr.forEach(({asset_id})=>{
        const it=Cave.consumableIndex.get(asset_id);
        const row=document.createElement("div"); row.className="cv-cons-row";
        row.innerHTML = `
          <div class="cv-cons-item">
            <img src="${safe(it?.img||"consumable.png")}" alt="">
            <div>
              <strong>${safe(it?.name||asset_id)}</strong><br>
              <span class="cv-tag ${rarityKey(it?.rarity)}">${safe(it?.rarity||"Common")}</span>
              <span class="cv-tag">${safe(it?.category||"Boost")}</span>
              <span class="cv-tag">L${safe(it?.level||1)}</span>
            </div>
          </div>
          <div class="cv-cons-qty">1</div>
          <div class="cv-cons-actions">
            <button class="cv-btn" data-clear="1">Remove</button>
          </div>
        `;
        grid.appendChild(row);
      });
      grid.addEventListener("click",(e)=>{
        if (e.target.closest("[data-clear]")) clearGoblinConsumable(goblinId);
      }, { once:true });
    }
    // inventory
    const inv=panel.querySelector(".cv-cons-inventory");
    inv.innerHTML = `<div class="cv-card-title">Available</div>`;
    const list=document.createElement("div"); list.className="cv-cards";
    Cave.consumablesInventory.forEach(it=>{
      const selectedExp = Cave.expConsumables.get(it.asset_id)||0;
      const selectedGob = Array.from(Cave.goblinConsumables.values()).flat().filter(x=>x.asset_id===it.asset_id).length;
      const left = Math.max(0, Number(it.quantity||0) - selectedExp - selectedGob);
      const card=document.createElement("div"); card.className="cv-card-mini";
      card.innerHTML=`
        <div class="cv-mini-head">
          <div class="cv-mini-title">${safe(it.name||it.asset_id)}</div>
          <div class="cv-chip">${left}/${safe(it.quantity||0)}</div>
        </div>
        <div class="cv-mini-kv">
          <div class="kv"><div class="k">Rarity</div><div class="v">${safe(it.rarity||"Common")}</div></div>
          <div class="kv"><div class="k">Category</div><div class="v">${safe(it.category||"Boost")}</div></div>
        </div>
        <div class="cv-cons-row-actions">
          <button class="cv-btn" ${left<=0?"disabled":""} data-add-one="${safe(it.asset_id)}">Assign to Goblin</button>
        </div>`;
      list.appendChild(card);
    });
    inv.appendChild(list);
    inv.addEventListener("click",(e)=>{
      const btn=e.target.closest("button[data-add-one]"); if(!btn) return;
      setGoblinConsumable(goblinId, btn.dataset.addOne);
    });
    return panel;
  }

  // -----------------------------------
  // Goblin list
  // -----------------------------------
  function renderGoblinList(goblins){
    const host=Cave.el.goblinList; if(!host) return;
    const num=(v)=>Number(v??0)||0;

    const q=Cave.filterQuery.trim().toLowerCase();
    const filtered = goblins.filter(g=>{
      const okQ = !q || `${g.name||""}`.toLowerCase().includes(q) || String(g.asset_id).includes(q);
      const okR = !Cave.filterRarity || String(g.rarity||"").toLowerCase()===Cave.filterRarity.toLowerCase();
      const okP = num(g.daily_power) >= Cave.minPower;
      return okQ && okR && okP;
    });
    const sorted=[...filtered].sort((a,b)=> num(b[Cave.sortBy]) - num(a[Cave.sortBy]));

    const af=Cave.el.activeFilters;
    if (af) af.innerHTML = [
      Cave.filterQuery ? `<span class="cv-badge">🔎 ${safe(Cave.filterQuery)}</span>` : "",
      Cave.filterRarity ? `<span class="cv-badge">${safe(Cave.filterRarity)}</span>` : "",
      Cave.minPower>0 ? `<span class="cv-badge">⚡ ≥ ${Cave.minPower}</span>` : ""
    ].filter(Boolean).join("");

    host.innerHTML="";
    const maxPower=Math.max(1, ...sorted.map(g=>num(g.daily_power)));
    const frag=document.createDocumentFragment();

    sorted.forEach(g=>{
      const tired = num(g.daily_power)<5;
      const sel = Cave.selectedGoblinIds.has(g.asset_id);
      const pct = Math.max(6, Math.round(num(g.daily_power)/maxPower*100));

      const card=document.createElement("div"); card.className="cv-gob-card"; card.dataset.id=g.asset_id;
      card.setAttribute("role","checkbox"); card.tabIndex=0; card.setAttribute("aria-checked", sel?"true":"false");
      if (tired) card.setAttribute("aria-disabled","true");

      // header
      const head=document.createElement("div"); head.className="cv-gob-head";
      head.innerHTML=`
        <img src="${safe(g.img)}" alt="" class="cv-gob-thumb">
        <div class="cv-gob-name">${safe(g.name)}</div>
        <span class="cv-rarity cv-tag ${rarityKey(g.rarity)}">${safe(g.rarity)}</span>
      `;
      if (tired){
        const rib=document.createElement("div"); rib.className="cv-resting-ribbon"; rib.textContent="RESTING"; head.appendChild(rib);
      }

      // stats
      const pills=document.createElement("div"); pills.className="cv-gob-pillrow";
      pills.innerHTML=`
        <div class="cv-pill"><div class="cv-chip-key">LEVEL</div><div class="cv-chip-val">${safe(g.level)}</div></div>
        <div class="cv-pill"><div class="cv-chip-key">ABILITY</div><div class="cv-chip-val">${safe(g.main_attr)}</div></div>
        <div class="cv-pill"><div class="cv-chip-key">POWER</div><div class="cv-chip-val">${safe(g.daily_power)}</div></div>`;

      // meter
      const meter=document.createElement("div"); meter.className="cv-meter";
      meter.innerHTML=`<div class="cv-meter-bar"><div style="width:${pct}%"></div></div><div class="cv-meter-val">${safe(g.daily_power)}</div>`;

      // actions
      const actions=document.createElement("div"); actions.className="cv-gob-actions";
      const left=document.createElement("div"); left.className="left";
      left.innerHTML=`<div class="cv-subtle">ID: ${safe(g.asset_id)}</div>`;
      const btnEquip=document.createElement("button"); btnEquip.className="cv-btn"; btnEquip.textContent="🛡 Equipment";
      const btnCons = document.createElement("button"); btnCons.className="cv-btn"; btnCons.textContent="🧪 Consumable";
      left.appendChild(btnEquip); left.appendChild(btnCons);
      const cbWrap=document.createElement("label"); const cb=document.createElement("input");
      cb.type="checkbox"; cb.className="cv-checkbox"; cb.checked=sel; cb.disabled=tired;
      cbWrap.appendChild(cb);
      actions.appendChild(left); actions.appendChild(cbWrap);

      // panels
      const equipPanel=renderEquipPanel(g);
      equipPanel.style.display="none";
      const consPanel=renderConsumablePanelForGoblin(g.asset_id);
      consPanel.style.display="none";

      // events
      const toggleSelect=()=>{
        if (tired) return;
        cb.checked=!cb.checked;
        if (cb.checked) Cave.selectedGoblinIds.add(g.asset_id); else Cave.selectedGoblinIds.delete(g.asset_id);
        card.setAttribute("aria-checked", cb.checked?"true":"false");
        updateSummary();
      };
      card.addEventListener("click",(e)=>{
        if (e.target===cb || e.target===btnEquip || e.target===btnCons || e.target.closest(".cv-equip-panel") || e.target.closest(".cv-cons-panel")) return;
        toggleSelect();
      });
      card.addEventListener("keydown",(e)=>{
        if (tired) return;
        if (e.key===" " || e.key==="Enter"){ e.preventDefault(); toggleSelect(); }
      });
      cb.addEventListener("change", ()=> toggleSelect());
      btnEquip.addEventListener("click", ()=>{
        const open = equipPanel.style.display !== "none";
        equipPanel.style.display = open? "none":"block";
      });
      btnCons.addEventListener("click", ()=>{
        const open = consPanel.style.display !== "none";
        consPanel.style.display = open? "none":"block";
      });

      card.appendChild(head);
      card.appendChild(pills);
      card.appendChild(meter);
      card.appendChild(actions);
      card.appendChild(equipPanel);
      card.appendChild(consPanel);
      frag.appendChild(card);
    });

    host.appendChild(frag);
  }

  // -----------------------------------
  // Filters & Summary
  // -----------------------------------
  function saveFilters(){
    localStorage.setItem("caveFilters", JSON.stringify({
      filterQuery:Cave.filterQuery, filterRarity:Cave.filterRarity, minPower:Cave.minPower, sortBy:Cave.sortBy
    }));
  }
  function loadFilters(){
    try{
      const s=JSON.parse(localStorage.getItem("caveFilters")||"{}");
      Cave.filterQuery=s.filterQuery||""; Cave.filterRarity=s.filterRarity||""; Cave.minPower=Number(s.minPower||0); Cave.sortBy=s.sortBy||"rarity";
      if (Cave.el.search) Cave.el.search.value=Cave.filterQuery;
      if (Cave.el.rarity) Cave.el.rarity.value=Cave.filterRarity;
      if (Cave.el.power)  Cave.el.power.value=String(Cave.minPower);
      if (Cave.el.powerVal) Cave.el.powerVal.textContent=String(Cave.minPower);
      qsa(".cv-seg-btn[data-sort]").forEach(b=>b.classList.remove("is-active"));
      const act=qs(`.cv-seg-btn[data-sort="${Cave.sortBy}"]`); if(act) act.classList.add("is-active");
    }catch{}
  }
  function updateSummary(){
    const sum=Cave.el.selectionSummary; if(!sum) return;
    const dur=DURATIONS[Cave.selectedDurationKey];
    const totalExpCons = Array.from(Cave.expConsumables.values()).reduce((a,b)=>a+b,0);
    sum.innerHTML = `
      <div class="cv-summary-row">
        <span>Selected: <strong>${Cave.selectedGoblinIds.size}</strong> / 50</span>
        <span>Duration: <strong>${Cave.selectedDurationKey}</strong> (<strong>${dur.multiplier.toFixed(2)}×</strong>)</span>
        <span>Consumables (Run): <strong>${totalExpCons}</strong> / ${CONSUMABLE_LIMIT_EXPEDITION}</span>
      </div>
      <div class="cv-summary-actions">
        <button class="cv-btn" id="cv-start">🚀 Start Expedition</button>
      </div>
    `;
    qs("#cv-start", sum)?.addEventListener("click", onStartExpedition);
  }

  // -----------------------------------
  // Start Expedition
  // -----------------------------------
  async function onStartExpedition(e){
    const btn=e.currentTarget; btn.disabled=true; btn.textContent="⏳ Starting...";
    try{
      if (!Cave.selectedGoblinIds.size){ toast("Select at least 1 goblin.", "warn"); return; }
      const ids=[...Cave.selectedGoblinIds].filter(id=>{
        const g=Cave._goblinsData.find(x=>x.asset_id===id);
        return g && Number(g.daily_power||0)>=5;
      });
      if(!ids.length){ toast("All selected goblins are resting (too low power).", "warn"); return; }

      const dur=DURATIONS[Cave.selectedDurationKey] || DURATIONS["1h"];

      // equipment payload
      const equipment_by_goblin={};
      ids.forEach(gid=>{
        const slots=ensureEquipArray(gid).map((asset_id,slot)=>asset_id?{slot,asset_id}:null).filter(Boolean);
        equipment_by_goblin[gid]=slots;
      });

      // consumables payload
      const consumables_exp = Array.from(Cave.expConsumables.entries()).map(([asset_id,qty])=>({asset_id, qty}));
      const consumables_by_goblin = {};
      ids.forEach(gid=>{
        const arr=Cave.goblinConsumables.get(gid)||[];
        consumables_by_goblin[gid] = arr.map(({asset_id,qty})=>({asset_id, qty}));
      });

      restoreUser(); assertAuth();
      const payload = {
        wax_account:Cave.user.wax_account, user_id:Cave.user.user_id, usx_token:Cave.user.usx_token,
        goblin_ids: ids,
        duration_key: Cave.selectedDurationKey, duration_minutes: dur.minutes, multiplier: dur.multiplier,
        equipment_by_goblin, consumables_exp, consumables_by_goblin
      };
      const r=await API.post("/start_expedition", payload, 20000);
      if (r.status===409) toast(r.data?.error||"Already in expedition.", "warn");
      else if (r.ok){
        toast("Expedition started!", "ok");
        const secs = Number(r.data?.duration_seconds) || (dur.minutes*60);
        await renderUserCountdown(r.data.expedition_id, secs, ids);
        await renderGlobalExpeditions();
        // Clear expedition consumables visually (server consumes them)
        Cave.expConsumables.clear();
        renderExpConsumablesPanel();
      } else toast("Something went wrong.", "err");
    } catch(err){
      toast("Failed to start expedition.", "err"); log(err);
    } finally { btn.disabled=false; btn.textContent="🚀 Start Expedition"; }
  }

  // -----------------------------------
  // Cave Main Init
  // -----------------------------------
  async function renderDwarfsCave(){
    // cache elements
    Cave.el.toast            = qs("#cv-toast-host");
    Cave.el.videoOrCanvas    = qs("#cv-video-or-canvas");
    Cave.el.globalCards      = qs("#cv-global-cards");
    Cave.el.recentGrid       = qs("#cv-recent-grid");
    Cave.el.bonusGrid        = qs("#cv-bonus-grid");
    Cave.el.search           = qs("#cv-search");
    Cave.el.rarity           = qs("#cv-rarity");
    Cave.el.power            = qs("#cv-power");
    Cave.el.powerVal         = qs("#cv-power-val");
    Cave.el.sortSegment      = qs("#cv-sort-segment");
    Cave.el.durationSegment  = qs("#cv-duration-segment");
    Cave.el.goblinList       = qs("#cv-goblin-list");
    Cave.el.selectionSummary = qs("#cv-summary");
    Cave.el.activeFilters    = qs("#cv-active-filters");
    Cave.el.chestPerkBtn     = qs("#cv-chest-btn");
    Cave.el.expConsPanel     = qs("#cv-exp-consumables");

    await loadAssets(); initRealtime();
    const canvas=qs("#caveCanvas"); if(canvas){ setupCanvas(canvas); startRAF(); startCommandPolling(); }

    await renderGlobalExpeditions();
    if (Cave.intervals.global) clearInterval(Cave.intervals.global);
    Cave.intervals.global = setInterval(()=> renderGlobalExpeditions(), GLOBAL_REFRESH_MS);

    await renderRecentList();

    // Load user NFTs
    let goblins=[];
    try{
      restoreUser(); assertAuth();
      const r=await API.post("/user_nfts",{ wax_account:Cave.user.wax_account, user_id:Cave.user.user_id, usx_token:Cave.user.usx_token }, 20000);
      const arr=Array.isArray(r.data)? r.data: [];
      goblins = arr.filter(x=>x.type==="goblin");
      Cave.equipmentInventory  = arr.filter(x=>x.type==="equipment");
      Cave.consumablesInventory= arr.filter(x=>x.type==="consumable");

      // index equipment & set global usage marks
      Cave.equipmentIndex.clear(); Cave.equippedGlobal.clear();
      Cave.equipmentInventory.forEach(it=>{
        Cave.equipmentIndex.set(it.asset_id, it);
        if (it.equipped_to && it.slot!=null) Cave.equippedGlobal.set(it.asset_id, {goblin_id:it.equipped_to, slot:it.slot});
      });

      // index consumables
      Cave.consumableIndex.clear();
      Cave.consumablesInventory.forEach(c=> Cave.consumableIndex.set(c.asset_id, c));

      // loadout per goblin
      goblins.forEach(g=>{
        const eq=Array.isArray(g.equipment)? g.equipment:null;
        if (eq){
          Cave.equipmentByGoblin.set(g.asset_id, Array.from({length:8}).map((_,i)=> eq.find(e=>e.slot===i)?.asset_id || null));
          eq.forEach(e=>{ if(e.asset_id) Cave.equippedGlobal.set(e.asset_id, {goblin_id:g.asset_id, slot:e.slot}); });
        } else {
          ensureEquipArray(g.asset_id);
        }
      });

      Cave._goblinsData=goblins;
      if (!goblins.length){
        Cave.el.selectionSummary.innerHTML=`<div class="cv-toast">No goblins available.</div>`; return;
      }
    }catch{
      Cave.el.selectionSummary.innerHTML=`<div class="cv-toast err">Failed to load your NFTs.</div>`; return;
    }

    // Toolbar bindings
    loadFilters();

    qs("#cv-select-50")?.addEventListener("click", ()=>{
      Cave.selectedGoblinIds.clear();
      goblins.filter(g=>Number(g.daily_power||0)>=5).slice(0,50).forEach(g=>Cave.selectedGoblinIds.add(g.asset_id));
      renderGoblinList(goblins); updateSummary();
    });
    qs("#cv-deselect")?.addEventListener("click", ()=>{
      Cave.selectedGoblinIds.clear();
      renderGoblinList(goblins); updateSummary();
    });
    qs("#cv-select-best")?.addEventListener("click", ()=>{
      Cave.selectedGoblinIds.clear();
      const scored=goblins.filter(g=>Number(g.daily_power||0)>=5)
        .map(g=>({id:g.asset_id, score:Number(g.level||0)+Number(g[g.main_attr]||0)}))
        .sort((a,b)=>b.score-a.score).slice(0,50);
      scored.forEach(s=>Cave.selectedGoblinIds.add(s.id));
      renderGoblinList(goblins); updateSummary();
    });

    Cave.el.search?.addEventListener("input", e=>{ Cave.filterQuery=e.target.value; renderGoblinList(goblins); saveFilters(); });
    Cave.el.rarity?.addEventListener("change", e=>{ Cave.filterRarity=e.target.value; renderGoblinList(goblins); saveFilters(); });
    Cave.el.power?.addEventListener("input", e=>{
      Cave.minPower=Number(e.target.value)||0; if(Cave.el.powerVal) Cave.el.powerVal.textContent=String(Cave.minPower);
      renderGoblinList(goblins); saveFilters();
    });

    Cave.el.sortSegment?.addEventListener("click", (e)=>{
      const btn=e.target.closest(".cv-seg-btn[data-sort]"); if(!btn) return;
      Cave.sortBy=btn.dataset.sort||"rarity";
      qsa(".cv-seg-btn[data-sort]").forEach(b=>b.classList.remove("is-active"));
      btn.classList.add("is-active");
      saveFilters(); renderGoblinList(goblins);
    });

    // Durations
    Cave.el.durationSegment?.addEventListener("click",(e)=>{
      const btn=e.target.closest(".cv-seg-btn[data-dur]"); if(!btn) return;
      qsa(".cv-seg-btn[data-dur]").forEach(b=>b.classList.remove("is-active"));
      btn.classList.add("is-active");
      Cave.selectedDurationKey=btn.dataset.dur;
      localStorage.setItem("caveDuration", JSON.stringify({key:Cave.selectedDurationKey}));
      updateSummary();
    });

    // Perk button
    Cave.el.chestPerkBtn?.addEventListener("click", async ()=>{
      const btn=Cave.el.chestPerkBtn; btn.disabled=true; const old=btn.textContent; btn.textContent="Checking…";
      try{
        restoreUser(); assertAuth();
        const r=await API.post("/try_chest_perk",{ wax_account:Cave.user.wax_account, user_id:Cave.user.user_id, usx_token:Cave.user.usx_token },12000);
        if (r.status===429) toast(`Wait ${r.data?.seconds_remaining}s before next try.`,"warn");
        else if (r.ok && r.data?.perk_awarded){ toast(`🎉 Perk "${r.data.perk_type.toUpperCase()}" awarded!`,"ok"); triggerPerk(r.data.perk_type, Cave.user.wax_account); }
        else toast("No perk awarded this time.","warn");
      }catch{ toast("Error while trying perk drop.","err"); }
      finally{ btn.disabled=false; btn.textContent=old; }
    });

    // UI
    renderGoblinList(goblins);
    updateSummary();

    // expedition-wide consumables
    if (Cave.el.expConsPanel){ renderExpConsumablesPanel(); }

    // recent winners
    try {
      const rw=await API.get("/recent_winners",10000);
      if (rw.ok && Array.isArray(rw.data)) renderBonusListFromBackend(rw.data);
    } catch {}

    // if expedition is running
    try{
      restoreUser(); assertAuth();
      const s=await API.post("/expedition_status",{ wax_account:Cave.user.wax_account, user_id:Cave.user.user_id, usx_token:Cave.user.usx_token },12000);
      if (s.status===200) await renderUserCountdown(s.data.expedition_id, s.data.seconds_remaining, s.data.goblin_ids||[]);
    }catch{}

    // visibility
    document.addEventListener("visibilitychange", ()=>{
      Cave.visible=!document.hidden;
      if (Cave.visible) startCommandPolling();
      else { stopCommandPolling(); Cave.goblins.forEach(g=>{ if(Array.isArray(g.trail)) g.trail=g.trail.slice(0,4); }); }
    });

    // cleanup
    const mo=new MutationObserver(()=>{
      if(!document.getElementById("goblin-content")){
        stopRAF(); stopCommandPolling();
        if (Cave.intervals.global){ clearInterval(Cave.intervals.global); Cave.intervals.global=null; }
        if (Cave.intervals.globalCountdown){ clearInterval(Cave.intervals.globalCountdown); Cave.intervals.globalCountdown=null; }
        if (Cave._es){ try{Cave._es.close();}catch{} Cave._es=null; }
        Cave.canvas=null; Cave.ctx=null; mo.disconnect();
      }
    });
    mo.observe(document.body,{subtree:true, childList:true});
  }

  // -----------------------------------
  // Season Pass Page
  // -----------------------------------
  function spSkeleton(){
    return `
      <div class="cv-skel" style="height:42px;margin-bottom:.6rem;"></div>
      <div class="cv-skel" style="height:120px;margin-bottom:.6rem;"></div>
      <div class="cv-skel" style="height:200px;margin-bottom:.6rem;"></div>
    `;
  }
  function rewardSummary(rw){
    if (!rw) return "Unknown reward";
    if (rw.type==="token"){
      const toks = rw.tokens || {};
      return `Tokens: ${tokensSummaryText(toks)}`;
    }
    if (rw.type==="nft"){
      const n = Array.isArray(rw.items) ? rw.items.length : (rw.count||1);
      return `NFTs: ${n}`;
    }
    if (rw.type==="consumable"){
      const n = Array.isArray(rw.items) ? rw.items.reduce((a,b)=>a + Number(b.qty||1),0) : (rw.count||1);
      return `Consumables: ${n}`;
    }
    if (rw.type==="bundle"){
      return `Bundle reward`;
    }
    return `Reward`;
  }
  function tierStateBadge(state){
    if (state==="claimed") return `<span class="cv-badge fiery">CLAIMED</span>`;
    if (state==="claimable") return `<span class="cv-badge ready">CLAIMABLE</span>`;
    return `<span class="cv-badge frozen">LOCKED</span>`;
  }
  function makeTierCard(tier, userPoints){
    const state = tier.status || (tier.claimed ? "claimed" : (userPoints >= tier.threshold ? "claimable" : "locked"));
    const card = document.createElement("div");
    card.className = `sp-tier-card ${state}`;
    card.dataset.rewardId = String(tier.id);
    card.innerHTML = `
      <div class="sp-tier-head">
        <div class="sp-tier-title">Tier ${safe(tier.index ?? tier.position ?? tier.threshold)}</div>
        <div class="sp-tier-need">Requires: ${safe(tier.threshold)} pts</div>
      </div>
      <div class="sp-tier-reward">${safe(rewardSummary(tier.reward))}</div>
      <div class="sp-tier-actions">
        ${tierStateBadge(state)}
        ${state==="claimable" ? `<button class="cv-btn" data-claim="${safe(tier.id)}">Claim</button>` : ""}
      </div>
    `;
    return card;
  }
  async function claimSeasonReward(rewardId){
    try{
      restoreUser(); assertAuth();
      const rs = await API.post("/season_pass/claim", {
        wax_account: Cave.user.wax_account, user_id: Cave.user.user_id, usx_token: Cave.user.usx_token,
        reward_id: rewardId
      }, 15000);
      if (!rs.ok){
        if (rs.status===409) toast(rs.data?.error||"Already claimed or not eligible.", "warn");
        else toast("Claim failed.", "err");
        return false;
      }
      toast("Reward claimed! 🎉", "ok");
      // Because rewards may include tokens / NFTs / consumables, reflect consumables if present
      tryUpdateConsumablesFromReward(rs.data?.reward);
      return true;
    }catch{
      toast("Claim request failed.", "err");
      return false;
    }
  }

  function renderSeasonPassUI(root, data){
    // Header
    const u=data.user||{};
    const head=document.createElement("div");
    head.className="sp-head";
    head.innerHTML = `
      <div class="sp-head-row">
        <div class="sp-title">${safe(data.season_name || "Season Pass")}</div>
        <div class="sp-sub">Ends: ${safe(data.ends_at ? new Date(data.ends_at).toLocaleString() : "TBA")}</div>
      </div>
      <div class="sp-progress">
        <div class="sp-points"><strong>${safe(u.points||0)}</strong> pts</div>
        <div class="sp-rank">Rank: <strong>${safe(u.rank||"-")}</strong></div>
      </div>
      <div class="sp-notes">
        Points are granted by expeditions, chests, consumed items, and installed equipment (server-calculated).
      </div>
    `;

    // Track container (Standard + Elite)
    const tracksWrap=document.createElement("div");
    tracksWrap.className="sp-tracks";

    const userPoints = Number(u.points||0);
    const hasElite = !!u.has_elite;

    // Standard track
    const standardCol=document.createElement("div");
    standardCol.className="sp-col";
    standardCol.innerHTML = `
      <div class="sp-col-head">
        <div class="sp-col-title">STANDARD Track</div>
      </div>
      <div class="sp-tier-grid sp-standard"></div>
    `;
    const stdGrid = standardCol.querySelector(".sp-tier-grid");

    // Elite track
    const eliteCol=document.createElement("div");
    eliteCol.className="sp-col";
    eliteCol.innerHTML = `
      <div class="sp-col-head">
        <div class="sp-col-title">ELITE Track</div>
        ${!hasElite ? `<button class="cv-btn sp-elite-cta" id="sp-upgrade-elite">⭐ Unlock Elite</button>` : `<span class="cv-badge ready">ACTIVE</span>`}
      </div>
      <div class="sp-tier-grid sp-elite ${hasElite ? "" : "is-locked"}"></div>
    `;
    const eliteGrid = eliteCol.querySelector(".sp-tier-grid");

    // Compose tracks data (robust to various shapes)
    const tiersRaw = data.tiers || {};
    const stdTiers  = Array.isArray(tiersRaw.standard) ? tiersRaw.standard : (Array.isArray(tiersRaw.free) ? tiersRaw.free : []);
    const eliteTiers= Array.isArray(tiersRaw.elite)    ? tiersRaw.elite    : (Array.isArray(tiersRaw.premium) ? tiersRaw.premium : []);

    // Build Standard tiers
    stdTiers.forEach(tier=>{
      const card = makeTierCard(tier, userPoints);
      stdGrid.appendChild(card);
    });

    // Build Elite tiers
    eliteTiers.forEach(tier=>{
      const card = makeTierCard(tier, userPoints);
      if (!hasElite) {
        // Visually overlay "locked" status over all elite cards unless already claimed
        if (!(tier.claimed || tier.status==="claimed")) card.classList.add("tier-elite-locked");
      }
      eliteGrid.appendChild(card);
    });

    // Progress bar across thresholds (optional visual): compute next target
    const allThresholds = [...stdTiers, ...eliteTiers].map(t=>Number(t.threshold||0)).filter(n=>!isNaN(n)).sort((a,b)=>a-b);
    const maxThreshold  = allThresholds.length ? allThresholds[allThresholds.length-1] : 0;
    const progressPct   = maxThreshold>0 ? clamp((userPoints / maxThreshold)*100, 0, 100) : 0;

    const progressBar=document.createElement("div");
    progressBar.className="sp-wide-progress";
    progressBar.innerHTML = `
      <div class="sp-wide-bar"><div style="width:${progressPct}%"></div></div>
      <div class="sp-wide-meta">
        <span>Total Progress</span>
        <span>${userPoints} / ${maxThreshold || "∞"} pts</span>
      </div>
    `;

    // Leaderboard section (will be filled later)
    const lb=document.createElement("div");
    lb.className="sp-leaderboard";
    lb.innerHTML = `
      <div class="sp-col-head">
        <div class="sp-col-title">Season Leaderboard</div>
        <div class="sp-subtle">Top players of the current season</div>
      </div>
      <div class="sp-lb-wrap">
        ${spSkeleton()}
      </div>
    `;

    // Assemble root
    root.innerHTML = "";
    root.appendChild(head);
    root.appendChild(progressBar);
    tracksWrap.appendChild(standardCol);
    tracksWrap.appendChild(eliteCol);
    root.appendChild(tracksWrap);
    root.appendChild(lb);

    // Delegated click handling for Claim buttons
    root.addEventListener("click", async (e)=>{
      const btn=e.target.closest("button[data-claim]");
      if (!btn) return;
      const id=btn.dataset.claim;
      btn.disabled=true; const old=btn.textContent; btn.textContent="Claiming…";
      const ok = await claimSeasonReward(id);
      if (ok){
        // Update local UI state: turn card into "claimed"
        const card = btn.closest(".sp-tier-card");
        if (card){
          card.classList.remove("locked","claimable");
          card.classList.add("claimed");
          const actions = card.querySelector(".sp-tier-actions");
          if (actions){
            actions.innerHTML = `${tierStateBadge("claimed")}`;
          }
        }
      }
      btn.disabled=false; btn.textContent=old;
    }, { passive:true });

    // (Optional) handle "Unlock Elite" CTA – here we just inform; your HTML/payment handles real unlock
    const upg = root.querySelector("#sp-upgrade-elite");
    if (upg){
      upg.addEventListener("click", ()=>{
        toast("Elite unlock flow is handled elsewhere. After purchase, reload this page.", "warn");
      });
    }
  }

  function renderLeaderboardUI(root, board){
    const host = root.querySelector(".sp-lb-wrap");
    if (!host) return;
    if (!Array.isArray(board) || board.length===0){
      host.innerHTML = `<div class="cv-empty">No leaderboard data yet.</div>`;
      return;
    }
    const table=document.createElement("table");
    table.className="sp-lb-table";
    table.innerHTML = `
      <thead>
        <tr><th>#</th><th>Player</th><th>Points</th></tr>
      </thead>
      <tbody></tbody>
    `;
    const tb=table.querySelector("tbody");
    board.slice(0,100).forEach((row,i)=>{
      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td>${safe(row.rank ?? (i+1))}</td>
        <td>${safe(row.wax_account || row.player || "-")}</td>
        <td>${safe(row.points ?? row.score ?? 0)}</td>
      `;
      tb.appendChild(tr);
    });
    host.innerHTML=""; host.appendChild(table);
  }

  // Boot the Season Pass page
  async function renderSeasonPass(){
    const root = document.getElementById("season-pass-root");
    if (!root) return;
    Cave.el.seasonRoot = root;
    root.innerHTML = spSkeleton();

    try{
      restoreUser(); assertAuth();
      const st = await API.get("/season_pass/status", 15000);
      if (!st.ok){ root.innerHTML = `<div class="cv-toast err">Failed to load Season Pass.</div>`; return; }
      Cave.seasonData = st.data || {};
      renderSeasonPassUI(root, Cave.seasonData);
    } catch {
      root.innerHTML = `<div class="cv-toast err">Season Pass load error.</div>`;
      return;
    }

    // Leaderboard (fetch separately)
    try{
      const lb = await API.get("/season_pass/leaderboard", 15000);
      if (lb.ok) { Cave.seasonLeaderboard = lb.data || []; renderLeaderboardUI(root, Cave.seasonLeaderboard); }
      else {
        const wrap=root.querySelector(".sp-lb-wrap");
        if (wrap) wrap.innerHTML = `<div class="cv-toast warn">Leaderboard unavailable.</div>`;
      }
    } catch {
      const wrap=root.querySelector(".sp-lb-wrap");
      if (wrap) wrap.innerHTML = `<div class="cv-toast err">Failed to load leaderboard.</div>`;
    }
  }

  // -----------------------------------
  // Public API
  // -----------------------------------
  window.renderDwarfsCave = window.renderDwarfsCave || renderDwarfsCave;
  window.renderSeasonPass = renderSeasonPass;

})();
