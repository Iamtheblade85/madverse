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
const DIG_DURATION_MS = 1200;       // quanto dura il "digging" prima di consumare
const CHEST_Y_OFFSET = 0.15;        // altezza sopra il plot
const LABEL_Y_OFFSET = -0.85;
const FIX_GOBLIN_FLIP_X = Math.PI;  // ✅ 180°: testa su, piedi giù

const GOBLIN_Y_OFFSET = 0.05;       // piccolo offset sopra il plot

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

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // dimensioni “fisse” per texture pulita
  canvas.width = 512;
  canvas.height = 128;

  // background
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // bordo
  ctx.strokeStyle = 'rgba(56,189,248,0.9)';
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
     depthTest: true,     // ✅ rispetta la profondità (non copre sempre il goblin)
     depthWrite: false    // ✅ non “scrive” nello z-buffer (evita artefatti)
   });
   
   const spr = new THREE.Sprite(mat);
   
   // ✅ molto più piccolo: (prima era 8x2 = enorme)
   spr.scale.set(2.6, 0.65, 1);
   
   spr.renderOrder = 50;  // ✅ sopra il plot, ma non “sempre sopra” il goblin grazie al depthTest
   return spr;

}

/* =========================
   GOBLIN CONTROLLER
========================= */
class Goblin {
  constructor(template, clips, startCell, owner, onDigComplete) {
    this.root = SkeletonUtils.clone(template);
     this.root.scale.setScalar(1.5);
    // se è "girato" rispetto alla mappa, usa Y (non X)
    //this.root.rotation.y += Math.PI;
    this.owner = owner || 'player';
    this.onDigComplete = onDigComplete;

    // ✅ fix orientation (if model appears flipped)
    if (FIX_GOBLIN_FLIP_X) {
      this.root.rotation.x += FIX_GOBLIN_FLIP_X;
    }

    // ✅ label above head
    this.label = makeLabelSprite(this.owner);
    this.label.position.set(0, LABEL_Y_OFFSET, 0);
    this.root.add(this.label);
     
    this.mixer = new THREE.AnimationMixer(this.root);

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
     // target casuale dentro i limiti della griglia
     const minX = WANDER_MARGIN;
     const maxX = GRID_WIDTH - WANDER_MARGIN;
     const minY = WANDER_MARGIN;
     const maxY = GRID_HEIGHT - WANDER_MARGIN;
   
     this.target = {
       x: minX + Math.random() * (maxX - minX),
       y: minY + Math.random() * (maxY - minY),
     };
   
     const now = performance.now();
     this.nextWanderAt = now + (WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS));
   }
      
  update(dt, chest) {
    if (!this.visible) return;

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
        this.surpriseUntil = performance.now() + SURPRISE_DURATION_MS;
        this._play('SURPRISED');
      }

      if (this.state === 'SURPRISED') {
        if (performance.now() >= this.surpriseUntil) {
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

          // start digging timer (one-shot per chest)
          this.digChestKey = chestKey;
          this.digUntil = performance.now() + DIG_DURATION_MS;
          this.digFired = false;
        }

        // when digging finishes -> consume chest (auto-claim)
        if (!this.digFired && this.digChestKey === chestKey && performance.now() >= this.digUntil) {
          this.digFired = true;
          if (typeof this.onDigComplete === 'function') {
            this.onDigComplete(this, chest);
          }
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
   
     // ✅ WANDER: se non c'è chest, cammina verso target casuali
     const now = performance.now();
     const dx = this.target.x - this.cell.x;
     const dy = this.target.y - this.cell.y;
     const dist = Math.hypot(dx, dy);
   
     // se sono arrivato vicino al target oppure è scaduto il timer => nuovo target
     if (dist <= WANDER_REACH_EPS || now >= this.nextWanderAt) {
       this._pickRandomTarget();
     }
   }

    /* ====== MOVEMENT ====== */
    if (this.state === 'RUNNING' || this.state === 'MOVING_TO_CHEST') {
      const dx = this.target.x - this.cell.x;
      const dy = this.target.y - this.cell.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.01) {
        this.cell.x += (dx / len) * GOBLIN_SPEED * dt;
        this.cell.y += (dy / len) * GOBLIN_SPEED * dt;
      }
    }

    // ✅ non farli mai uscire dal plot (specialmente dopo tab-switch)
    this.cell.x = THREE.MathUtils.clamp(this.cell.x, WANDER_MARGIN, GRID_WIDTH - WANDER_MARGIN);
    this.cell.y = THREE.MathUtils.clamp(this.cell.y, WANDER_MARGIN, GRID_HEIGHT - WANDER_MARGIN);

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
    this.claimChestKey = null;    
  }

  async init() {
    this._initRenderer();
    this._loadPlot();
    this._loadChest();
    await this._loadGoblinAssets();
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
        const g = new Goblin(
          this.template,
          this.clips,
          {
            x: WANDER_MARGIN + Math.random() * (GRID_WIDTH - 2 * WANDER_MARGIN),
            y: WANDER_MARGIN + Math.random() * (GRID_HEIGHT - 2 * WANDER_MARGIN)
          },
          owner,
          (goblin, chest) => this._onGoblinDigComplete(goblin, chest)
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
    if (!chest) return;

    const chestKey = `${chest.world.x}:${chest.world.y}`;
    if (this.claimChestKey === chestKey) return; // già tentato
    this.claimChestKey = chestKey;

    // ✅ modalità reale: chiama la funzione esistente del tuo HTML
    if (typeof window.claimActiveDrop === 'function') {
      window.claimActiveDrop();
    } else {
      // fallback: se non esiste, almeno nascondiamo la chest visivamente
      if (window.__GOBLIN_DEX_STATE__?.drop?.fx) {
        window.__GOBLIN_DEX_STATE__.drop.fx.phase = 'idle';
      }
    }
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

   let dt = this.clock.getDelta();
   
   // ✅ se il tab è stato in background o c'è un hitch, evita il "teletrasporto"
   if (dt > 0.12) dt = 0;
   
   // ✅ clamp ulteriore (max ~30 FPS step)
   dt = Math.min(dt, 1 / 30);

    const liveDrop = this.drop || GameState.drop?.current || null;
    const chest =
      liveDrop && GameState.drop.fx?.phase === 'visible'
        ? liveDrop
        : null;

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

   this.goblins.forEach(g => {
     g.update(dt, chest);
     const p = g.worldPosition();
     g.root.position.set(p.x, GOBLIN_Y_OFFSET, p.z); // ✅ sempre sopra il plot
   });
    this.renderer.render(this.scene, this.camera);
  }
   
  setDrop(drop) {
    this.drop = drop || null;
    if (!drop) {
      this.claimChestKey = null;
    }
  }
}
