// three-runtime.js
// Resolved via <script type="importmap"> in nuovo.html
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';

/* =========================
   CONFIGURAZIONE (PROD)
========================= */
const GRID_WIDTH = 48;
const GRID_HEIGHT = 24;
const CELL_SIZE = 1;

// --- Goblin ---
const GOBLIN_SPEED = 3.5;          // celle / secondo
const FIX_GOBLIN_FLIP_X = Math.PI; // 180°: testa su, piedi giù
const GOBLIN_Y_OFFSET = 0.05;      // piccolo offset sopra il plot
const GOBLIN_FACING_OFFSET_Y = 0;

// --- Wander / “esplorazione” (meno scatti) ---
const WANDER_REACH_EPS = 0.18;
const WANDER_MIN_MS = 3200;
const WANDER_MAX_MS = 7200;
const WANDER_MARGIN = 1.2;

// --- Chest ---
const CHEST_TRIGGER_RANGE = 3;      // 3x3
const SURPRISE_DURATION_MS = 1700;
const DIG_DURATION_MS = 4500;
const CHEST_CLAIM_DELAY_MS = 5000;
const CHEST_Y_OFFSET = 0.14;

// --- Badge (seguono il goblin, “spostato verso il lettore”) ---
// In top-down ortografica: lo “spostamento verso il lettore” è un offset su Z (schermo Y).
// Non è “profondità dietro”, è solo una traslazione 2D vista camera.
const BADGE_HEAD_Y = 1.55;          // altezza sopra il goblin
const BADGE_SCREEN_NUDGE_Z = -0.55; // più negativo = più “in basso” sullo schermo
const BADGE_SCALE_X = 2.7;
const BADGE_SCALE_Y = 0.70;

// --- Navmask ---
const NAVMASK_URL = '/madverse/assets/navmask.png';
const NAVMASK_THRESHOLD = 127;
const NAVMASK_DEBUG = false;

// --- Avoidance / spacing ---
const GOBLIN_RADIUS = 0.55;
const AVOID_RANGE = 1.4;
const AVOID_PUSH = 2.2;
const AVOID_MAX_NEIGHBORS = 8;

const SPREAD_RANGE = 4.2;
const SPREAD_STRENGTH = 0.26;
const SPREAD_SPEED_DAMP = 0.15;

// --- Gait (indipendente per goblin) ---
const GAIT_CHANGE_MIN_MS = 5000;
const GAIT_CHANGE_MAX_MS = 10000;
const SPEED_MIN_MULT = 0.75;
const SPEED_MAX_MULT = 1.25;
const ANIM_MIN_MULT = 0.80;
const ANIM_MAX_MULT = 1.35;

// --- Victory ---
const VICTORY_VISIBLE_MS = 5000;

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

function toCellIndex(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return {
    ix: THREE.MathUtils.clamp(ix, 0, GRID_WIDTH - 1),
    iy: THREE.MathUtils.clamp(iy, 0, GRID_HEIGHT - 1)
  };
}

function clampCellToGrid(cell) {
  cell.x = THREE.MathUtils.clamp(cell.x, 0, GRID_WIDTH - 1e-6);
  cell.y = THREE.MathUtils.clamp(cell.y, 0, GRID_HEIGHT - 1e-6);
  return cell;
}

// hash stabile per colori (no “random” che cambia ogni reload dei materiali condivisi)
function hashStringTo01(str, seed = 1337) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 0..1
  return ((h >>> 0) % 100000) / 100000;
}

/* =========================
   BADGE SPRITE (CANVAS)
========================= */
function makeBadgeSprite(text, borderCss) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 512;
  canvas.height = 128;

  // fondo
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // bordo
  ctx.strokeStyle = borderCss || 'rgba(56,189,248,0.95)';
  ctx.lineWidth = 7;
  ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);

  // testo
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.font = 'bold 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text || '').slice(0, 20), canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false
  });

  const spr = new THREE.Sprite(mat);

  // anchor TOP (così la posizione è “sotto” al badge, visivamente più pulito)
  spr.center.set(0.5, 1.0);
  spr.scale.set(BADGE_SCALE_X, BADGE_SCALE_Y, 1);
  spr.renderOrder = 60;
  return spr;
}

/* =========================
   CHEST (3D procedurale + FX)
   - niente nuovi asset obbligatori
   - animazioni: appear, idle bob, open burst
========================= */
class ChestFX {
  constructor() {
    this.root = new THREE.Group();
    this.root.visible = false;

    // base “wood”
    const woodMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x6b3f1d), // marrone legno
      roughness: 0.95,
      metalness: 0.0
    });

    // metallo “oro”
    const metalMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd1a300), // oro
      roughness: 0.25,
      metalness: 0.85
    });

    // glow interno
    const glowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffd66b),
      roughness: 0.8,
      metalness: 0.0,
      emissive: new THREE.Color(0xffc84a),
      emissiveIntensity: 1.25
    });

    // geometrie
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 1.4), woodMat);
    base.position.y = 0.45;

    const band1 = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, 1.42), metalMat);
    band1.position.y = 0.35;

    const band2 = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, 1.42), metalMat);
    band2.position.y = 0.70;

    // lid (coperchio) con hinge
    this.lidPivot = new THREE.Group();
    this.lidPivot.position.set(0, 0.90, 0.70); // hinge
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.35, 1.42), woodMat);
    lid.position.set(0, 0.175, -0.70); // sposta indietro rispetto al pivot
    this.lidPivot.add(lid);

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.12), metalMat);
    lock.position.set(0, 0.55, 0.71);

    // glow plane che “esce” dalla fessura
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.92;
    this.glow.position.z = 0.0;
    this.glow.scale.set(1, 1, 1);

    this.root.add(base, band1, band2, this.lidPivot, lock, this.glow);

    // “aura” (billboard)
    const auraTex = new THREE.CanvasTexture(ChestFX._makeRadialCanvas());
    auraTex.colorSpace = THREE.SRGBColorSpace;
    const auraMat = new THREE.SpriteMaterial({
      map: auraTex,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    this.aura = new THREE.Sprite(auraMat);
    this.aura.scale.set(5.6, 3.6, 1);
    this.aura.position.y = 0.55;
    this.aura.renderOrder = 8;
    this.root.add(this.aura);

    // state
    this.phase = 'hidden'; // hidden | appear | idle | opening | opened
    this.t0 = 0;
    this.openT = 0;
  }

  static _makeRadialCanvas() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.00, 'rgba(255,215,120,0.55)');
    g.addColorStop(0.25, 'rgba(255,200,60,0.35)');
    g.addColorStop(0.60, 'rgba(255,180,40,0.12)');
    g.addColorStop(1.00, 'rgba(255,180,40,0.00)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return c;
  }

  showAt(worldPos) {
    this.root.position.set(worldPos.x, CHEST_Y_OFFSET, worldPos.z);
    this.root.visible = true;
    this.phase = 'appear';
    this.t0 = performance.now();

    // reset transforms
    this.root.scale.setScalar(0.01);
    this.lidPivot.rotation.x = 0;
    this.openT = 0;

    // glow base
    this.glow.material.emissiveIntensity = 1.25;
    this.glow.scale.set(1, 1, 1);
  }

  hide() {
    this.root.visible = false;
    this.phase = 'hidden';
  }

  open() {
    if (this.phase === 'opening' || this.phase === 'opened' || this.phase === 'hidden') return;
    this.phase = 'opening';
    this.t0 = performance.now();
    this.openT = 0;
  }

  update(dt) {
    if (!this.root.visible) return;

    const now = performance.now();

    if (this.phase === 'appear') {
      const t = Math.min(1, (now - this.t0) / 450);
      // bounce scale
      const s = 0.01 + (1.0 - 0.01) * (1 - Math.pow(1 - t, 3));
      const bounce = 1 + Math.sin(t * Math.PI) * 0.10;
      this.root.scale.setScalar(s * bounce);

      if (t >= 1) {
        this.phase = 'idle';
        this.t0 = now;
      }
    }

    if (this.phase === 'idle') {
      // bob + micro-rotate
      const tt = (now - this.t0) * 0.001;
      this.root.position.y = CHEST_Y_OFFSET + Math.sin(tt * 2.2) * 0.06;
      this.root.rotation.y = Math.sin(tt * 1.2) * 0.08;

      // aura pulsante
      const a = 0.65 + 0.25 * (0.5 + 0.5 * Math.sin(tt * 3.0));
      this.aura.material.opacity = a;

      const ei = 1.15 + 0.55 * (0.5 + 0.5 * Math.sin(tt * 4.0));
      this.glow.material.emissiveIntensity = ei;
      this.glow.scale.setScalar(0.95 + 0.15 * Math.sin(tt * 3.2));
    }

    if (this.phase === 'opening') {
      this.openT += dt;
      const t = Math.min(1, this.openT / 0.65);

      // lid rotate open (easeOut)
      const ease = 1 - Math.pow(1 - t, 3);
      this.lidPivot.rotation.x = -ease * 1.15; // ~66°

      // burst glow
      this.glow.material.emissiveIntensity = 1.6 + ease * 2.4;
      this.aura.material.opacity = 0.95;

      // pulse scale
      const pulse = 1 + Math.sin(ease * Math.PI) * 0.14;
      this.root.scale.setScalar(pulse);

      if (t >= 1) {
        this.phase = 'opened';
        this.t0 = now;
      }
    }

    if (this.phase === 'opened') {
      // resta “aperta” e brillante per un attimo
      const tt = (now - this.t0) * 0.001;
      this.glow.material.emissiveIntensity = 2.4 + 0.6 * Math.sin(tt * 5.0);
      this.aura.material.opacity = 0.8 + 0.15 * Math.sin(tt * 2.8);
    }
  }
}

/* =========================
   GOBLIN CONTROLLER
========================= */
class Goblin {
  constructor(template, clips, startCell, owner, onDigComplete, isWalkable, materialSeed = 1) {
    this.root = new THREE.Group();

    // clone “vero” + material clone per goblin (così colori non si sporcano a vicenda)
    this.model = SkeletonUtils.clone(template);
    this.root.add(this.model);

    this.model.scale.setScalar(1.5);

    this.owner = owner || 'player';
    this.onDigComplete = onDigComplete;
    this.isWalkable = typeof isWalkable === 'function' ? isWalkable : (() => true);

    if (FIX_GOBLIN_FLIP_X) this.model.rotation.x = FIX_GOBLIN_FLIP_X;

    // ✅ badge: sopra testa, nudged verso il lettore (screen)
    const hue = Math.floor(hashStringTo01(this.owner, 991) * 360);
    const borderColor = `hsla(${hue}, 95%, 60%, 0.95)`;
    this.badge = makeBadgeSprite(this.owner, borderColor);
    this.badge.position.set(0, BADGE_HEAD_Y, BADGE_SCREEN_NUDGE_Z);
    this.root.add(this.badge);

    // anim
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

    this.lastChestKey = null;
    this.visible = true;

    this.digUntil = 0;
    this.digChestKey = null;
    this.digFired = false;

    // facing
    this.facing = new THREE.Vector2(0, 1);
    this.turnSpeed = 10;

    // DNA personale
    this.baseSpeed = GOBLIN_SPEED * (0.9 + Math.random() * 0.25);
    this.speedMult = 1.0;
    this.animMult = 1.0;

    this.gaitMinMs = GAIT_CHANGE_MIN_MS + Math.random() * 2500;
    this.gaitMaxMs = GAIT_CHANGE_MAX_MS + Math.random() * 3500;

    this.speedMin = SPEED_MIN_MULT + Math.random() * 0.10;
    this.speedMax = SPEED_MAX_MULT - Math.random() * 0.10;

    this.animMin = ANIM_MIN_MULT + Math.random() * 0.10;
    this.animMax = ANIM_MAX_MULT - Math.random() * 0.10;

    this.strideBias = 0.85 + Math.random() * 0.35;
    this.nextGaitChangeAt = performance.now() + (this.gaitMinMs + Math.random() * (this.gaitMaxMs - this.gaitMinMs));

    // ✅ colori/materiali: green goblin “forte” + dettagli leggibili
    this._applyGoblinLook(materialSeed);

    this._pickRandomTarget();
    this._play('RUNNING');
  }

   _applyGoblinLook(seed) {
     // Palette: pelle verde, vestiti distinguibili
     const SKIN  = new THREE.Color(0x1fb84a); // verde goblin (pelle)
     const TUNIC = new THREE.Color(0xb84a2b); // rosso/mattone tunica
     const PANTS = new THREE.Color(0x7a5a2a); // marrone pantaloni
     const BOOTS = new THREE.Color(0x222222); // stivali scuri
   
     // helper: decide "eyes"
     const isEyesName = (s) => String(s || '').toLowerCase().includes('eye');
   
     this.model.traverse((o) => {
       if (!o.isMesh) return;
   
       // ✅ IMPORTANTISSIMO: clona materiali per goblin (evita “sporcamenti” tra istanze)
       const src = Array.isArray(o.material) ? o.material : [o.material];
       const cloned = src.map(m => (m ? m.clone() : m));
       o.material = Array.isArray(o.material) ? cloned : cloned[0];
   
       const mats = Array.isArray(o.material) ? o.material : [o.material];
   
       for (const m of mats) {
         if (!m) continue;
   
         // SRGB maps (albedo/baseColor)
         if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
         if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
   
         // fisica coerente (evita look metallico “scuro”)
         if ('metalness' in m) m.metalness = 0.0;
         if ('roughness' in m) m.roughness = Math.min(m.roughness ?? 1.0, 0.92);
   
         // NON forzare emissive “grigia” che rovina i colori
         if ('emissiveIntensity' in m) m.emissiveIntensity = 0.0;
   
         const nameKey = `${m.name || ''} ${o.name || ''}`;
         const eyes = isEyesName(nameKey);
   
         if (eyes) {
           // occhi più leggibili
           if (m.color) m.color.setRGB(1, 1, 1);
           if ('emissive' in m) {
             m.emissive = m.emissive || new THREE.Color(0x000000);
             m.emissive.setRGB(0.25, 0.25, 0.25);
             m.emissiveIntensity = 0.7;
           }
           if ('roughness' in m) m.roughness = 0.55;
           m.needsUpdate = true;
           continue;
         }
   
         // ✅ QUI la differenza: niente lerp globale al verde.
         // Applichiamo una palette “a bande” via shader, usando position.y locale del mesh.
         // Mantiene i dettagli della texture e separa vestiti/pelle.
   
         m.onBeforeCompile = (shader) => {
           // varying per la local position
           shader.vertexShader = shader.vertexShader.replace(
             'void main() {',
             'varying vec3 vLocalPos;\nvoid main() {'
           );
   
           shader.vertexShader = shader.vertexShader.replace(
             '#include <begin_vertex>',
             '#include <begin_vertex>\nvLocalPos = position;'
           );
   
           shader.fragmentShader = shader.fragmentShader.replace(
             'void main() {',
             'varying vec3 vLocalPos;\nvoid main() {'
           );
   
           // Inseriamo la logica DOPO che il colore base è pronto
           // (così manteniamo texture + luci e aggiungiamo solo una “palette” controllata)
           shader.fragmentShader = shader.fragmentShader.replace(
             '#include <color_fragment>',
             `
   #include <color_fragment>
   
   // ---- Goblin palette bands (boots/pants/tunic/skin) ----
   // Nota: soglie y dipendono dal tuo modello.
   // Se le bande non cascano perfette, ti dico sotto come ritoccarle.
   
   float y = vLocalPos.y;
   
   // colori
   vec3 boots = vec3(${BOOTS.r.toFixed(4)}, ${BOOTS.g.toFixed(4)}, ${BOOTS.b.toFixed(4)});
   vec3 pants = vec3(${PANTS.r.toFixed(4)}, ${PANTS.g.toFixed(4)}, ${PANTS.b.toFixed(4)});
   vec3 tunic = vec3(${TUNIC.r.toFixed(4)}, ${TUNIC.g.toFixed(4)}, ${TUNIC.b.toFixed(4)});
   vec3 skin  = vec3(${SKIN.r.toFixed(4)},  ${SKIN.g.toFixed(4)},  ${SKIN.b.toFixed(4)});
   
   // soglie (basso -> alto)
   vec3 targetCol = tunic;
   if (y < -0.28)      targetCol = boots;
   else if (y < 0.08)  targetCol = pants;
   else if (y < 0.52)  targetCol = tunic;
   else                targetCol = skin;
   
   // mix controllato: non distrugge texture/ombre
   diffuseColor.rgb = mix(diffuseColor.rgb, targetCol, 0.78);
   `
           );
         };
   
         m.needsUpdate = true;
       }
     });
   }

  _play(name) {
    if (this.currentAction === name) return;
    if (this.currentAction) this.actions[this.currentAction].fadeOut(0.25);
    this.actions[name].reset().fadeIn(0.25).play();
    this.currentAction = name;
  }

  _pickRandomTarget() {
    const now = performance.now();
    this.nextWanderAt = now + (WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS));

    // tentativi: scegli celle walkable e preferisci target più “lontani” per esplorazione
    let best = null;
    let bestScore = -1;

    for (let k = 0; k < 55; k++) {
      const x = Math.random() * GRID_WIDTH;
      const y = Math.random() * GRID_HEIGHT;

      // margine
      if (x < WANDER_MARGIN || x > GRID_WIDTH - WANDER_MARGIN) continue;
      if (y < WANDER_MARGIN || y > GRID_HEIGHT - WANDER_MARGIN) continue;

      const { ix, iy } = toCellIndex(x, y);
      if (!this.isWalkable(ix, iy)) continue;

      const dx = x - this.cell.x;
      const dy = y - this.cell.y;
      const d = Math.hypot(dx, dy);

      // score: favorisci d più grande, ma evita teletrasporti (resta coerente)
      const score = d + (Math.random() * 0.25);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }

    this.target = best || { x: this.cell.x, y: this.cell.y };
  }

  _updateGait(now) {
    if (now < this.nextGaitChangeAt) return;

    this.nextGaitChangeAt =
      now + (this.gaitMinMs + Math.random() * (this.gaitMaxMs - this.gaitMinMs));

    this.speedMult = this.speedMin + Math.random() * (this.speedMax - this.speedMin);
    this.animMult = this.animMin + Math.random() * (this.animMax - this.animMin);

    if (this.actions.RUNNING) this.actions.RUNNING.setEffectiveTimeScale(this.animMult * this.speedMult * this.strideBias);
    if (this.actions.DIGGING) this.actions.DIGGING.setEffectiveTimeScale(0.95 + (this.animMult - 1) * 0.4);
  }

  update(dt, chest, neighbors) {
    if (!this.visible) return;

    const now = performance.now();
    this._updateGait(now);

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

          this.digChestKey = chestKey;
          this.digUntil = now + DIG_DURATION_MS;
          this.digFired = false;
        }

        if (!this.digFired && this.digChestKey === chestKey && now >= this.digUntil) {
          this.digFired = true;
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

      // wander
      const dx0 = this.target.x - this.cell.x;
      const dy0 = this.target.y - this.cell.y;
      const dist0 = Math.hypot(dx0, dy0);

      if (dist0 <= WANDER_REACH_EPS || now >= this.nextWanderAt) {
        this._pickRandomTarget();
      }
    }

    /* ====== MOVEMENT + AVOIDANCE + SPREAD ====== */
    if (this.state === 'RUNNING' || this.state === 'MOVING_TO_CHEST') {
      const dx = this.target.x - this.cell.x;
      const dy = this.target.y - this.cell.y;
      const len = Math.hypot(dx, dy);

      if (len > 0.01) {
        const dirx = dx / len;
        const diry = dy / len;

        let speed = this.baseSpeed * this.speedMult;

        let ax = 0, ay = 0;
        let sx = 0, sy = 0;
        let crowd = 0;
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

            if (d <= AVOID_RANGE) {
              const t = 1 - (d / AVOID_RANGE);
              ax += (rx / d) * t;
              ay += (ry / d) * t;

              if (d < GOBLIN_RADIUS * 2.0) {
                ax += (rx / d) * AVOID_PUSH;
                ay += (ry / d) * AVOID_PUSH;
              }

              const forward = dirx * (-rx) + diry * (-ry);
              if (forward > 0 && d < GOBLIN_RADIUS * 2.0) {
                speed *= 0.55;
              }
            }

            if (d <= SPREAD_RANGE) {
              const t2 = 1 - (d / SPREAD_RANGE);
              sx += (rx / d) * t2;
              sy += (ry / d) * t2;
              crowd += t2;
            }

            checked++;
            if (checked >= AVOID_MAX_NEIGHBORS) break;
          }
        }

        const alen = Math.hypot(ax, ay);
        if (alen > 0.0001) { ax /= alen; ay /= alen; } else { ax = 0; ay = 0; }

        const slen = Math.hypot(sx, sy);
        if (slen > 0.0001) { sx /= slen; sy /= slen; } else { sx = 0; sy = 0; }

        if (crowd > 0.01) {
          speed *= (1.0 - Math.min(SPREAD_SPEED_DAMP, crowd * 0.12));
        }

        let mx = dirx;
        let my = diry;

        const avoidMix = (alen > 0.0001) ? 0.28 : 0.0;
        mx = mx * (1 - avoidMix) + ax * avoidMix;
        my = my * (1 - avoidMix) + ay * avoidMix;

        const spreadMix = (slen > 0.0001) ? SPREAD_STRENGTH : 0.0;
        mx = mx * (1 - spreadMix) + sx * spreadMix;
        my = my * (1 - spreadMix) + sy * spreadMix;

        const mlen = Math.hypot(mx, my) || 1;
        this.facing.set(mx / mlen, my / mlen);

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

    /* ====== ROTATION ====== */
    if (this.facing.lengthSq() > 0.0001) {
      const desiredYaw = Math.atan2(this.facing.x, this.facing.y) + GOBLIN_FACING_OFFSET_Y;
      const currentYaw = this.root.rotation.y;

      let delta = desiredYaw - currentYaw;
      delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;

      this.root.rotation.y = currentYaw + delta * Math.min(1, this.turnSpeed * dt);
    }

    /* ====== CLAMP ====== */
    clampCellToGrid(this.cell);

    const c = toCellIndex(this.cell.x, this.cell.y);
    if (!this.isWalkable(c.ix, c.iy)) {
      this._pickRandomTarget();
    }

    /* ====== ANIM ====== */
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

    // ✅ color management “giusto” (evita goblin grigi/spenti)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
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

    // ✅ luci più leggibili + colori vivi
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));

    const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa6b2, 1.10);
    hemi.position.set(0, 50, 0);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 2.55);
    dir.position.set(22, 42, 10);
    this.scene.add(dir);

    // piccolo “fill” laterale per staccare volumi
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.85);
    dir2.position.set(-18, 30, -14);
    this.scene.add(dir2);

    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();

    this.goblins = new Map();
    this.missingTicks = new Map();
    this.MISSING_TICKS_BEFORE_REMOVE = 6;

    this.drop = null;

    // chest FX (3D procedurale)
    this.chestFx = new ChestFX();
    this.chestFx.root.renderOrder = 12;
    this.scene.add(this.chestFx.root);

    // claim state
    this.claimChestKey = null;
    this.pendingClaimKey = null;
    this.pendingClaimAt = 0;
    this.pendingWinnerId = null;

    // navmask
    this.walkable = null;
    this.walkableReady = false;

    // goblin assets
    this.template = null;
    this.clips = null;

    // per seed materiali goblin (stabile per id)
    this._seedBase = Math.floor(Math.random() * 1e9);
  }

  async init() {
    this._initRenderer();
    this._loadPlot();

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

  _loadPlot() {
    const tex = new THREE.TextureLoader().load('/madverse/assets/plot.png');
    tex.colorSpace = THREE.SRGBColorSpace;

    // plot più “vivo”
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      depthWrite: false,
      color: new THREE.Color(0xffffff) // bianco = texture pura
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT), mat);
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

      ctx.drawImage(img, 0, 0, GRID_WIDTH, GRID_HEIGHT);
      const data = ctx.getImageData(0, 0, GRID_WIDTH, GRID_HEIGHT).data;

      this.walkable = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);

      for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
          const idx = (y * GRID_WIDTH + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const lum = (r + g + b) / 3;
          this.walkable[y * GRID_WIDTH + x] = lum >= NAVMASK_THRESHOLD ? 1 : 0;
        }
      }

      let any = 0;
      for (let i = 0; i < this.walkable.length; i++) any |= this.walkable[i];
      if (!any) fallbackAll();

      this.walkableReady = true;

      if (NAVMASK_DEBUG) {
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.35, depthWrite: false });
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
    // template (mesh + skeleton)
    const base = await this.loader.loadAsync('/madverse/assets/goblin_run.glb');
    this.template = base.scene;
    this.template.traverse(o => {
      if (o.isMesh) console.log(o.name, o.material?.name);
    });

    // ✅ colorSpace per texture (alcuni exporter non lo impostano)
    this.template.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        m.needsUpdate = true;
      }
    });

    // clips (animazioni)
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
        // spawn su cella walkable
        let sx = 0, sy = 0;
        for (let k = 0; k < 140; k++) {
          const x = Math.random() * GRID_WIDTH;
          const y = Math.random() * GRID_HEIGHT;
          const { ix, iy } = toCellIndex(x, y);
          if (this.isWalkableCell(ix, iy)) {
            sx = x;
            sy = y;
            break;
          }
        }

        // seed materiali stabile per goblin id
        const seed = Math.floor(hashStringTo01(id, this._seedBase) * 1e9);

        const g = new Goblin(
          this.template,
          this.clips,
          { x: sx, y: sy },
          owner,
          (goblin, chest) => this._onGoblinDigComplete(goblin, chest),
          (ix, iy) => this.isWalkableCell(ix, iy),
          seed
        );

        this.scene.add(g.root);
        this.goblins.set(id, g);
        this.missingTicks.set(id, 0);
      } else {
        const g = this.goblins.get(id);
        if (g && g.owner !== owner) g.owner = owner;
        this.missingTicks.set(id, 0);
      }
    });

    // garbage collect dopo N sync mancati
    this.goblins.forEach((g, id) => {
      if (active.has(id)) {
        this.missingTicks.set(id, 0);
        return;
      }

      const n = (this.missingTicks.get(id) || 0) + 1;
      this.missingTicks.set(id, n);

      if (n >= this.MISSING_TICKS_BEFORE_REMOVE) {
        g.finish();
        this.goblins.delete(id);
        this.missingTicks.delete(id);
      }
    });
  }

  _onGoblinDigComplete(goblin, chest) {
    // claim gestito nel loop con delay
  }

  _tryStartDelayedClaim(goblinId, chest) {
    if (!chest) return;
    const chestKey = `${chest.world.x}:${chest.world.y}`;

    if (this.claimChestKey === chestKey) return;
    if (this.pendingClaimKey === chestKey) return;

    this.pendingClaimKey = chestKey;
    this.pendingWinnerId = goblinId;
    this.pendingClaimAt = performance.now() + CHEST_CLAIM_DELAY_MS;

    // appena parte il countdown, la chest “apre un filo” (feedback)
    this.chestFx.open();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    let dt = this.clock.getDelta();
    if (dt > 0.12) dt = 0;
    dt = Math.min(dt, 1 / 30);

    const now = performance.now();
    const liveDrop = this.drop || GameState.drop?.current || null;

    // chest visibile se lo state è visible o se c’è un pending claim
    const chestVisibleFromState = liveDrop && GameState.drop?.fx?.phase === 'visible';
    const chestVisibleFromPending = !!this.pendingClaimKey;

    const chest = (chestVisibleFromState || chestVisibleFromPending) ? liveDrop : null;

    // --- chest render (3D FX) ---
    if (chest) {
      const p = cellToWorld(chest.world.x, chest.world.y);
      if (!this.chestFx.root.visible) this.chestFx.showAt(p);
      this.chestFx.root.position.x = p.x;
      this.chestFx.root.position.z = p.z;
    } else {
      this.chestFx.hide();
    }
    this.chestFx.update(dt);

    // --- update goblins ---
    const pairs = Array.from(this.goblins.entries());
    const neighbors = pairs.map(p => p[1]);

    for (let i = 0; i < pairs.length; i++) {
      const [id, g] = pairs[i];

      g.update(dt, chest, neighbors);

      const p = g.worldPosition();
      g.root.position.set(p.x, GOBLIN_Y_OFFSET, p.z);

      // badge segue il goblin (già child del root), ma manteniamo la “nudge” su z costante
      if (g.badge) {
        g.badge.position.y = BADGE_HEAD_Y;
        g.badge.position.z = BADGE_SCREEN_NUDGE_Z;
      }

      // primo contatto: avvia countdown
      if (chest && !this.pendingClaimKey) {
        const dist = chebyshev(g.cell, chest.world);
        if (dist <= CHEST_TRIGGER_RANGE) {
          this._tryStartDelayedClaim(id, chest);
        }
      }
    }

    // --- dopo delay: claim una sola volta ---
    if (this.pendingClaimKey && now >= this.pendingClaimAt) {
      this.claimChestKey = this.pendingClaimKey;

      this.pendingClaimKey = null;
      this.pendingWinnerId = null;
      this.pendingClaimAt = 0;

      // “apertura completa” feedback
      this.chestFx.open();

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
    if (!drop) this.claimChestKey = null;
  }
}
