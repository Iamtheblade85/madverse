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
const SURPRISE_DURATION_MS = 700;
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

/* =========================
   GOBLIN CONTROLLER
========================= */
class Goblin {
  constructor(template, clips, startCell) {
    this.root = SkeletonUtils.clone(template);
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

    this.lastChestKey = null;
    this.visible = true;

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
        this.state = 'DIGGING';
        this._play('DIGGING');
      } else {
        this.state = 'MOVING_TO_CHEST';
        this._play('RUNNING');
      }
    } else {
      this.lastChestKey = null;
      if (this.state !== 'RUNNING') {
        this.state = 'RUNNING';
        this._play('RUNNING');
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

    this.scene.add(new THREE.AmbientLight(0xffffff, 1));

    this.clock = new THREE.Clock();
    this.loader = new GLTFLoader();

    this.goblins = new Map();
  }

  async init() {
    this._initRenderer();
    this._loadPlot();
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

  _loadPlot() {
    const tex = new THREE.TextureLoader().load('/madverse/madverse/assets/plot.png');
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    plane.rotation.x = -Math.PI / 2;
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
    const active = new Set(expeditions.map(e => e.id));

    expeditions.forEach(e => {
      if (!this.goblins.has(e.id)) {
        const g = new Goblin(
          this.template,
          this.clips,
          { x: Math.random() * GRID_WIDTH, y: Math.random() * GRID_HEIGHT }
        );
        this.scene.add(g.root);
        this.goblins.set(e.id, g);
      }
    });

    this.goblins.forEach((g, id) => {
      if (!active.has(id)) {
        g.finish();
        this.goblins.delete(id);
      }
    });
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    const dt = this.clock.getDelta();
    const chest =
      GameState.drop?.current &&
      GameState.drop.fx?.phase === 'visible'
        ? GameState.drop.current
        : null;

    this.goblins.forEach(g => {
      g.update(dt, chest);
      g.root.position.copy(g.worldPosition());
    });

    this.renderer.render(this.scene, this.camera);
  }
}
