// Resolved via <script type="importmap"> in nuovo.html
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';


/* =========================
   CONFIGURAZIONE FINALE
========================= */
const GRID_WIDTH = 48;
const GRID_HEIGHT = 24;
const CELL_SIZE = 1;

const GOBLIN_SPEED = 3.5;          // celle / secondo
const CHEST_TRIGGER_RANGE = 3;     // 3x3
const SURPRISE_DURATION_MS = 1700;
const VICTORY_VISIBLE_MS = 5000;
const WANDER_REACH_EPS = 0.35;     // quanto vicino deve arrivare al target (celle)
const WANDER_MIN_MS = 700;         // minimo tempo prima di cambiare target
const WANDER_MAX_MS = 1600;        // massimo tempo prima di cambiare target
const WANDER_MARGIN = 1.2;         // margine dal bordo (celle)
const DIG_DURATION_MS = 4500;       // quanto dura il "digging" prima di consumare
const CHEST_CLAIM_DELAY_MS = 5000;  // ✅ attesa dopo il primo contatto prima del claim
const CHEST_Y_OFFSET = 0.15;        // altezza sopra il plot
const LABEL_Y_OFFSET = 1.40;
const FIX_GOBLIN_FLIP_X = Math.PI;  // ✅ 180°: testa su, piedi giù

const GOBLIN_Y_OFFSET = 0.05;       // piccolo offset sopra il plot
// === NAVMASK (bianco = walkable, nero = block) ===
const NAVMASK_URL = '/madverse/assets/navmask.png'; // <-- metti qui il path
const NAVMASK_THRESHOLD = 127; // 0..255 (>= soglia => bianco => walkable)
const NAVMASK_DEBUG = false;   // true se vuoi vedere overlay (facoltativo)
// orientamento modello: 0 se già “guarda avanti”, prova 0 / Math.PI/2 / -Math.PI/2 / Math.PI
const GOBLIN_FACING_OFFSET_Y = 0;
// === AVOIDANCE (goblin vs goblin) ===
const GOBLIN_RADIUS = 0.55;          // raggio “personaggio” in celle (tuning)
const AVOID_RANGE = 1.4;             // distanza entro cui iniziano ad evitarsi (celle)
const AVOID_PUSH = 2.2;              // forza repulsione (celle/sec)
const AVOID_MAX_NEIGHBORS = 8;       // cap per performance
// === SPACING (anti-ammasso) ===
const SPREAD_RANGE = 4.2;         // raggio "sociale" (celle) entro cui si sente la pressione folla
const SPREAD_STRENGTH = 0.26;     // quanto pesa lo spread sulla direzione (0.10..0.35)
const SPREAD_SPEED_DAMP = 0.15;   // rallenta leggermente se in zona affollata (0..0.30)

// === GAIT / VARIAZIONE ANDATURA ===
const GAIT_CHANGE_MIN_MS = 5000;
const GAIT_CHANGE_MAX_MS = 10000;
const SPEED_MIN_MULT = 0.75;
const SPEED_MAX_MULT = 1.25;
const ANIM_MIN_MULT  = 0.80;
const ANIM_MAX_MULT  = 1.35;

/* =========================
   ACCESSO STATO GIOCO
========================= */
const GameState = window.__GOBLIN_DEX_STATE__;
if (!GameState) {
  throw new Error('GameState non trovato: esporre State come window.__GOBLIN_DEX_STATE__');
}

/* =========================
   UTILS
========================= */
function cellToWorld(x, y) {
  return new THREE.Vector3(
    (x - GRID_WIDTH / 2) * CELL_SIZE,
    0,
    (y - GRID_HEIGHT / 2) * CELL_SIZE
  );
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function cellKey(ix, iy) {
  return `${ix},${iy}`;
}

function clampCellToGrid(cell) {
  cell.x = THREE.MathUtils.clamp(cell.x, 0, GRID_WIDTH - 1e-6);
  cell.y = THREE.MathUtils.clamp(cell.y, 0, GRID_HEIGHT - 1e-6);
  return cell;
}

// converte coordinate float "cell" -> indici cella (0..W-1 / 0..H-1)
function toCellIndex(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return {
    ix: THREE.MathUtils.clamp(ix, 0, GRID_WIDTH - 1),
    iy: THREE.MathUtils.clamp(iy, 0, GRID_HEIGHT - 1)
  };
}

function makeLabelSprite(text, borderColorCss) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 512;
  canvas.height = 128;

  // background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // bordo (colore random passato)
  ctx.strokeStyle = borderColorCss || 'rgba(56,189,248,0.9)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // testo
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || '').slice(0, 20), canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });

  const spr = new THREE.Sprite(mat);
  spr.scale.set(2.6, 0.65, 1);
  spr.renderOrder = 50;

  return spr;
}

/* =========================
   GOBLIN CONTROLLER
========================= */
class Goblin {
  constructor(template, clips, startCell, owner, onDigComplete, isWalkable) {
   // pivot per rotazioni (yaw)
   this.root = new THREE.Group();
   // modello vero e proprio
   this.model = SkeletonUtils.clone(template);
   this.root.add(this.model);
     this.model.scale.setScalar(1.5);
    this.owner = owner || 'player';
    this.onDigComplete = onDigComplete;
   this.isWalkable = typeof isWalkable === 'function' ? isWalkable : (() => true);

    // ✅ fix orientation (if model appears flipped)
if (FIX_GOBLIN_FLIP_X) {
  this.model.rotation.x = FIX_GOBLIN_FLIP_X;
}

   // ✅ colore cornice random per questo goblin (stabile: scelto una volta sola)
   const hue = Math.floor(Math.random() * 360);
   const borderColor = `hsla(${hue}, 95%, 60%, 0.95)`;
   
   // ✅ label sotto i piedi
   this.label = makeLabelSprite(this.owner, borderColor);
   this.label.position.set(0, LABEL_Y_OFFSET, 0);
   this.model.add(this.label);   
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    clips.forEach(c => {
      const a = this.mixer.clipAction(c.clip);
      if (c.once) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[c.name] = a;
    });

    this.state = 'RUNNING';
    this.currentAction = null;

    this.cell = { ...startCell };
    this.target = { ...startCell };
    this.nextWanderAt = 0;
    this._pickRandomTarget();

    this.lastChestKey = null;
    this.visible = true;
    this.digUntil = 0;
    this.digChestKey = null;
    this.digFired = false;
      // === facing (direzione di movimento) ===
      this.facing = new THREE.Vector2(0, 1); // direzione iniziale "in avanti"
      this.turnSpeed = 10; // rad/sec (più alto = gira più veloce)
      // === DNA personale (ogni goblin diverso) ===
      this.baseSpeed = GOBLIN_SPEED * (0.9 + Math.random() * 0.25); // DNA base
      this.speedMult = 1.0;
      this.animMult = 1.0;
      
      // ✅ DNA personale per la variazione andatura (ogni goblin diverso)
      this.gaitMinMs = GAIT_CHANGE_MIN_MS + Math.random() * 2500;      // 5s..7.5s
      this.gaitMaxMs = GAIT_CHANGE_MAX_MS + Math.random() * 3500;      // 10s..13.5s
      
      this.speedMin = SPEED_MIN_MULT + Math.random() * 0.10;           // es: 0.75..0.85
      this.speedMax = SPEED_MAX_MULT - Math.random() * 0.10;           // es: 1.15..1.25
      
      this.animMin  = ANIM_MIN_MULT  + Math.random() * 0.10;           // es: 0.80..0.90
      this.animMax  = ANIM_MAX_MULT  - Math.random() * 0.10;           // es: 1.25..1.35
      
      this.strideBias = 0.85 + Math.random() * 0.35;                   // “pompa” personale
      
      this.nextGaitChangeAt = performance.now() + (this.gaitMinMs + Math.random() * (this.gaitMaxMs - this.gaitMinMs));
    this._play('RUNNING');
  }

  _play(name) {
    if (this.currentAction === name) return;
    if (this.currentAction) {
      this.actions[this.currentAction].fadeOut(0.25);
    }
    this.actions[name].reset().fadeIn(0.25).play();
    this.currentAction = name;
  }

   _pickRandomTarget() {
     const now = performance.now();
     this.nextWanderAt = now + (WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS));
   
     // prova un po’ di tentativi random su celle walkable
     for (let k = 0; k < 40; k++) {
       const x = Math.random() * GRID_WIDTH;
       const y = Math.random() * GRID_HEIGHT;
   
       const { ix, iy } = toCellIndex(x, y);
       if (this.isWalkable(ix, iy)) {
         this.target = { x, y };
         return;
       }
     }
   
     // fallback: resta dove sei (evita target impossibili)
     this.target = { x: this.cell.x, y: this.cell.y };
   }
   
   _updateGait(now) {
     if (now < this.nextGaitChangeAt) return;
      this.nextGaitChangeAt =
        now + (this.gaitMinMs + Math.random() * (this.gaitMaxMs - this.gaitMinMs));
      this.speedMult = this.speedMin + Math.random() * (this.speedMax - this.speedMin);
      this.animMult  = this.animMin  + Math.random() * (this.animMax  - this.animMin);
     // applica all’azione corrente (solo RUNNING/DIGGING per non alterare troppo le once)
     if (this.actions.RUNNING) this.actions.RUNNING.setEffectiveTimeScale(this.animMult * this.speedMult * this.strideBias);
     if (this.actions.DIGGING) this.actions.DIGGING.setEffectiveTimeScale(0.95 + (this.animMult - 1) * 0.4);
   }
      
update(dt, chest, neighbors) {
  if (!this.visible) return;

  const now = performance.now();
  this._updateGait(now);

  /* ====== VICTORY ====== */
  if (this.state === 'VICTORY') {
    this.mixer.update(dt);
    return;
  }

  /* ====== CHEST LOGIC ====== */
  if (chest) {
    const chestKey = `${chest.world.x}:${chest.world.y}`;

    if (this.lastChestKey !== chestKey) {
      this.lastChestKey = chestKey;
      this.state = 'SURPRISED';
      this.surpriseUntil = now + SURPRISE_DURATION_MS;
      this._play('SURPRISED');
    }

    if (this.state === 'SURPRISED') {
      if (now >= this.surpriseUntil) {
        this.state = 'MOVING_TO_CHEST';
        this._play('RUNNING');
      }
      this.mixer.update(dt);
      return;
    }

    this.target = chest.world;
    const dist = chebyshev(this.cell, this.target);

      if (dist <= CHEST_TRIGGER_RANGE) {
        if (this.state !== 'DIGGING') {
          this.state = 'DIGGING';
          this._play('DIGGING');
      
          // timer interno solo per “tenere” l’animazione digging un minimo
          this.digChestKey = chestKey;
          this.digUntil = now + DIG_DURATION_MS;
          this.digFired = false;
        }
      
        // ✅ segnala solo che "ho toccato" (una volta per chestKey)
        if (!this.digFired && this.digChestKey === chestKey && now >= this.digUntil) {
          this.digFired = true; // “ho completato la fase digging”
          // NIENTE claim qui: sarà il runtime a decidere winner + delay
        }
      } else {

      this.state = 'MOVING_TO_CHEST';
      this._play('RUNNING');
    }
  } else {
    this.lastChestKey = null;
    this.digUntil = 0;
    this.digChestKey = null;
    this.digFired = false;

    if (this.state !== 'RUNNING') {
      this.state = 'RUNNING';
      this._play('RUNNING');
    }

    // wander: target scade o raggiunto => nuovo target
    const dx0 = this.target.x - this.cell.x;
    const dy0 = this.target.y - this.cell.y;
    const dist0 = Math.hypot(dx0, dy0);

    if (dist0 <= WANDER_REACH_EPS || now >= this.nextWanderAt) {
      this._pickRandomTarget();
    }
  }

  /* ====== MOVEMENT + AVOIDANCE + FACING ====== */
  if (this.state === 'RUNNING' || this.state === 'MOVING_TO_CHEST') {
    const dx = this.target.x - this.cell.x;
    const dy = this.target.y - this.cell.y;
    const len = Math.hypot(dx, dy);

    if (len > 0.01) {
      const dirx = dx / len;
      const diry = dy / len;

      // velocità effettiva (DNA + mood ogni 5-10s)
      let speed = this.baseSpeed * this.speedMult;

      // === AVOIDANCE + SPREAD: repulsione dai vicini (vicina) + tendenza a disperdersi (largo) ===
      let ax = 0, ay = 0;      // avoidance vicino (forte)
      let sx = 0, sy = 0;      // spread largo (morbido)
      let crowd = 0;           // quanto è affollato attorno
      let checked = 0;
      
      if (neighbors && neighbors.length) {
        for (let i = 0; i < neighbors.length; i++) {
          const o = neighbors[i];
          if (!o || o === this || !o.visible) continue;
      
          const rx = this.cell.x - o.cell.x;
          const ry = this.cell.y - o.cell.y;
          const d2 = rx * rx + ry * ry;
          if (d2 < 0.000001) continue;
      
          const d = Math.sqrt(d2);
      
          // 1) avoidance ravvicinato (come prima)
          if (d <= AVOID_RANGE) {
            const t = 1 - (d / AVOID_RANGE);
            ax += (rx / d) * t;
            ay += (ry / d) * t;
      
            // push extra quando sono MOLTO vicini
            if (d < GOBLIN_RADIUS * 2.0) {
              ax += (rx / d) * AVOID_PUSH;
              ay += (ry / d) * AVOID_PUSH;
            }
      
            // se davanti e molto vicino -> rallenta
            const forward = dirx * (-rx) + diry * (-ry);
            if (forward > 0 && d < GOBLIN_RADIUS * 2.0) {
              speed *= 0.55;
            }
          }
      
          // 2) spread largo: "pressione folla" entro SPREAD_RANGE
          if (d <= SPREAD_RANGE) {
            const t2 = 1 - (d / SPREAD_RANGE);   // 0..1
            sx += (rx / d) * t2;
            sy += (ry / d) * t2;
            crowd += t2;
          }
      
          checked++;
          if (checked >= AVOID_MAX_NEIGHBORS) break;
        }
      }

      // normalizza avoidance vicino (ax,ay)
      const alen = Math.hypot(ax, ay);
      if (alen > 0.0001) { ax /= alen; ay /= alen; } else { ax = 0; ay = 0; }
      
      // normalizza spread largo (sx,sy)
      const slen = Math.hypot(sx, sy);
      if (slen > 0.0001) { sx /= slen; sy /= slen; } else { sx = 0; sy = 0; }
      
      // se zona affollata, rallenta un filo (tende a non accalcarsi)
      if (crowd > 0.01) {
        speed *= (1.0 - Math.min(SPREAD_SPEED_DAMP, crowd * 0.12));
      }
      
      // mix direzione: target + avoidance vicino + spread largo
      let mx = dirx;
      let my = diry;
      
      // avoidance vicino: forte e prioritario
      const avoidMix = (alen > 0.0001) ? 0.28 : 0.0;     // come prima
      mx = mx * (1 - avoidMix) + ax * avoidMix;
      my = my * (1 - avoidMix) + ay * avoidMix;
      
      // spread largo: morbido, sempre se c’è “pressione”
      const spreadMix = (slen > 0.0001) ? SPREAD_STRENGTH : 0.0;
      mx = mx * (1 - spreadMix) + sx * spreadMix;
      my = my * (1 - spreadMix) + sy * spreadMix;
      
      // facing finale
      const mlen = Math.hypot(mx, my) || 1;
      this.facing.set(mx / mlen, my / mlen);

      // movimento col facing finale
      const nx = this.cell.x + this.facing.x * speed * dt;
      const ny = this.cell.y + this.facing.y * speed * dt;

      const { ix, iy } = toCellIndex(nx, ny);

      if (!this.isWalkable(ix, iy)) {
        this._pickRandomTarget();
      } else {
        this.cell.x = nx;
        this.cell.y = ny;
      }
    }
  }

  /* ====== ROTAZIONE VERSO DIREZIONE ====== */
  if (this.facing.lengthSq() > 0.0001) {
    const desiredYaw =
      Math.atan2(this.facing.x, this.facing.y) + GOBLIN_FACING_OFFSET_Y;

    const currentYaw = this.root.rotation.y;

    let delta = desiredYaw - currentYaw;
    delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;

    this.root.rotation.y = currentYaw + delta * Math.min(1, this.turnSpeed * dt);
  }

  /* ====== CLAMP + NAVMASK SAFETY ====== */
  this.cell.x = THREE.MathUtils.clamp(this.cell.x, 0, GRID_WIDTH - 1e-6);
  this.cell.y = THREE.MathUtils.clamp(this.cell.y, 0, GRID_HEIGHT - 1e-6);

  const c = toCellIndex(this.cell.x, this.cell.y);
  if (!this.isWalkable(c.ix, c.iy)) {
    this._pickRandomTarget();
  }

  /* ====== ANIM UPDATE ====== */
  this.mixer.update(dt);
}


  worldPosition() {
    return cellToWorld(this.cell.x, this.cell.y);
  }

  finish() {
    this.state = 'VICTORY';
    this._play('VICTORY');
    setTimeout(() => {
      this.visible = false;
      this.root.visible = false;
    }, VICTORY_VISIBLE_MS);
  }
}

/* =========================
   THREE RUNTIME
========================= */
export class ThreeRuntime {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });
// ✅ colori corretti (sRGB) + resa più “viva”
this.renderer.outputColorSpace = THREE.SRGBColorSpace;
this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
this.renderer.toneMappingExposure = 1.1;

// (opzionale ma consigliato per nitidezza)
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(
      -GRID_WIDTH / 2,
      GRID_WIDTH / 2,
      GRID_HEIGHT / 2,
      -GRID_HEIGHT / 2,
      0.1,
      100
    );

    this.camera.position.set(0, 20, 0);
    this.camera.lookAt(0, 0, 0);

// ✅ luci migliori: colori più fedeli e goblin “leggibili”
this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.75);
hemi.position.set(0, 50, 0);
this.scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.15);
dir.position.set(20, 40, 10);
this.scene.add(dir);


    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();

    this.goblins = new Map();
      this.missingTicks = new Map();   // id -> contatore assenze
      this.MISSING_TICKS_BEFORE_REMOVE = 6; // es: 6 sync consecutivi
      
      this.drop = null;
      this.chestSprite = null;
      
      // claim state
      this.claimChestKey = null;         // chestKey per cui abbiamo già claimato (anti-doppio)
      this.pendingClaimKey = null;       // chestKey attualmente in attesa dei 5s
      this.pendingClaimAt = 0;           // timestamp (ms) quando fare claim
      this.pendingWinnerId = null;       // expedition id del primo goblin che l’ha toccata
      
      // navmask
      this.walkable = null;        // Uint8Array GRID_WIDTH*GRID_HEIGHT (1=ok,0=block)
      this.walkableReady = false;
  }

  async init() {
    this._initRenderer();
    this._loadPlot();
    this._loadChest();
   await Promise.all([
     this._loadGoblinAssets(),
     this._loadNavMask()
   ]);
   
   this._loop();

  }

  _initRenderer() {
    const resize = () => {
      const r = this.canvas.getBoundingClientRect();
      this.renderer.setSize(r.width, r.height, false);
    };
    resize();
    window.addEventListener('resize', resize);
  }

  _loadChest() {
    const tex = new THREE.TextureLoader().load('/madverse/chest_sprite.png');
     tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const spr = new THREE.Sprite(mat);

    spr.visible = false;
    spr.scale.set(3.0, 3.0, 1.0); // dimensione in celle
    spr.renderOrder = 10;

    this.chestSprite = spr;
    this.scene.add(spr);
  }
   
  _loadPlot() {
const tex = new THREE.TextureLoader().load('/madverse/assets/plot.png');
tex.colorSpace = THREE.SRGBColorSpace;

    const plane = new THREE.Mesh(
     new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT),
     new THREE.MeshBasicMaterial({
       map: tex,
       depthWrite: false   // ✅ IMPORTANTISSIMO: il piano non deve coprire i goblin
     })
   );
   plane.rotation.x = -Math.PI / 2;
   plane.renderOrder = 0;
   this.scene.add(plane);
  }

async _loadNavMask() {
  // fallback: se fallisce, tutto walkable
  const fallbackAll = () => {
    this.walkable = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    this.walkable.fill(1);
    this.walkableReady = true;
  };

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = NAVMASK_URL;
    });

    // leggiamo pixel via canvas
    const c = document.createElement('canvas');
    c.width = GRID_WIDTH;
    c.height = GRID_HEIGHT;
    const ctx = c.getContext('2d', { willReadFrequently: true });

    // stira l’immagine ai 48x24 (se è diversa di dimensione)
    ctx.drawImage(img, 0, 0, GRID_WIDTH, GRID_HEIGHT);

    const data = ctx.getImageData(0, 0, GRID_WIDTH, GRID_HEIGHT).data;

    this.walkable = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const idx = (y * GRID_WIDTH + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        // luminanza semplice
        const lum = (r + g + b) / 3;
        this.walkable[y * GRID_WIDTH + x] = lum >= NAVMASK_THRESHOLD ? 1 : 0;
      }
    }

    // sicurezza: se per errore è tutta nera -> fallback
    let any = 0;
    for (let i = 0; i < this.walkable.length; i++) any |= this.walkable[i];
    if (!any) fallbackAll();

    this.walkableReady = true;

    // (facoltativo) debug overlay
    if (NAVMASK_DEBUG) {
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.01;
      plane.renderOrder = 5;
      this.scene.add(plane);
    }
  } catch (e) {
    console.warn('NavMask load failed, using fallback (all walkable)', e);
    fallbackAll();
  }
}

isWalkableCell(ix, iy) {
  if (!this.walkableReady || !this.walkable) return true;
  ix = THREE.MathUtils.clamp(ix, 0, GRID_WIDTH - 1);
  iy = THREE.MathUtils.clamp(iy, 0, GRID_HEIGHT - 1);
  return this.walkable[iy * GRID_WIDTH + ix] === 1;
}

  async _loadGoblinAssets() {
    const base = await this.loader.loadAsync('/madverse/assets/goblin_run.glb');
    this.template = base.scene;

    this.clips = [
      { name: 'RUNNING', clip: base.animations[0] },
      { name: 'SURPRISED', clip: (await this.loader.loadAsync('/madverse/assets/goblin_surprised.glb')).animations[0], once: true },
      { name: 'DIGGING', clip: (await this.loader.loadAsync('/madverse/assets/goblin_digging.glb')).animations[0] },
      { name: 'VICTORY', clip: (await this.loader.loadAsync('/madverse/assets/goblin_victory.glb')).animations[0], once: true }
    ];
  }

  syncExpeditions(expeditions) {
    const active = new Set(
      (expeditions || []).map(e => String(e.expedition_id ?? e.id ?? e.expeditionId ?? ''))
    );

    (expeditions || []).forEach(e => {
      const id = String(e.expedition_id ?? e.id ?? e.expeditionId ?? '');
      if (!id) return;

      const owner = e.wax_account || e.owner || 'player';

      if (!this.goblins.has(id)) {
         // trova una cella walkable per lo spawn
         let sx = 0, sy = 0;
         for (let k = 0; k < 100; k++) {
           const x = Math.random() * GRID_WIDTH;
           const y = Math.random() * GRID_HEIGHT;
           const { ix, iy } = toCellIndex(x, y);
           if (this.isWalkableCell(ix, iy)) {
             sx = x;
             sy = y;
             break;
           }
         }
         
         const g = new Goblin(
           this.template,
           this.clips,
           { x: sx, y: sy },
           owner,
           (goblin, chest) => this._onGoblinDigComplete(goblin, chest),
           (ix, iy) => this.isWalkableCell(ix, iy)
         );



        this.scene.add(g.root);
        this.goblins.set(id, g);
this.missingTicks.set(id, 0);
         
      } else {
        // se vuoi aggiornare label quando cambia owner (di solito non cambia)
        const g = this.goblins.get(id);
        if (g && g.owner !== owner) {
          g.owner = owner;
        }
         this.missingTicks.set(id, 0);

      }
    });
      this.goblins.forEach((g, id) => {
        if (active.has(id)) {
          this.missingTicks.set(id, 0);
          return;
        }
      
        const n = (this.missingTicks.get(id) || 0) + 1;
        this.missingTicks.set(id, n);
      
        // ✅ rimuovi solo se manca per N sync consecutivi
        if (n >= this.MISSING_TICKS_BEFORE_REMOVE) {
          g.finish();
          this.goblins.delete(id);
          this.missingTicks.delete(id);
        }
      });
      
        }
      
        _onGoblinDigComplete(goblin, chest) {
         // Il claim lo farà _loop() dopo CHEST_CLAIM_DELAY_MS.
        }
      
      _tryStartDelayedClaim(goblinId, chest) {
        if (!chest) return;
      
        const chestKey = `${chest.world.x}:${chest.world.y}`;
      
        // se abbiamo già claimato questa chest, stop
        if (this.claimChestKey === chestKey) return;
      
        // se è già in pending per questa chest, non cambiare winner
        if (this.pendingClaimKey === chestKey) return;
      
        // ✅ primo contatto: fissiamo winner e countdown
        this.pendingClaimKey = chestKey;
        this.pendingWinnerId = goblinId;
        this.pendingClaimAt = performance.now() + CHEST_CLAIM_DELAY_MS;
      }
      
      _loop() {
        requestAnimationFrame(() => this._loop());
      
        let dt = this.clock.getDelta();
      
        // ✅ se il tab è stato in background o c'è un hitch, evita il "teletrasporto"
        if (dt > 0.12) dt = 0;
      
        // ✅ clamp ulteriore (max ~30 FPS step)
        dt = Math.min(dt, 1 / 30);
      
        const now = performance.now();
      
        const liveDrop = this.drop || GameState.drop?.current || null;
      
        // ✅ la chest deve restare visibile anche se lo state passa a non-visible,
        // finché abbiamo una pendingClaim attiva (i 5 secondi)
        const chestVisibleFromState = liveDrop && GameState.drop?.fx?.phase === 'visible';
        const chestVisibleFromPending = !!this.pendingClaimKey;
      
        const chest = (chestVisibleFromState || chestVisibleFromPending) ? liveDrop : null;
      
        // ✅ chest render
        if (this.chestSprite) {
          if (chest) {
            const p = cellToWorld(chest.world.x, chest.world.y);
            this.chestSprite.position.set(p.x, CHEST_Y_OFFSET, p.z);
            this.chestSprite.visible = true;
          } else {
            this.chestSprite.visible = false;
          }
        }
      
        // ---- UPDATE GOBLINS + DETECT FIRST CONTACT (WINNER) ----
        const pairs = Array.from(this.goblins.entries()); // [id, goblin]
        const neighbors = pairs.map(p => p[1]);          // per avoidance
      
        for (let i = 0; i < pairs.length; i++) {
          const [id, g] = pairs[i];
      
          // update goblin
          g.update(dt, chest, neighbors);
      
          // posizionamento
          const p = g.worldPosition();
          g.root.position.set(p.x, GOBLIN_Y_OFFSET, p.z);
      
          // ✅ primo goblin che entra nel range -> avvia countdown (5s)
          // IMPORTANT: solo se non c'è già pendingClaim
          if (chest && !this.pendingClaimKey) {
            const dist = chebyshev(g.cell, chest.world);
            if (dist <= CHEST_TRIGGER_RANGE) {
              this._tryStartDelayedClaim(id, chest);
            }
          }
        }
      
        // ---- DOPO 5s: CLAIM UNA SOLA VOLTA ----
        if (this.pendingClaimKey && now >= this.pendingClaimAt) {
          // blocca doppi claim
          this.claimChestKey = this.pendingClaimKey;
      
          // reset pending prima di chiamare (sicurezza)
          this.pendingClaimKey = null;
          this.pendingWinnerId = null;
          this.pendingClaimAt = 0;
      
          // ✅ claim reale
          if (typeof window.claimActiveDrop === 'function') {
            window.claimActiveDrop();
          } else {
            if (window.__GOBLIN_DEX_STATE__?.drop?.fx) {
              window.__GOBLIN_DEX_STATE__.drop.fx.phase = 'idle';
            }
          }
        }
      
        this.renderer.render(this.scene, this.camera);
      }
         
  setDrop(drop) {
    this.drop = drop || null;
    if (!drop) {
      this.claimChestKey = null;
    }
  }
}
