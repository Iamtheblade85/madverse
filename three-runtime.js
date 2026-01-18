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

const GOBLIN_SPEED = 3.5; // celle / secondo
const CHEST_TRIGGER_RANGE = 3; // 3x3
const SURPRISE_DURATION_MS = 1700;
const VICTORY_VISIBLE_MS = 5000;

// più “esplorazione”: cambia target molto meno spesso
const WANDER_REACH_EPS = 0.22; // deve arrivare più vicino prima di cambiare
const WANDER_MIN_MS = 2000; // 2.0s
const WANDER_MAX_MS = 3500; // 3.5s
const WANDER_MARGIN = 1.2; // margine dal bordo (celle)

const DIG_DURATION_MS = 4500; // quanto dura il "digging" prima di consumare
const CHEST_CLAIM_DELAY_MS = 5000; // ✅ attesa dopo il primo contatto prima del claim
const CHEST_Y_OFFSET = 0.15; // altezza sopra il plot

// Badge “baseline” a terra (asse Y del mondo/plot)
const LABEL_Y_OFFSET = 0.95;

const FIX_GOBLIN_FLIP_X = Math.PI; // ✅ 180°: testa su, piedi giù
const GOBLIN_Y_OFFSET = 0.05; // piccolo offset sopra il plot

// === NAVMASK (bianco = walkable, nero = block) ===
const NAVMASK_URL = '/madverse/navmask.png'; // <-- metti qui il path
const NAVMASK_THRESHOLD = 127; // 0..255 (>= soglia => bianco => walkable)
const NAVMASK_DEBUG = false; // true se vuoi vedere overlay (facoltativo)

// orientamento modello: 0 se già “guarda avanti”, prova 0 / Math.PI/2 / -Math.PI/2 / Math.PI
const GOBLIN_FACING_OFFSET_Y = 0;

// === AVOIDANCE (goblin vs goblin) ===
const GOBLIN_RADIUS = 0.55; // raggio “personaggio” in celle (tuning)
const AVOID_RANGE = 1.4; // distanza entro cui iniziano ad evitarsi (celle)
const AVOID_PUSH = 2.2; // forza repulsione (celle/sec)
const AVOID_MAX_NEIGHBORS = 8; // cap per performance

// === SPACING (anti-ammasso) ===
const SPREAD_RANGE = 4.2; // raggio "sociale" (celle) entro cui si sente la pressione folla
const SPREAD_STRENGTH = 0.26; // quanto pesa lo spread sulla direzione (0.10..0.35)
const SPREAD_SPEED_DAMP = 0.15; // rallenta leggermente se in zona affollata (0..0.30)

// === GAIT / VARIAZIONE ANDATURA ===
const GAIT_CHANGE_MIN_MS = 5000;
const GAIT_CHANGE_MAX_MS = 10000;
const SPEED_MIN_MULT = 0.75;
const SPEED_MAX_MULT = 1.25;
const ANIM_MIN_MULT = 0.8;
const ANIM_MAX_MULT = 1.35;

/* =========================
   LOADING FX (procedurale)
========================= */
const LOADING_FX_COUNT = 42; // quanti "ologrammi"
const LOADING_FX_AREA_PAD = 1.5; // margine dentro il plot
const LOADING_FX_MIN_SPEED = 0.25;
const LOADING_FX_MAX_SPEED = 0.95;
const LOADING_FX_MIN_SCALE = 0.7;
const LOADING_FX_MAX_SCALE = 1.8;
const LOADING_FX_BASE_Y = 0.1; // altezza sopra il plot
const LOADING_FX_Y_WAVE = 0.28; // ampiezza oscillazione

const LOADING_BG_DIM = 0.22; // quanto scurisce lo sfondo
const LOADING_FOG_DENSITY = 0.055; // atmosfera
const LOADING_PARTICLES = 900; // più = più ricco (900 ok)
const LOADING_PARTICLE_AREA_PAD = 0.6;
const LOADING_PARTICLE_Y_MIN = 0.08;
const LOADING_PARTICLE_Y_MAX = 1.9;
const LOADING_PARTICLE_SPEED = 0.22;
const LOADING_PARTICLE_SWIRL = 0.45;
const LOADING_RING_COUNT = 6; // cerchi concentrici

/* =========================
   COINS (ADD-ON FEDELE)
   - NON altera Goblin controller
   - aggiunge solo runtime logic
========================= */
const COIN_GLB_URL = '/madverse/assets/coin.glb';

// “intro” gruppo coins: prima la storm, poi drop coins
const COIN_GROUP_INTRO_MS = 10000;
const COIN_GROUP_CLOUDS_START_MS = 5000;

// drop animation
const COIN_DROP_BASE_HEIGHT = 9.5;
const COIN_DROP_HEIGHT_JITTER = 2.2;
const COIN_DROP_LATERAL_JITTER = 1.8;
const COIN_DROP_MIN_TIME = 1.2;
const COIN_DROP_MAX_TIME = 2.3;
const COIN_DROP_ROT_MIN = 2.2;
const COIN_DROP_ROT_MAX = 6.0;
const COIN_DROP_BOUNCE = 0.22;
const COIN_DROP_SETTLE_MS = 420;

const COIN_SCALE_MIN = 0.55;
const COIN_SCALE_MAX = 0.85;

const COIN_GROUND_Y = 0.06;
const COIN_RING_Y = 0.03;
const COIN_RING_MIN = 0.55;
const COIN_RING_MAX = 1.55;

const COIN_PICKUP_TRIGGER_RANGE = 1.35;
const COIN_CLAIM_DELAY_MS = 900;

// storm toggling: si attiva SOLO se ci sono coins attive o group in arrivo
const STORM_DIM_OPACITY = 0.22;
const STORM_FOG_DENSITY = 0.02;
const STORM_RAIN_DROPS = 2400;
const STORM_RAIN_Y_MIN = 0.35;
const STORM_RAIN_Y_MAX = 9.0;
const STORM_RAIN_SPEED_MIN = 7.5;
const STORM_RAIN_SPEED_MAX = 13.5;
const STORM_RAIN_WIND = 0.55;
const STORM_RAIN_SIZE_MIN = 0.04;
const STORM_RAIN_SIZE_MAX = 0.08;

const STORM_SPLASH_POOL = 160;
const STORM_SPLASH_RATE = 26;
const STORM_SPLASH_LIFE = 0.55;

const STORM_LIGHTNING_FLASH_MIN_MS = 420;
const STORM_LIGHTNING_FLASH_MAX_MS = 1200;
const STORM_LIGHTNING_PLANE_COUNT = 10;
const STORM_LIGHTNING_HEIGHT = 8.5;

const STORM_CLOUD_COUNT = 2;
const STORM_CLOUD_Y = 6.7;
const STORM_CLOUD_ENTER_MS = 5200;
const STORM_CLOUD_DRIFT = 0.32;

/* =========================
   UTILS
========================= */
function cellToWorld(x, y) {
  return new THREE.Vector3((x - GRID_WIDTH / 2) * CELL_SIZE, 0, (y - GRID_HEIGHT / 2) * CELL_SIZE);
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
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
    depthTest: false,
    depthWrite: false
  });

  const spr = new THREE.Sprite(mat);
  spr.center.set(0.5, 0.0);

  spr.scale.set(2.6, 0.65, 1);
  spr.renderOrder = 50;

  return spr;
}

/* ============================================================
   UTILS EXTRA (coins/storm) - solo add-on, nessun impatto old
============================================================ */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smoothstep(t) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}
function easeOutCubic(t) {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}
function easeInOutSine(t) {
  t = clamp01(t);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function makeRadialTexture(size, inner, outer, alphaInner, alphaOuter, tint = [255, 220, 120]) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;

  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  g.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${alphaInner})`);
  g.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},${alphaOuter})`);

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCloudTexture(seed = 1, w = 1024, h = 512) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, w, h);

  // RNG deterministic
  let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const blob = (x, y, r, a) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  };

  ctx.globalCompositeOperation = 'source-over';
  for (let layer = 0; layer < 7; layer++) {
    const count = 55 + layer * 14;
    const baseA = 0.03 + layer * 0.018;
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = (0.25 + rnd() * 0.55) * h;
      const r = (0.08 + rnd() * 0.22) * (w * 0.18) * (0.85 + layer * 0.08);
      blob(x, y, r, baseA * (0.65 + rnd() * 0.9));
    }
  }

  // fade top/bottom
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0.0, 'rgba(255,255,255,0.0)');
  fade.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  fade.addColorStop(0.82, 'rgba(255,255,255,0.9)');
  fade.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* =========================
   GOBLIN CONTROLLER
   (IDENTICO AL TUO VECCHIO FILE - NON TOCCATO)
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
    this.isWalkable = typeof isWalkable === 'function' ? isWalkable : () => true;

    // ✅ fix orientation (if model appears flipped)
    if (FIX_GOBLIN_FLIP_X) {
      this.model.rotation.x = FIX_GOBLIN_FLIP_X;
    }

    // ✅ colore cornice random per questo goblin (stabile: scelto una volta sola)
    const hue = Math.floor(Math.random() * 360);
    const borderColor = `hsla(${hue}, 95%, 60%, 0.95)`;

    // ✅ label sotto i piedi (asse Y del mondo/plot, stabile)
    // La agganciamo al root così resta sempre “a terra” e non segue l’animazione dello scheletro
    this.label = makeLabelSprite(this.owner, borderColor);
    this.label.position.set(0, LABEL_Y_OFFSET, 0);
    this.root.add(this.label);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};

    clips.forEach((c) => {
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
    this.gaitMinMs = GAIT_CHANGE_MIN_MS + Math.random() * 2500; // 5s..7.5s
    this.gaitMaxMs = GAIT_CHANGE_MAX_MS + Math.random() * 3500; // 10s..13.5s

    this.speedMin = SPEED_MIN_MULT + Math.random() * 0.1; // es: 0.75..0.85
    this.speedMax = SPEED_MAX_MULT - Math.random() * 0.1; // es: 1.15..1.25

    this.animMin = ANIM_MIN_MULT + Math.random() * 0.1; // es: 0.80..0.90
    this.animMax = ANIM_MAX_MULT - Math.random() * 0.1; // es: 1.25..1.35

    this.strideBias = 0.85 + Math.random() * 0.35; // “pompa” personale

    this.nextGaitChangeAt =
      performance.now() + (this.gaitMinMs + Math.random() * (this.gaitMaxMs - this.gaitMinMs));

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
    this.animMult = this.animMin + Math.random() * (this.animMax - this.animMin);

    // applica all’azione corrente (solo RUNNING/DIGGING per non alterare troppo le once)
    if (this.actions.RUNNING) {
      this.actions.RUNNING.setEffectiveTimeScale(this.animMult * this.speedMult * this.strideBias);
    }
    if (this.actions.DIGGING) {
      this.actions.DIGGING.setEffectiveTimeScale(0.95 + (this.animMult - 1) * 0.4);
    }
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

        // === AVOIDANCE + SPREAD ===
        let ax = 0,
          ay = 0; // avoidance vicino (forte)
        let sx = 0,
          sy = 0; // spread largo (morbido)
        let crowd = 0; // quanto è affollato attorno
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

            // 1) avoidance ravvicinato
            if (d <= AVOID_RANGE) {
              const t = 1 - d / AVOID_RANGE;
              ax += (rx / d) * t;
              ay += (ry / d) * t;

              // push extra quando sono MOLTO vicini
              if (d < GOBLIN_RADIUS * 2.0) {
                ax += (rx / d) * AVOID_PUSH;
                ay += (ry / d) * AVOID_PUSH;
              }

              // se davanti e molto vicino -> rallenta
              const forward = dirx * -rx + diry * -ry;
              if (forward > 0 && d < GOBLIN_RADIUS * 2.0) {
                speed *= 0.55;
              }
            }

            // 2) spread largo
            if (d <= SPREAD_RANGE) {
              const t2 = 1 - d / SPREAD_RANGE; // 0..1
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
        if (alen > 0.0001) {
          ax /= alen;
          ay /= alen;
        } else {
          ax = 0;
          ay = 0;
        }

        // normalizza spread largo (sx,sy)
        const slen = Math.hypot(sx, sy);
        if (slen > 0.0001) {
          sx /= slen;
          sy /= slen;
        } else {
          sx = 0;
          sy = 0;
        }

        // se zona affollata, rallenta un filo
        if (crowd > 0.01) {
          speed *= 1.0 - Math.min(SPREAD_SPEED_DAMP, crowd * 0.12);
        }

        // mix direzione: target + avoidance vicino + spread largo
        let mx = dirx;
        let my = diry;

        const avoidMix = alen > 0.0001 ? 0.28 : 0.0;
        mx = mx * (1 - avoidMix) + ax * avoidMix;
        my = my * (1 - avoidMix) + ay * avoidMix;

        const spreadMix = slen > 0.0001 ? SPREAD_STRENGTH : 0.0;
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
      const desiredYaw = Math.atan2(this.facing.x, this.facing.y) + GOBLIN_FACING_OFFSET_Y;
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
   COIN ACTOR (runtime add-on)
========================= */
class CoinActor {
  constructor(id, world, groupId, root, ring, meta) {
    this.id = id;
    this.world = world; // cell coords {x,y}
    this.groupId = groupId || 'default';

    this.root = root;
    this.ring = ring;
    this.meta = meta || {};

    this.state = 'FALLING';
    this.spawnAt = performance.now();
    this.settledAt = 0;

    this.claimed = false;
    this.dead = false;
  }
}

/* =========================
   THREE RUNTIME
========================= */
export class ThreeRuntime {
  constructor(canvas, state) {
    if (!canvas) throw new Error('ThreeRuntime: canvas missing');
    if (!state) throw new Error('ThreeRuntime: state missing');

    this.canvas = canvas;
    this.state = state;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false
    });

    // ✅ colori corretti (sRGB) + resa più “viva”
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

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

    // ✅ luci più “bright / readable” (top-down) per evitare goblin troppo scuri
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));

    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1.05);
    hemi.position.set(0, 50, 0);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 2.25);
    dir.position.set(20, 40, 10);
    this.scene.add(dir);

    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();

    this.goblins = new Map();
    this.missingTicks = new Map(); // id -> contatore assenze
    this.MISSING_TICKS_BEFORE_REMOVE = 6; // es: 6 sync consecutivi

    this.drop = null;
    this.chestSprite = null;

    // claim state
    this.claimChestKey = null; // chestKey per cui abbiamo già claimato (anti-doppio)
    this.pendingClaimKey = null; // chestKey attualmente in attesa dei 5s
    this.pendingClaimAt = 0; // timestamp (ms) quando fare claim
    this.pendingWinnerId = null; // expedition id del primo goblin che l’ha toccata

    // navmask
    this.walkable = null; // Uint8Array GRID_WIDTH*GRID_HEIGHT (1=ok,0=block)
    this.walkableReady = false;

    // ===== LOADING FX =====
    this.assetsReady = false; // diventa true quando i GLB+navmask sono pronti
    this.loadingGroup = null; // THREE.Group con gli ologrammi
    this.loadingItems = []; // metadata per animazione
    this.loadingTime = 0;

    // ===== LOADING ENHANCED =====
    this.loadingBgPlane = null;
    this.loadingParticles = null; // THREE.Points
    this.loadingParticleMeta = null; // Float32Array speeds
    this.loadingRings = []; // mesh rings
    this.loadingTextSprite = null; // sprite testo
    this.loadingProgress = 0; // 0..1 (fake, ma bello)

    /* =========================
       COINS (ADD-ON) - SOLO runtime
    ========================= */
    this.pickupsSnapshot = new Map(); // id -> snap
    this.coinActors = new Map(); // id -> CoinActor
    this.coinGroups = new Map(); // groupId -> gating intro
    this.coinTargetByGoblin = new Map(); // goblinId -> CoinActor
    this.coinClaimPending = new Map(); // coinId -> {at,goblinId}
    this._lastCoinSyncAt = 0;

    this.coinTemplate = null;
    this.coinHasGlb = false;
    this.coinBaseMaterial = null;
    this.coinGlowTexture = null;
    this.coinRingTexture = null;
    this._coinAssetsPromise = null;
    this._coinAssetsReady = false;

    /* =========================
       STORM (ADD-ON) - SOLO runtime
    ========================= */
    this.storm = {
      active: false,
      intensity: 0,
      targetIntensity: 0,

      group: null,
      dimPlane: null,

      fogOn: false,
      prevFog: null,

      clouds: [],
      cloudTexA: null,
      cloudTexB: null,

      rain: null,
      rainMeta: null,

      splashes: [],
      splashCursor: 0,
      splashAccum: 0,

      lightningPlanes: [],
      lightningNextAt: 0,
      lightningFlashT: 0,
      lightningFlashDur: 0,
      lightningFlashPow: 0,
      lightningSide: 1
    };
  }

  /* =========================
     INIT (OLD) - identico,
     coins load sono LAZY (non alterano loading)
  ========================= */
  async init() {
    this._initRenderer();

    // renderizza subito plot + chest (anche se le texture arrivano un attimo dopo)
    this._loadPlot();
    this._loadChest();

    // ✅ avvia fx procedurale immediatamente
    this._startLoadingFx();

    // ✅ avvia subito il loop (così non hai schermo nero)
    this._loop();

    // carica assets “pesanti” in parallelo (OLD)
    await Promise.all([this._loadGoblinAssets(), this._loadNavMask()]);

    this.assetsReady = true;
    this._stopLoadingFx();
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

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false
    });

    const spr = new THREE.Sprite(mat);

    spr.visible = false;
    spr.scale.set(3.0, 3.0, 1.0); // dimensione in celle
    spr.renderOrder = 10;

    this.chestSprite = spr;
    this.scene.add(spr);
  }

  _loadPlot() {
    const tex = new THREE.TextureLoader().load('/madverse/plot01.png');
    tex.colorSpace = THREE.SRGBColorSpace;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT),
      new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xffffff,
        depthWrite: false // ✅ IMPORTANTISSIMO: il piano non deve coprire i goblin
      })
    );

    plane.rotation.x = -Math.PI / 2;
    plane.renderOrder = 0;
    this.scene.add(plane);
  }

  async _loadNavMask() {
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
          const r = data[idx],
            g = data[idx + 1],
            b = data[idx + 2];

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
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.35,
          depthWrite: false
        });
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

  _fixGoblinMaterials(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;

      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;

        // SRGB per le texture colore (fondamentale)
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;

        // Evita look metallico/spento
        if ('metalness' in m) m.metalness = 0.0;
        if ('roughness' in m) m.roughness = Math.min(m.roughness ?? 1.0, 0.95);

        // IMPORTANTISSIMO: niente emissive fisso che “sbianca/grigia”
        if ('emissiveIntensity' in m) m.emissiveIntensity = 0.0;

        m.needsUpdate = true;
      }
    });
  }

  async _loadGoblinAssets() {
    const base = await this.loader.loadAsync('/madverse/assets/goblin_run.glb');
    this.template = base.scene;

    // ✅ rende i materiali del goblin più leggibili e vivi
    this._fixGoblinMaterials(this.template);

    this.clips = [
      { name: 'RUNNING', clip: base.animations[0] },
      {
        name: 'SURPRISED',
        clip: (await this.loader.loadAsync('/madverse/assets/goblin_surprised.glb')).animations[0],
        once: true
      },
      {
        name: 'DIGGING',
        clip: (await this.loader.loadAsync('/madverse/assets/goblin_digging.glb')).animations[0]
      },
      {
        name: 'VICTORY',
        clip: (await this.loader.loadAsync('/madverse/assets/goblin_victory.glb')).animations[0],
        once: true
      }
    ];
  }

  /* =========================
     LOADING FX (OLD) - identico
  ========================= */
  _startLoadingFx() {
    if (this.loadingGroup) return;

    // atmosfera: fog leggero
    this.scene.fog = new THREE.FogExp2(0x00060a, LOADING_FOG_DENSITY);

    const g = new THREE.Group();
    g.renderOrder = 999;
    this.loadingGroup = g;
    this.loadingItems = [];
    this.loadingTime = 0;
    this.loadingProgress = 0;

    // 1) DIM layer (piano scuro sopra al plot)
    const dimMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: LOADING_BG_DIM,
      depthTest: false,
      depthWrite: false
    });
    const dimPlane = new THREE.Mesh(new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT), dimMat);
    dimPlane.rotation.x = -Math.PI / 2;
    dimPlane.position.y = 0.012;
    dimPlane.renderOrder = 998;
    this.loadingBgPlane = dimPlane;
    this.scene.add(dimPlane);

    // helper materiali “holo”
    const holoMat = (opacity = 0.5) =>
      new THREE.MeshBasicMaterial({
        color: 0x44ddff,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

    // 1.5) OLOGRAMMI “classici”
    const ringGeoSmall = new THREE.RingGeometry(0.25, 0.42, 28);
    const planeGeo = new THREE.PlaneGeometry(0.6, 0.22);
    const barGeo = new THREE.PlaneGeometry(0.9, 0.06);

    const randPos = () => {
      const x =
        Math.random() * (GRID_WIDTH - LOADING_FX_AREA_PAD * 2) - GRID_WIDTH / 2 + LOADING_FX_AREA_PAD;
      const z =
        Math.random() * (GRID_HEIGHT - LOADING_FX_AREA_PAD * 2) -
        GRID_HEIGHT / 2 +
        LOADING_FX_AREA_PAD;
      return { x, z };
    };

    for (let i = 0; i < LOADING_FX_COUNT; i++) {
      const { x, z } = randPos();

      // scegli “tipo” casuale (ring / plane / bar)
      const r = Math.random();
      const geo = r < 0.34 ? ringGeoSmall : r < 0.67 ? planeGeo : barGeo;

      // varia un filo il colore
      const mat = holoMat(0.2 + Math.random() * 0.35);
      mat.color.setHSL(0.52 + (Math.random() * 0.12 - 0.06), 0.85, 0.55);

      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; // top-down
      m.position.set(x, LOADING_FX_BASE_Y, z);

      const s = LOADING_FX_MIN_SCALE + Math.random() * (LOADING_FX_MAX_SCALE - LOADING_FX_MIN_SCALE);
      m.scale.setScalar(s);

      // tilt random
      m.rotation.z = (Math.random() * 2 - 1) * 0.9;

      this.loadingItems.push({
        mesh: m,
        speed: LOADING_FX_MIN_SPEED + Math.random() * (LOADING_FX_MAX_SPEED - LOADING_FX_MIN_SPEED),
        phase: Math.random() * Math.PI * 2,
        spin: (Math.random() * 2 - 1) * 1.2,
        drift: (Math.random() * 2 - 1) * 0.25,
        pulse: 0.6 + Math.random() * 1.2
      });

      g.add(m);
    }

    // 2) Rings concentrici
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 64);
    for (let i = 0; i < LOADING_RING_COUNT; i++) {
      const m = holoMat(0.18 + i * 0.03);
      m.color.setHSL(0.52 + i * 0.02, 0.9, 0.55);
      const ring = new THREE.Mesh(ringGeo, m);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, LOADING_FX_BASE_Y + 0.02 + i * 0.02, 0);
      ring.scale.setScalar(2.5 + i * 1.65);
      ring.renderOrder = 1000 + i;
      this.loadingRings.push(ring);
      g.add(ring);
    }

    // 3) Particelle (Points)
    const pCount = LOADING_PARTICLES;
    const pos = new Float32Array(pCount * 3);
    const spd = new Float32Array(pCount);

    for (let i = 0; i < pCount; i++) {
      const x =
        Math.random() * (GRID_WIDTH - LOADING_PARTICLE_AREA_PAD * 2) -
        GRID_WIDTH / 2 +
        LOADING_PARTICLE_AREA_PAD;
      const z =
        Math.random() * (GRID_HEIGHT - LOADING_PARTICLE_AREA_PAD * 2) -
        GRID_HEIGHT / 2 +
        LOADING_PARTICLE_AREA_PAD;
      const y = LOADING_PARTICLE_Y_MIN + Math.random() * (LOADING_PARTICLE_Y_MAX - LOADING_PARTICLE_Y_MIN);

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      spd[i] = 0.35 + Math.random() * 0.9;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.loadingParticleMeta = spd;

    const pMat = new THREE.PointsMaterial({
      size: 0.07,
      transparent: true,
      opacity: 0.55,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0x66f2ff
    });

    const points = new THREE.Points(pGeo, pMat);
    points.renderOrder = 1100;
    this.loadingParticles = points;
    g.add(points);

    // 4) Scan beam
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0x88ffff,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(GRID_WIDTH * 0.95, 0.55), scanMat);
    scan.rotation.x = -Math.PI / 2;
    scan.position.set(0, LOADING_FX_BASE_Y + 0.03, -GRID_HEIGHT / 2 + 1);
    scan.renderOrder = 1200;
    this.loadingItems.push({ mesh: scan, isScan: true, speed: 2.2, phase: 0 });
    g.add(scan);

    // 5) Testo “Loading…”
    const makeTextSprite = (text) => {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 256;
      const ctx = c.getContext('2d');

      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = 'rgba(0,0,0,0.0)';
      ctx.fillRect(0, 0, c.width, c.height);

      ctx.font = 'bold 72px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // glow
      ctx.shadowColor = 'rgba(80,240,255,0.85)';
      ctx.shadowBlur = 28;

      ctx.fillStyle = 'rgba(220,255,255,0.95)';
      ctx.fillText(text, c.width / 2, c.height / 2);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        depthWrite: false
      });

      const spr = new THREE.Sprite(mat);
      spr.scale.set(10.5, 2.6, 1);
      spr.position.set(0, 1.6, 0);
      spr.renderOrder = 1300;
      return spr;
    };

    this.loadingTextSprite = makeTextSprite('Loading assets…');
    g.add(this.loadingTextSprite);

    this.scene.add(g);
  }

  _stopLoadingFx() {
    if (!this.loadingGroup) return;

    // rimuovi fog
    this.scene.fog = null;

    // dim plane
    if (this.loadingBgPlane) {
      this.scene.remove(this.loadingBgPlane);
      this.loadingBgPlane.material?.dispose?.();
      this.loadingBgPlane.geometry?.dispose?.();
      this.loadingBgPlane = null;
    }

    // particles
    if (this.loadingParticles) {
      this.loadingParticles.geometry?.dispose?.();
      this.loadingParticles.material?.dispose?.();
      this.loadingParticles = null;
      this.loadingParticleMeta = null;
    }

    // rings
    for (const r of this.loadingRings) {
      r.geometry?.dispose?.();
      r.material?.dispose?.();
    }
    this.loadingRings = [];

    // text
    if (this.loadingTextSprite) {
      this.loadingTextSprite.material?.map?.dispose?.();
      this.loadingTextSprite.material?.dispose?.();
      this.loadingTextSprite = null;
    }

    this.loadingGroup.traverse((o) => {
      if (o.isMesh) {
        o.material?.dispose?.();
      }
    });

    this.scene.remove(this.loadingGroup);
    this.loadingGroup = null;
    this.loadingItems = [];
  }

  _updateLoadingFx(dt) {
    if (!this.loadingGroup) return;

    this.loadingTime += dt;
    const t = this.loadingTime;

    for (let i = 0; i < this.loadingItems.length; i++) {
      const it = this.loadingItems[i];
      const m = it.mesh;
      if (!m) continue;

      if (it.isScan) {
        m.position.z += it.speed * dt;
        if (m.position.z > GRID_HEIGHT / 2 - 1) {
          m.position.z = -GRID_HEIGHT / 2 + 1;
        }
        if (m.material) {
          m.material.opacity = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(t * 3.0));
        }
        continue;
      }

      const w = Math.sin(t * (1.2 + it.speed) + it.phase);
      m.position.y = LOADING_FX_BASE_Y + (0.5 + 0.5 * w) * LOADING_FX_Y_WAVE;

      m.rotation.z += it.spin * dt * 0.45;

      m.position.x += Math.sin(t * 0.6 + it.phase) * it.drift * dt;
      m.position.z += Math.cos(t * 0.7 + it.phase) * it.drift * dt;

      const op = 0.18 + 0.35 * (0.5 + 0.5 * Math.sin(t * it.pulse + it.phase));
      if (m.material) m.material.opacity = op;

      m.position.x = THREE.MathUtils.clamp(
        m.position.x,
        -GRID_WIDTH / 2 + LOADING_FX_AREA_PAD,
        GRID_WIDTH / 2 - LOADING_FX_AREA_PAD
      );
      m.position.z = THREE.MathUtils.clamp(
        m.position.z,
        -GRID_HEIGHT / 2 + LOADING_FX_AREA_PAD,
        GRID_HEIGHT / 2 - LOADING_FX_AREA_PAD
      );
    }

    this.loadingProgress = Math.min(1, this.loadingProgress + dt * 0.12);
    const t2 = this.loadingTime;

    for (let i = 0; i < this.loadingRings.length; i++) {
      const r = this.loadingRings[i];
      const pulse = 0.92 + 0.12 * Math.sin(t2 * (0.9 + i * 0.12));
      r.scale.setScalar((2.5 + i * 1.65) * pulse);
      r.rotation.z += dt * (0.15 + i * 0.05);
      r.material.opacity = 0.1 + 0.18 * (0.5 + 0.5 * Math.sin(t2 * 1.4 + i));
    }

    if (this.loadingParticles && this.loadingParticles.geometry) {
      const pos = this.loadingParticles.geometry.attributes.position.array;
      const spd = this.loadingParticleMeta;

      for (let i = 0; i < spd.length; i++) {
        const ix = i * 3;
        let x = pos[ix + 0];
        let y = pos[ix + 1];
        let z = pos[ix + 2];

        const s = spd[i] * LOADING_PARTICLE_SPEED;
        z += s * dt;
        x += Math.sin(t2 * 0.9 + i) * LOADING_PARTICLE_SWIRL * dt * 0.18;

        if (z > GRID_HEIGHT / 2 - 0.5) z = -GRID_HEIGHT / 2 + 0.5;

        pos[ix + 0] = x;
        pos[ix + 1] = y + Math.sin(t2 * 0.6 + i) * dt * 0.02;
        pos[ix + 2] = z;
      }

      this.loadingParticles.geometry.attributes.position.needsUpdate = true;

      this.loadingParticles.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t2 * 1.8));
    }

    for (let i = 0; i < this.loadingItems.length; i++) {
      const it = this.loadingItems[i];
      if (it.isScan && it.mesh && it.mesh.material) {
        it.mesh.material.opacity = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(t2 * 3.5));
      }
    }
  }

  /* =========================
     SYNC EXPEDITIONS (OLD) - identico
  ========================= */
  syncExpeditions(expeditions) {
    const active = new Set(
      (expeditions || []).map((e) => String(e.expedition_id ?? e.id ?? e.expeditionId ?? ''))
    );

    (expeditions || []).forEach((e) => {
      const id = String(e.expedition_id ?? e.id ?? e.expeditionId ?? '');
      if (!id) return;

      const owner = e.wax_account || e.owner || 'player';

      if (!this.goblins.has(id)) {
        // trova una cella walkable per lo spawn
        let sx = 0,
          sy = 0;
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

    if (this.claimChestKey === chestKey) return;
    if (this.pendingClaimKey === chestKey) return;

    this.pendingClaimKey = chestKey;
    this.pendingWinnerId = goblinId;
    this.pendingClaimAt = performance.now() + CHEST_CLAIM_DELAY_MS;
  }

  /* ============================================================
     COINS API PUBBLICA
     - setPickups(pickups) : snapshot server
     - onPickupClaimResult(payload) : ack server dopo claim
  ============================================================ */
  setPickups(pickups) {
    const now = performance.now();
    const next = new Map();

    (pickups || []).forEach((p) => {
      const id = String(p.pickup_id ?? p.id ?? p.pickupId ?? '');
      if (!id) return;

      const gx = p.group_id ?? p.groupId ?? p.group ?? 'default';
      const groupId = String(gx);

      const wx = p.world?.x ?? p.x ?? 0;
      const wy = p.world?.y ?? p.y ?? 0;

      const world = { x: Number(wx), y: Number(wy) };

      const expiresAtMs = Number(p.expires_at_ms ?? p.expiresAtMs ?? p.expiresAt ?? 0) || 0;
      const claimed = !!(p.claimed || p.isClaimed);

      next.set(id, {
        id,
        pickup_id: id,
        groupId,
        world,
        expiresAtMs,
        claimed,
        raw: p
      });

      // group gating (storm pre-drop)
      if (!this.coinGroups.has(groupId)) {
        this.coinGroups.set(groupId, {
          groupId,
          startAt: now,
          cloudsAt: now + COIN_GROUP_CLOUDS_START_MS,
          dropAt: now + COIN_GROUP_INTRO_MS,
          didDrop: false
        });
      }
    });

    this.pickupsSnapshot = next;

    // lazy-load assets coin (non altera init/old)
    this._ensureCoinAssetsLoaded().then(() => {
      this._syncCoinActorsFromSnapshot();
    });
  }

  onPickupClaimResult(payload) {
    const id = String(payload?.pickup_id ?? payload?.id ?? '');
    if (!id) return;

    const a = this.coinActors.get(id);
    if (a) {
      a.claimed = true;
      a.dead = true;
      a.root.visible = false;
      if (a.ring) a.ring.visible = false;
    }

    this.coinClaimPending.delete(id);
    const s = this.pickupsSnapshot.get(id);
    if (s) s.claimed = true;
  }

  async _ensureCoinAssetsLoaded() {
    if (this._coinAssetsReady) return true;
    if (this._coinAssetsPromise) return this._coinAssetsPromise;

    this._coinAssetsPromise = (async () => {
      this.coinGlowTexture = makeRadialTexture(256, 6, 128, 0.9, 0.0, [255, 230, 140]);
      this.coinRingTexture = makeRadialTexture(512, 40, 220, 0.55, 0.0, [255, 200, 90]);

      this.coinBaseMaterial = new THREE.MeshStandardMaterial({
        color: 0xffd166,
        metalness: 0.15,
        roughness: 0.42,
        emissive: new THREE.Color(0x2a1500),
        emissiveIntensity: 0.12
      });

      try {
        const glb = await this.loader.loadAsync(COIN_GLB_URL);
        const scene = glb.scene;

        scene.traverse((o) => {
          if (!o.isMesh) return;
          if (o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
          if (o.material && 'metalness' in o.material) o.material.metalness = 0.2;
          if (o.material && 'roughness' in o.material)
            o.material.roughness = Math.min(o.material.roughness ?? 0.6, 0.7);
          if (o.material && 'emissiveIntensity' in o.material) o.material.emissiveIntensity = 0.0;
        });

        this.coinTemplate = scene;
        this.coinHasGlb = true;
      } catch (e) {
        const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 32, 1, false);
        const mesh = new THREE.Mesh(geo, this.coinBaseMaterial);
        const g = new THREE.Group();
        g.add(mesh);

        this.coinTemplate = g;
        this.coinHasGlb = false;
      }

      this._coinAssetsReady = true;
      return true;
    })();

    return this._coinAssetsPromise;
  }

  _syncCoinActorsFromSnapshot() {
    if (!this._coinAssetsReady) return;

    const now = performance.now();
    const aliveIds = new Set(this.pickupsSnapshot.keys());

    this.pickupsSnapshot.forEach((snap, id) => {
      const g = this.coinGroups.get(snap.groupId);
      const gateOk = !g || now >= g.dropAt;
      if (!gateOk) return;

      if (snap.expiresAtMs && Date.now() >= snap.expiresAtMs) return;
      if (snap.claimed) return;

      if (!this.coinActors.has(id)) {
        const a = this._spawnCoinActor(snap);
        if (a) this.coinActors.set(id, a);
      } else {
        const a = this.coinActors.get(id);
        if (a && a.world) a.world = snap.world;
      }
    });

    this.coinActors.forEach((a, id) => {
      if (!aliveIds.has(id)) a.dead = true;

      if (a.claimed) a.dead = true;

      const snap = this.pickupsSnapshot.get(id);
      if (snap && snap.expiresAtMs && Date.now() >= snap.expiresAtMs) a.dead = true;

      if (a.dead) {
        if (a.root && a.root.parent) a.root.parent.remove(a.root);
        if (a.ring && a.ring.parent) a.ring.parent.remove(a.ring);
        this.coinActors.delete(id);
      }
    });

    this._cleanupCoinGroups();
  }

  _cleanupCoinGroups() {
    const presentGroups = new Set();
    this.pickupsSnapshot.forEach((s) => presentGroups.add(String(s.groupId)));

    this.coinGroups.forEach((g, gid) => {
      const anyActors = Array.from(this.coinActors.values()).some((a) => a.groupId === gid && !a.dead);
      const anySnapshot = presentGroups.has(gid);
      if (!anyActors && !anySnapshot) this.coinGroups.delete(gid);
    });
  }

  _spawnCoinActor(snap) {
    if (!this.coinTemplate) return null;

    const root = new THREE.Group();
    const model = SkeletonUtils.clone(this.coinTemplate);
    root.add(model);

    const wpos = cellToWorld(snap.world.x, snap.world.y);

    const seedScale = randRange(COIN_SCALE_MIN, COIN_SCALE_MAX);
    root.scale.setScalar(seedScale);

    const startH = COIN_DROP_BASE_HEIGHT + randRange(-COIN_DROP_HEIGHT_JITTER, COIN_DROP_HEIGHT_JITTER);
    root.position.set(
      wpos.x + randRange(-COIN_DROP_LATERAL_JITTER, COIN_DROP_LATERAL_JITTER),
      startH,
      wpos.z + randRange(-COIN_DROP_LATERAL_JITTER, COIN_DROP_LATERAL_JITTER)
    );

    const fallT = randRange(COIN_DROP_MIN_TIME, COIN_DROP_MAX_TIME);
    const rotSpeed = randRange(COIN_DROP_ROT_MIN, COIN_DROP_ROT_MAX);
    const rotAxis = new THREE.Vector3(randRange(-1, 1), randRange(-0.15, 1), randRange(-1, 1)).normalize();

    root.rotation.set(randRange(-0.7, 0.7), randRange(0, Math.PI * 2), randRange(-0.7, 0.7));

    model.traverse((o) => {
      if (!o.isMesh) return;
      if (this.coinHasGlb) {
        if (o.material) {
          const m = o.material.clone ? o.material.clone() : o.material;
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          if ('metalness' in m) m.metalness = Math.max(0.15, m.metalness ?? 0.15);
          if ('roughness' in m) m.roughness = Math.min(m.roughness ?? 0.6, 0.75);
          if ('emissiveIntensity' in m) m.emissiveIntensity = 0.0;
          o.material = m;
        }
      } else {
        o.material = this.coinBaseMaterial;
      }
      o.castShadow = false;
      o.receiveShadow = false;
      o.renderOrder = 30;
    });

    // ring glow on ground
    const ringGeo = new THREE.PlaneGeometry(COIN_RING_MAX * 2.0, COIN_RING_MAX * 2.0);
    const ringMat = new THREE.MeshBasicMaterial({
      map: this.coinRingTexture,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(wpos.x, COIN_RING_Y, wpos.z);
    ring.scale.setScalar(0.6);
    ring.renderOrder = 22;

    this.scene.add(root);
    this.scene.add(ring);

    const id = String(snap.id);
    const groupId = String(snap.groupId);

    const meta = {
      spawnX: root.position.x,
      spawnY: root.position.y, // ✅ FIX: usa spawnY reale (jitter incluso)
      spawnZ: root.position.z,

      baseX: wpos.x,
      baseZ: wpos.z,

      fallT,
      rotSpeed,
      rotAxis,

      phase: Math.random() * Math.PI * 2,
      bounce: COIN_DROP_BOUNCE * (0.8 + Math.random() * 0.5),

      ringPulse: 0.85 + Math.random() * 0.35,
      ringSpin: (Math.random() * 2 - 1) * 0.9
    };

    return new CoinActor(id, snap.world, groupId, root, ring, meta);
  }

  _updateCoins(dt) {
    if (this.coinActors.size === 0) return;

    const now = performance.now();

    this.coinActors.forEach((a) => {
      if (!a || a.dead || a.claimed) return;

      const wpos = cellToWorld(a.world.x, a.world.y);
      const meta = a.meta;

      if (a.state === 'FALLING') {
        const t = clamp01((now - a.spawnAt) / (meta.fallT * 1000));
        const e = easeOutCubic(t);

        const x = lerp(meta.spawnX, meta.baseX, e);
        const z = lerp(meta.spawnZ, meta.baseZ, e);

        // ✅ FIX corretto: usa spawnY reale (jitter incluso)
        let y = lerp(meta.spawnY, COIN_GROUND_Y, e);
        y += Math.sin(t * Math.PI) * (1 - t) * meta.bounce;

        a.root.position.set(x, y, z);

        const spinAmt = meta.rotSpeed * dt;
        a.root.rotateOnAxis(meta.rotAxis, spinAmt);
        a.root.rotation.y += dt * (meta.rotSpeed * 0.55);

        if (a.ring && a.ring.material) {
          const op = clamp01(0.55 * smoothstep(t));
          a.ring.material.opacity = op * 0.22;
          a.ring.position.set(wpos.x, COIN_RING_Y, wpos.z);
          a.ring.rotation.z += dt * meta.ringSpin;
          const sc = lerp(0.5, 0.85, smoothstep(t));
          a.ring.scale.setScalar(sc);
        }

        if (t >= 1) {
          a.state = 'SETTLING';
          a.settledAt = now;
        }
      } else if (a.state === 'SETTLING') {
        const t = clamp01((now - a.settledAt) / COIN_DROP_SETTLE_MS);
        const e = easeOutCubic(t);

        a.root.position.x = wpos.x;
        a.root.position.z = wpos.z;
        a.root.position.y = lerp(a.root.position.y, COIN_GROUND_Y, e);

        a.root.rotation.x = lerp(a.root.rotation.x, 0, e);
        a.root.rotation.z = lerp(a.root.rotation.z, 0, e);

        const scenicSpin = 0.85 + 0.35 * Math.sin(now * 0.001 * 1.25 + meta.phase);
        a.root.rotation.y += dt * scenicSpin;

        if (a.ring && a.ring.material) {
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.001 * (1.35 * meta.ringPulse) + meta.phase);
          const op = clamp01(0.12 + 0.22 * pulse);
          a.ring.material.opacity = op;

          a.ring.position.set(wpos.x, COIN_RING_Y, wpos.z);

          const rr = lerp(COIN_RING_MIN, COIN_RING_MAX, 0.45 + 0.55 * pulse);
          a.ring.scale.setScalar(rr / COIN_RING_MAX);
          a.ring.rotation.z += dt * (0.35 + 0.35 * meta.ringSpin);
        }

        if (t >= 1) a.state = 'IDLE';
      } else {
        a.root.position.x = wpos.x;
        a.root.position.z = wpos.z;
        a.root.position.y = COIN_GROUND_Y;

        const scenicSpin = 0.75 + 0.45 * Math.sin(now * 0.001 * 1.25 + meta.phase);
        a.root.rotation.y += dt * scenicSpin;
        a.root.rotation.x = Math.sin(now * 0.001 * 0.9 + meta.phase) * 0.08;
        a.root.rotation.z = Math.cos(now * 0.001 * 0.85 + meta.phase) * 0.08;

        if (a.ring && a.ring.material) {
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.001 * (1.35 * meta.ringPulse) + meta.phase);
          a.ring.material.opacity = clamp01(0.12 + 0.22 * pulse);

          a.ring.position.set(wpos.x, COIN_RING_Y, wpos.z);

          const rr = lerp(COIN_RING_MIN, COIN_RING_MAX, 0.45 + 0.55 * pulse);
          a.ring.scale.setScalar(rr / COIN_RING_MAX);
          a.ring.rotation.z += dt * (0.35 + 0.35 * meta.ringSpin);
        }
      }
    });
  }

  _chooseCoinTargetsForGoblins() {
    this.coinTargetByGoblin.clear();
    if (this.coinActors.size === 0) return;

    const coins = [];
    this.coinActors.forEach((a) => {
      if (!a || a.dead || a.claimed) return;
      coins.push(a);
    });
    if (coins.length === 0) return;

    const gobPairs = Array.from(this.goblins.entries()).filter((p) => p[1] && p[1].visible);
    if (gobPairs.length === 0) return;

    const coinClaimedSet = new Set(Array.from(this.coinClaimPending.keys()));

    for (let i = 0; i < gobPairs.length; i++) {
      const [gid, g] = gobPairs[i];
      const gp = g.cell;

      let best = null;
      let bestScore = Infinity;

      for (let k = 0; k < coins.length; k++) {
        const c = coins[k];
        if (!c || c.dead || c.claimed) continue;
        if (coinClaimedSet.has(c.id)) continue;

        const dx = gp.x - c.world.x;
        const dy = gp.y - c.world.y;
        const d = Math.hypot(dx, dy);

        // bias: se coin sta ancora cadendo, “meno appetibile”
        const bias = c.state === 'FALLING' ? 0.75 : 1.0;
        const score = d * bias;

        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }

      if (best) this.coinTargetByGoblin.set(String(gid), best);
    }
  }

  _maybeStartCoinClaim(goblinId, coinActor) {
    if (!coinActor || coinActor.dead || coinActor.claimed) return;

    const id = String(coinActor.id);
    if (this.coinClaimPending.has(id)) return;

    this.coinClaimPending.set(id, {
      coinId: id,
      at: performance.now() + COIN_CLAIM_DELAY_MS,
      goblinId: String(goblinId)
    });
  }

  _updateCoinClaims() {
    if (this.coinClaimPending.size === 0) return;

    const now = performance.now();
    const toFire = [];

    this.coinClaimPending.forEach((v, coinId) => {
      if (now >= v.at) toFire.push(coinId);
    });

    for (let i = 0; i < toFire.length; i++) {
      const coinId = toFire[i];
      const a = this.coinActors.get(coinId);
      if (!a || a.dead || a.claimed) {
        this.coinClaimPending.delete(coinId);
        continue;
      }

      // delega al tuo backend
      if (typeof window.claimPickup === 'function') {
        window.claimPickup(coinId);
      } else if (typeof window.claimCoinPickup === 'function') {
        window.claimCoinPickup(coinId);
      }

      this.coinClaimPending.delete(coinId);
    }
  }

  /* =========================
     STORM FX (lazy + reversible fog)
  ========================= */
  _ensureStormFx() {
    if (this.storm.group) return;

    // dim layer
    const dimMat = new THREE.MeshBasicMaterial({
      color: 0x00040a,
      transparent: true,
      opacity: 0.0,
      depthTest: false,
      depthWrite: false
    });
    const dimPlane = new THREE.Mesh(new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT), dimMat);
    dimPlane.rotation.x = -Math.PI / 2;
    dimPlane.position.y = 0.013;
    dimPlane.renderOrder = 3990;
    this.storm.dimPlane = dimPlane;
    this.scene.add(dimPlane);

    // clouds
    this.storm.cloudTexA = makeCloudTexture(11);
    this.storm.cloudTexB = makeCloudTexture(77);

    this.storm.clouds = [];
    for (let i = 0; i < STORM_CLOUD_COUNT; i++) {
      const tex = i === 0 ? this.storm.cloudTexA : this.storm.cloudTexB;
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
        color: 0xffffff
      });

      const geo = new THREE.PlaneGeometry(GRID_WIDTH * 0.95, GRID_HEIGHT * 0.55);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = STORM_CLOUD_Y;
      m.renderOrder = 4010 + i;

      const side = i === 0 ? 1 : -1;
      m.position.x = side * (GRID_WIDTH / 2 + GRID_WIDTH * 0.6);
      m.position.z = 0;

      this.storm.clouds.push({
        mesh: m,
        side,
        driftPhase: Math.random() * Math.PI * 2,
        speed: STORM_CLOUD_DRIFT * (0.75 + Math.random() * 0.7),
        wobble: 0.22 + Math.random() * 0.2
      });

      this.scene.add(m);
    }

    // rain points
    const pCount = STORM_RAIN_DROPS;
    const pos = new Float32Array(pCount * 3);
    const meta = new Float32Array(pCount * 4);

    for (let i = 0; i < pCount; i++) {
      const x = randRange(-GRID_WIDTH / 2, GRID_WIDTH / 2);
      const z = randRange(-GRID_HEIGHT / 2, GRID_HEIGHT / 2);
      const y = randRange(STORM_RAIN_Y_MIN, STORM_RAIN_Y_MAX);

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      meta[i * 4 + 0] = randRange(STORM_RAIN_SPEED_MIN, STORM_RAIN_SPEED_MAX);
      meta[i * 4 + 1] = (Math.random() * 2 - 1) * STORM_RAIN_WIND;
      meta[i * 4 + 2] = randRange(STORM_RAIN_SIZE_MIN, STORM_RAIN_SIZE_MAX);
      meta[i * 4 + 3] = Math.random() * Math.PI * 2;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.06,
      transparent: true,
      opacity: 0.0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0x88cfff
    });

    const rain = new THREE.Points(pGeo, pMat);
    rain.renderOrder = 4020;
    this.storm.rain = rain;
    this.storm.rainMeta = meta;
    this.scene.add(rain);

    // splashes pool
    this.storm.splashes = [];
    for (let i = 0; i < STORM_SPLASH_POOL; i++) {
      const geo = new THREE.PlaneGeometry(1.0, 1.0);
      const mat = new THREE.MeshBasicMaterial({
        map: this.coinGlowTexture || makeRadialTexture(256, 6, 128, 0.9, 0.0, [140, 210, 255]),
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        color: 0x77c8ff
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.02;
      m.visible = false;
      m.renderOrder = 4030;
      this.scene.add(m);

      this.storm.splashes.push({
        mesh: m,
        alive: false,
        t: 0,
        life: STORM_SPLASH_LIFE
      });
    }

    // lightning planes
    this.storm.lightningPlanes = [];
    for (let i = 0; i < STORM_LIGHTNING_PLANE_COUNT; i++) {
      const w = GRID_HEIGHT * randRange(0.35, 0.55);
      const h = STORM_LIGHTNING_HEIGHT * randRange(0.7, 1.25);
      const geo = new THREE.PlaneGeometry(w, h);

      const mat = new THREE.MeshBasicMaterial({
        color: 0xe8fdff,
        transparent: true,
        opacity: 0.0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      const m = new THREE.Mesh(geo, mat);
      m.position.y = STORM_CLOUD_Y - 0.8;
      m.renderOrder = 4040 + i;
      m.visible = false;

      this.scene.add(m);
      this.storm.lightningPlanes.push(m);
    }
  }

  _setStormActive(active) {
    this.storm.active = !!active;
    this.storm.targetIntensity = active ? 1.0 : 0.0;

    // ✅ fog reversible: salva e ripristina
    if (active && !this.storm.fogOn) {
      this.storm.prevFog = this.scene.fog;
      this.scene.fog = new THREE.FogExp2(0x00040a, STORM_FOG_DENSITY);
      this.storm.fogOn = true;
    }
    if (!active && this.storm.fogOn) {
      this.scene.fog = this.storm.prevFog || null;
      this.storm.prevFog = null;
      this.storm.fogOn = false;
    }
  }

  _spawnSplash(x, z, strength) {
    const s = this.storm;
    if (!s.splashes || s.splashes.length === 0) return;

    const sp = s.splashes[s.splashCursor++ % s.splashes.length];
    sp.alive = true;
    sp.t = 0;
    sp.life = STORM_SPLASH_LIFE * (0.75 + Math.random() * 0.65);
    sp.mesh.visible = true;

    sp.mesh.position.x = x;
    sp.mesh.position.z = z;
    sp.mesh.position.y = 0.02;

    sp.mesh.scale.setScalar(0.2 + 0.2 * Math.random());
    sp.mesh.material.opacity = 0.22 * clamp01(strength);
  }

  _updateStormFx(dt) {
    // storm SOLO se coins presenti o gruppi pending
    const anyGroups = this.coinGroups.size > 0;
    const anyActors = this.coinActors.size > 0;
    const anyPending = this.pickupsSnapshot.size > 0;

    const active = anyActors || anyGroups || anyPending;
    if (!active && !this.storm.active && this.storm.intensity <= 0.001) return;

    this._ensureStormFx();
    this._setStormActive(active);

    const now = performance.now();
    const s = this.storm;

    s.intensity = lerp(s.intensity, s.targetIntensity, 1 - Math.pow(0.001, dt));
    const intensity = clamp01(s.intensity);

    if (s.dimPlane && s.dimPlane.material) {
      s.dimPlane.material.opacity = STORM_DIM_OPACITY * intensity;
    }

    // timing earliest group
    let earliestGroup = null;
    this.coinGroups.forEach((g) => {
      if (!earliestGroup || g.startAt < earliestGroup.startAt) earliestGroup = g;
    });

    let introT = 0;
    let cloudsT = 0;

    if (earliestGroup) {
      introT = clamp01((now - earliestGroup.startAt) / COIN_GROUP_INTRO_MS);
      cloudsT = clamp01((now - earliestGroup.cloudsAt) / STORM_CLOUD_ENTER_MS);
    }

    const lightningBase = intensity * (0.65 + 0.35 * (1 - introT));
    const rainBase = intensity * (0.55 + 0.45 * smoothstep(cloudsT));
    const cloudBase = intensity * (0.4 + 0.6 * smoothstep(cloudsT));

    // clouds move
    for (let i = 0; i < s.clouds.length; i++) {
      const c = s.clouds[i];
      const m = c.mesh;
      if (!m) continue;

      const enter = easeInOutSine(cloudsT);
      const targetX = c.side * (GRID_WIDTH * 0.25);
      const startX = c.side * (GRID_WIDTH / 2 + GRID_WIDTH * 0.6);
      const x = lerp(startX, targetX, enter);

      const drift = Math.sin(now * 0.001 * c.speed + c.driftPhase) * (GRID_WIDTH * 0.06) * c.wobble;
      const z = Math.cos(now * 0.001 * (c.speed * 0.85) + c.driftPhase) * (GRID_HEIGHT * 0.08) * c.wobble;

      m.position.x = x + drift;
      m.position.z = z;

      const sc = 1.0 + 0.05 * Math.sin(now * 0.001 * 0.35 + c.driftPhase);
      m.scale.set(sc, sc, 1);

      const op = clamp01(cloudBase * (0.85 + 0.15 * Math.sin(now * 0.001 * 0.6 + c.driftPhase)));
      m.material.opacity = op;
    }

    // rain update
    if (s.rain && s.rain.geometry && s.rain.material) {
      const arr = s.rain.geometry.attributes.position.array;
      const meta = s.rainMeta;

      s.rain.material.opacity = clamp01(0.82 * rainBase);
      s.rain.material.size = lerp(0.055, 0.085, clamp01(rainBase));

      const wind = STORM_RAIN_WIND * (0.4 + 0.6 * introT) * intensity;

      const wrapXMin = -GRID_WIDTH / 2 - 1;
      const wrapXMax = GRID_WIDTH / 2 + 1;
      const wrapZMin = -GRID_HEIGHT / 2 - 1;
      const wrapZMax = GRID_HEIGHT / 2 + 1;

      for (let i = 0; i < meta.length / 4; i++) {
        const ix = i * 3;
        const im = i * 4;

        let x = arr[ix + 0];
        let y = arr[ix + 1];
        let z = arr[ix + 2];

        const spd = meta[im + 0];
        const drift = meta[im + 1];
        const phase = meta[im + 3];

        y -= spd * dt * (0.35 + 0.65 * rainBase);
        x += drift * wind * dt * 0.35;
        z += Math.sin(now * 0.001 * 0.8 + phase) * dt * 0.08;

        if (y <= 0.02) {
          y = randRange(STORM_RAIN_Y_MAX * 0.65, STORM_RAIN_Y_MAX);
          x = randRange(-GRID_WIDTH / 2, GRID_WIDTH / 2);
          z = randRange(-GRID_HEIGHT / 2, GRID_HEIGHT / 2);

          s.splashAccum += dt * rainBase;
          if (s.splashAccum >= 1.0 / Math.max(1, STORM_SPLASH_RATE)) {
            s.splashAccum = 0;
            this._spawnSplash(x, z, rainBase);
          }
        }

        if (x < wrapXMin) x = wrapXMax;
        else if (x > wrapXMax) x = wrapXMin;

        if (z < wrapZMin) z = wrapZMax;
        else if (z > wrapZMax) z = wrapZMin;

        arr[ix + 0] = x;
        arr[ix + 1] = y;
        arr[ix + 2] = z;
      }

      s.rain.geometry.attributes.position.needsUpdate = true;
    }

    // splashes fade
    for (let i = 0; i < s.splashes.length; i++) {
      const sp = s.splashes[i];
      if (!sp.alive) continue;
      sp.t += dt;

      const t = sp.t / sp.life;
      if (t >= 1) {
        sp.alive = false;
        sp.mesh.visible = false;
        sp.mesh.material.opacity = 0.0;
        continue;
      }

      const e = easeOutCubic(t);
      sp.mesh.scale.setScalar(lerp(0.15, 0.9, e));
      sp.mesh.material.opacity = (1 - e) * 0.22 * intensity;
    }

    // lightning
    if (s.active) {
      const flashMin = lerp(STORM_LIGHTNING_FLASH_MIN_MS, STORM_LIGHTNING_FLASH_MIN_MS * 0.6, 1 - introT);
      const flashMax = lerp(STORM_LIGHTNING_FLASH_MAX_MS, STORM_LIGHTNING_FLASH_MAX_MS * 0.7, 1 - introT);

      if (now >= s.lightningNextAt) {
        s.lightningSide = Math.random() < 0.5 ? 1 : -1;
        s.lightningFlashT = 0;
        s.lightningFlashDur = randRange(90, 210);
        s.lightningFlashPow = randRange(0.65, 1.1) * lightningBase;

        s.lightningNextAt = now + randRange(flashMin, flashMax);

        for (let i = 0; i < s.lightningPlanes.length; i++) {
          const m = s.lightningPlanes[i];
          m.visible = true;

          const side = i % 2 === 0 ? s.lightningSide : -s.lightningSide;
          m.position.x = side * (GRID_WIDTH * 0.43 + randRange(0.0, 1.2));
          m.position.z = randRange(-GRID_HEIGHT * 0.2, GRID_HEIGHT * 0.2);
          m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          m.rotation.z = randRange(-0.25, 0.25);
          m.scale.setScalar(randRange(0.9, 1.35));
        }
      }

      if (s.lightningFlashT < s.lightningFlashDur) {
        s.lightningFlashT += dt * 1000;

        const tt = clamp01(s.lightningFlashT / s.lightningFlashDur);
        const pulse = Math.sin(tt * Math.PI) * (0.85 + 0.15 * Math.sin(now * 0.045));
        const op = clamp01(pulse * s.lightningFlashPow);

        for (let i = 0; i < s.lightningPlanes.length; i++) {
          const m = s.lightningPlanes[i];
          if (!m || !m.material) continue;
          m.material.opacity = op * (0.55 + 0.45 * Math.sin(now * 0.001 * 18 + i));
        }

        if (s.dimPlane && s.dimPlane.material) {
          s.dimPlane.material.opacity = STORM_DIM_OPACITY * intensity + op * 0.08;
        }
      } else {
        for (let i = 0; i < s.lightningPlanes.length; i++) {
          const m = s.lightningPlanes[i];
          if (!m || !m.material) continue;
          m.material.opacity = 0.0;
          m.visible = false;
        }
      }
    } else {
      for (let i = 0; i < s.lightningPlanes.length; i++) {
        const m = s.lightningPlanes[i];
        if (!m || !m.material) continue;
        m.material.opacity = 0.0;
        m.visible = false;
      }
    }
  }

  /* =========================
     LOOP (OLD + ADD-ON coins/storm)
     - parte chest/goblins identica
     - coins solo quando esistono
  ========================= */
  _loop() {
    requestAnimationFrame(() => this._loop());

    let dt = this.clock.getDelta();

    // ✅ se non siamo pronti, anima e renderizza SOLO il loading FX
    if (!this.assetsReady) {
      if (dt > 0.12) dt = 0;
      dt = Math.min(dt, 1 / 30);

      this._updateLoadingFx(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // ✅ se il tab è stato in background o c'è un hitch, evita il "teletrasporto"
    if (dt > 0.12) dt = 0;
    dt = Math.min(dt, 1 / 30);

    const now = performance.now();
    const liveDrop = this.drop || this.state.drop?.current || null;

    // ✅ la chest deve restare visibile anche se lo state passa a non-visible,
    // finché abbiamo una pendingClaim attiva (i 5 secondi)
    const chestVisibleFromState = liveDrop && this.state.drop?.fx?.phase === 'visible';
    const chestVisibleFromPending = !!this.pendingClaimKey;

    const chest = chestVisibleFromState || chestVisibleFromPending ? liveDrop : null;

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

    // ---- COINS housekeeping (ogni 250ms, se presenti) ----
    if ((this.pickupsSnapshot.size > 0 || this.coinActors.size > 0 || this.coinGroups.size > 0) && this._coinAssetsReady) {
      if (now - this._lastCoinSyncAt > 250) {
        this._lastCoinSyncAt = now;
        this._syncCoinActorsFromSnapshot();
      }
    }

    // ---- STORM + COINS UPDATE (solo se serve) ----
    this._updateStormFx(dt);
    this._updateCoins(dt);

    // ---- Scegli target coins SOLO se non c'è chest ----
    if (!chest) {
      this._chooseCoinTargetsForGoblins();
    } else {
      this.coinTargetByGoblin.clear();
    }

    // ---- UPDATE GOBLINS + DETECT FIRST CONTACT (WINNER) ----
    const pairs = Array.from(this.goblins.entries()); // [id, goblin]
    const neighbors = pairs.map((p) => p[1]); // per avoidance

    for (let i = 0; i < pairs.length; i++) {
      const [id, g] = pairs[i];

      // ✅ COIN TARGET (FEDELE: non cambia Goblin controller)
      // - salva target/nextWanderAt originali
      // - imposta temporaneamente target verso coin
      // - ripristina quando non c'è più coin per quel goblin
      if (!chest) {
        const coin = this.coinTargetByGoblin.get(String(id)) || null;

        if (coin && !coin.dead && !coin.claimed) {
          if (!g.__coinLocked) {
            g.__coinLocked = true;
            g.__savedTarget = { x: g.target.x, y: g.target.y };
            g.__savedNextWanderAt = g.nextWanderAt;
          }

          g.target = { x: coin.world.x, y: coin.world.y };
          g.nextWanderAt = now + 1e9; // “freeze wander” finché segue coin
        } else {
          if (g.__coinLocked) {
            g.__coinLocked = false;
            if (g.__savedTarget) g.target = { ...g.__savedTarget };
            if (typeof g.__savedNextWanderAt === 'number') g.nextWanderAt = g.__savedNextWanderAt;
            g.__savedTarget = null;
            g.__savedNextWanderAt = null;
          }
        }
      }

      // update goblin (OLD)
      g.update(dt, chest, neighbors);

      // posizionamento (OLD)
      const p = g.worldPosition();
      g.root.position.set(p.x, GOBLIN_Y_OFFSET, p.z);

      // ✅ primo goblin che entra nel range -> avvia countdown (5s) (OLD)
      if (chest && !this.pendingClaimKey) {
        const dist = chebyshev(g.cell, chest.world);
        if (dist <= CHEST_TRIGGER_RANGE) {
          this._tryStartDelayedClaim(id, chest);
        }
      }

      // ✅ claim coin (solo se non c'è chest)
      if (!chest) {
        const coin = this.coinTargetByGoblin.get(String(id)) || null;
        if (coin && !coin.dead && !coin.claimed) {
          const dist = Math.hypot(g.cell.x - coin.world.x, g.cell.y - coin.world.y);
          if (dist <= COIN_PICKUP_TRIGGER_RANGE) {
            this._maybeStartCoinClaim(id, coin);
          }
        }
      }
    }

    // ---- DOPO 5s: CLAIM CHEST UNA SOLA VOLTA (OLD) ----
    if (this.pendingClaimKey && now >= this.pendingClaimAt) {
      this.claimChestKey = this.pendingClaimKey;

      this.pendingClaimKey = null;
      this.pendingWinnerId = null;
      this.pendingClaimAt = 0;
      if (typeof window.claimActiveDrop === 'function') {
        window.claimActiveDrop();
      } else {
        if (this.state?.drop?.fx) {
          this.state.drop.fx.phase = 'idle';
        }
      }
    }

    // ---- CLAIM COINS PENDING ----
    this._updateCoinClaims();

    this.renderer.render(this.scene, this.camera);
  }

  /* =========================
     OLD API
  ========================= */
  setDrop(drop) {
    this.drop = drop || null;
    if (!drop) {
      this.claimChestKey = null;
    }
  }
}
