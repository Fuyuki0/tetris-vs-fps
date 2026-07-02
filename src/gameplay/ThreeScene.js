import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TETRIS_ROWS, TETRIS_COLS, PIECE_COLORS, PIECE_SHAPES, GAME_WIDTH, GAME_HEIGHT, ARENA_X, ARENA_Y, CELL_SIZE, GUNNER_MAX_HP, GUNNER_UTILITIES } from '../config/constants.js';

// ─── ThreeScene ───────────────────────────────────────────
// Unified Three.js 3D renderer for the Tetris board.
// Renders cubes for locked blocks, falling piece, ghost piece,
// and visual effects (shield, iron body, damage).
// Sits behind the Phaser canvas which acts as a transparent HUD.

export default class ThreeScene {
  constructor(phaserScene, role = 'tetris') {
    this.phaserScene = phaserScene;
    this.role = role;

    // ─── DOM Setup ─────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'three-container';
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.zIndex = '0';
    this.container.style.pointerEvents = 'none';

    const gameContainer = document.getElementById('game-container');
    gameContainer.insertBefore(this.container, gameContainer.firstChild);

    // Force Phaser canvas on top
    phaserScene.game.canvas.style.position = 'relative';
    phaserScene.game.canvas.style.zIndex = '1';

    // ─── Three.js Scene ───────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);
    this.scene.fog = new THREE.FogExp2(0x050810, 0.012);

    // ─── Camera ───────────────────────────────────────
    const aspect = GAME_WIDTH / GAME_HEIGHT;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
    this.thirdPersonCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
    this.isThirdPerson = false;

    if (this.role === 'tetris') {
      // Tetris Player: View board from front
      this.camera.position.set(5, TETRIS_ROWS / 2, 20);
      this.camera.lookAt(5, TETRIS_ROWS / 2, 0);
    } else {
      // Gunner: positioned facing the board, spawned in the center of the walk area (X = 5, Z = 41)
      this.camera.position.set(5, TETRIS_ROWS / 2, 41);
      this.camera.lookAt(5, TETRIS_ROWS / 2, 0);
    }

    // ─── Character Model (3rd Person) ─────────────────
    this._buildCharacterModel();

    // Add cameras to scene so children (like UI groups) are rendered
    this.scene.add(this.camera);
    this.scene.add(this.thirdPersonCamera);

    // ─── Renderer ─────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);

    // Copy Phaser's scaled dimensions exactly
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0px';
    this.renderer.domElement.style.left = '0px';
    this.renderer.domElement.style.zIndex = '0'; // Behind Phaser (which is 1)

    this._syncCanvasSize = () => {
      if (this.phaserScene && this.phaserScene.game && this.phaserScene.game.canvas) {
        const pCanvas = this.phaserScene.game.canvas;
        const tCanvas = this.renderer.domElement;

        // Use exact bounding rect to perfectly overlay the 3D canvas on the 2D canvas,
        // ignoring any flexbox or margin layout conflicts.
        const pRect = pCanvas.getBoundingClientRect();
        const cRect = this.container.getBoundingClientRect();

        tCanvas.style.position = 'absolute';
        tCanvas.style.width = pRect.width + 'px';
        tCanvas.style.height = pRect.height + 'px';
        tCanvas.style.left = (pRect.left - cRect.left) + 'px';
        tCanvas.style.top = (pRect.top - cRect.top) + 'px';
        tCanvas.style.margin = '0';
        tCanvas.style.padding = '0';
      }
    };

    // Listen for resize to sync Three.js canvas perfectly with Phaser
    this.resizeObserver = new ResizeObserver(() => {
      this._syncCanvasSize();
      if (this.phaserScene && this.phaserScene.game && this.phaserScene.game.canvas) {
        const pRect = this.phaserScene.game.canvas.getBoundingClientRect();
        const aspect = pRect.width / pRect.height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.thirdPersonCamera.aspect = aspect;
        this.thirdPersonCamera.updateProjectionMatrix();
      }
    });
    // Observe after a tiny delay so Phaser has mounted its canvas
    setTimeout(() => {
      if (this.phaserScene && this.phaserScene.game && this.phaserScene.game.canvas) {
        this.resizeObserver.observe(phaserScene.game.canvas);
        this._syncCanvasSize();
      }
    }, 100);

    // ─── Lighting ─────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(5, 25, 20);
    this.scene.add(dirLight);

    // Accent colored rim lights
    const blueLight = new THREE.PointLight(0x00d4ff, 0.6, 40);
    blueLight.position.set(-3, TETRIS_ROWS, 5);
    this.scene.add(blueLight);

    const pinkLight = new THREE.PointLight(0xff2d55, 0.4, 40);
    pinkLight.position.set(TETRIS_COLS + 3, 0, 5);
    this.scene.add(pinkLight);

    // ─── Block Mesh Pool ──────────────────────────────
    this.cubes = new Map(); // key -> { mesh, edgeMesh }
    this.cubeGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    this.edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.94, 0.94, 0.94));
    this.materials = {};
    this.edgeMaterials = {};

    // ─── Impact Light Pool (Performance) ──────────────
    this.impactLights = [];
    this.impactLightIdx = 0;
    for (let i = 0; i < 5; i++) {
      const light = new THREE.PointLight(0xffcc00, 0, 4);
      this.scene.add(light);
      this.impactLights.push(light);
    }

    // ─── Scorch Mark Pool (Bullet Holes) ──────────────
    this._createScorchTexture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const cx = 32, cy = 32;

      ctx.fillStyle = '#0a0a0a'; // very dark ash
      ctx.beginPath();
      for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2;
        const radius = 10 + Math.random() * 20;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      return texture;
    };

    this.scorchTexture = this._createScorchTexture();
    this.scorchMaterial = new THREE.MeshBasicMaterial({
      map: this.scorchTexture,
      transparent: true,
      depthWrite: false,
    });

    this.scorches = [];
    this.scorchIdx = 0;
    const scorchGeo = new THREE.PlaneGeometry(0.4, 0.4);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(scorchGeo, this.scorchMaterial);
      mesh.visible = false;
      this.scene.add(mesh);
      this.scorches.push(mesh);
    }

    // ─── Board Frame ──────────────────────────────────
    this._buildBoardFrame();

    // ─── Floor Grid ───────────────────────────────────
    this._buildFloorGrid();

    // ─── Parkour Obstacles ────────────────────────────
    this.parkourObstacles = [];

    // ─── 3D Hologram UI (Both Players) ────────────────
    this._buildHologramUI();

    // Ghost piece material
    this.ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Shield aura material
    this.shieldMaterial = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.25,
      emissive: 0x00d4ff,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.5,
      wireframe: true,
    });

    // Iron body overlay
    this.ironOverlayMeshes = [];

    // Shield aura meshes
    this.shieldAuraMeshes = [];

    // ─── Gunner WASD Controls ─────────────────────────
    if (this.role === 'gunner') {
      this.keys = phaserScene.input.keyboard.addKeys('W,A,S,D,SHIFT,SPACE');
      // Full FPS Mouse look state
      this.yaw = 0;
      this.pitch = 0;
      this.camera.rotation.order = 'YXZ'; // Required for correct FPS camera rotation

      // True View Punch (Camera Kick Spring)
      this.viewPunch = { pitch: 0, yaw: 0 };

      // View Model Weapon setup
      this.viewModel = new THREE.Group();
      this.camera.add(this.viewModel); // Attach to camera so it stays on screen
      this.scene.add(this.camera);     // Ensure camera is in scene to render its children

      // 3D UI Group (bottom right)
      this.uiModelGroup = new THREE.Group();
      this.camera.add(this.uiModelGroup);
      this.uiWeaponModels = {};

      this.currentWeaponModel = null;
      this.weaponModels = {}; // Dictionary of all view models
      this.grenadeModels = {}; // Dictionary of grenade meshes for cloning

      this.weaponBobPhase = 0;
      this.weaponRecoilOffset = { x: 0, y: 0, z: 0 };

      this.loadAllModels();
    }

    // ─── Hit detection ────────────────────────────────
    this.raycaster = new THREE.Raycaster();

    // ─── Gunner Avatar (visible only to Tetris player) ───
    if (this.role === 'tetris') {
      const geo = new THREE.BoxGeometry(0.8, 1.8, 0.8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
      this.gunnerMesh = new THREE.Mesh(geo, mat);
      // Place it where the gunner spawns by default
      this.gunnerMesh.position.set(TETRIS_COLS / 2, -0.2, 18);
      this.scene.add(this.gunnerMesh);
    }

    // ─── Visual Effects ───────────────────────────────
    this.effects = [];
    this.projectiles = []; // Trajectory projectiles (grenades, flashbangs)

    // ─── Animation time ───────────────────────────────
    this._time = 0;

    // ─── Resize handler ───────────────────────────────
    this._onResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  loadAllModels() {
    const objLoader = new OBJLoader();
    const textureLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();

    // Helper to perfectly center downloaded models before you manually scale/position them.
    // This fixes the issue where models turn invisible because their origin is 20 meters away!
    const wrapAndCenter = (model) => {
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center); // Shift the raw mesh to center
      const group = new THREE.Group();
      group.add(model); // Put it in a clean group
      return group;
    };

    this.uiMaterialGrey = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.1, roughness: 0.9 });
    const weaponOrder = ['knife', 'deagle', 'ak47', 'grenade', 'flashbang', 'smoke'];

    this.uiWeaponMaterials = {};
    this.viewWeaponMaterials = {};

    const applyWeaponShader = (model, key, isUtility, isUI) => {
      // Compute bounding box in local camera space
      const oldParent = model.parent;
      const tempScene = new THREE.Scene();
      tempScene.add(model);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      if (oldParent) {
        oldParent.add(model);
      } else {
        tempScene.remove(model);
      }

      const fillAxis = isUtility ? 1 : 0; // 1 for Y (bottom-to-top), 0 for X (left-to-right)

      const shaderMat = new THREE.ShaderMaterial({
        uniforms: {
          color1: { value: new THREE.Color(0xffffff) },
          color2: { value: new THREE.Color(0x000000) },
          fillRatio: { value: 1.0 },
          fillAxis: { value: fillAxis },
          boundsMin: { value: new THREE.Vector2(box.min.x, box.min.y) },
          boundsMax: { value: new THREE.Vector2(box.max.x, box.max.y) }
        },
        vertexShader: `
          varying vec3 vViewPos;
          void main() {
            vViewPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * vec4(vViewPos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color1;
          uniform vec3 color2;
          uniform float fillRatio;
          uniform int fillAxis;
          uniform vec2 boundsMin;
          uniform vec2 boundsMax;
          varying vec3 vViewPos;

          void main() {
            float t = 0.0;
            if (fillAxis == 0) {
              t = (vViewPos.x - boundsMin.x) / (boundsMax.x - boundsMin.x);
            } else {
              t = (vViewPos.y - boundsMin.y) / (boundsMax.y - boundsMin.y);
            }
            
            t = clamp(t, 0.0, 1.0);

            if (t <= fillRatio) {
              gl_FragColor = vec4(color1, 1.0);
            } else {
              gl_FragColor = vec4(color2, 1.0);
            }
          }
        `
      });

      model.traverse(c => {
        if (c.isMesh) {
          c.material = shaderMat;

          // Add a subtle wireframe outline so the black state remains visible against the background
          const edges = new THREE.EdgesGeometry(c.geometry, 15);
          const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x666666 }));
          c.add(outline);
        }
      });

      if (isUI) {
        this.uiWeaponMaterials[key] = shaderMat;
      } else {
        this.viewWeaponMaterials[key] = shaderMat;
      }
    };

    const addUIWeapon = (key, baseModel, uiScale = 1.0) => {
      if (this.role !== 'gunner') return;

      const uiModel = baseModel.clone();
      uiModel.visible = true;
      uiModel.userData.baseScale = uiScale;

      const idx = weaponOrder.indexOf(key);
      if (idx === -1) return;

      uiModel.scale.setScalar(uiScale);
      uiModel.position.set(-0.95, 0.2 - (idx * 0.15), -1.2);

      if (key === 'ak47' || key === 'deagle') {
        uiModel.rotation.set(0, -Math.PI / 2, 0);
      } else if (key === 'knife') {
        uiModel.rotation.set(0, Math.PI / 2, - Math.PI / 1);
      } else if (key === 'smoke' || key === 'flashbang' || key === 'grenade') {
        uiModel.rotation.set(Math.PI / 6, -Math.PI / 2, 0);
      } else {
        uiModel.rotation.set(0, 0, 0);
      }

      const isUtility = (key === 'grenade' || key === 'flashbang' || key === 'smoke');
      applyWeaponShader(uiModel, key, isUtility, true);

      this.uiWeaponModels[key] = uiModel;
      this.uiModelGroup.add(uiModel);
    };

    // Load AK47
    gltfLoader.load('assets/models/ak47_counter_strike_2.glb', (gltf) => {
      const model = wrapAndCenter(gltf.scene);
      model.scale.set(1.5, 1.5, 1.5);
      model.position.set(0.3, -0.2, -0.5);
      model.rotation.y = -Math.PI;
      model.visible = false;
      this.weaponModels['ak47'] = model;
      this.viewModel.add(model);
      addUIWeapon('ak47', model, 0.36);
    });

    // Load Deagle
    gltfLoader.load('assets/models/deagle_counter_strike_2/scene.gltf', (gltf) => {
      const model = wrapAndCenter(gltf.scene);
      model.scale.set(1.5, 1.5, 1.5);
      model.position.set(0.3, -0.2, -0.5);
      model.rotation.y = -Math.PI;
      model.visible = false;
      this.weaponModels['deagle'] = model;
      this.viewModel.add(model);
      addUIWeapon('deagle', model, 0.36);
    });

    // Load Knife (Karambit)
    gltfLoader.load('assets/models/karambit_fade/scene.gltf', (gltf) => {
      const model = wrapAndCenter(gltf.scene);
      model.scale.set(0.1, 0.1, 0.1);
      model.position.set(0.2, -0.2, -0.4);
      // Karambit usually held reverse grip or sideways
      model.rotation.set(0, Math.PI / 1, Math.PI / 1);
      model.visible = false;
      this.weaponModels['knife'] = model;
      this.viewModel.add(model);
      addUIWeapon('knife', model, 0.08);
    });

    // Load Grenade (Frag)
    gltfLoader.load('assets/models/pubg_mobile_grenade/scene.gltf', (gltf) => {
      const model = wrapAndCenter(gltf.scene);
      this.grenadeModels['grenade'] = model;

      const view = model.clone();
      view.scale.set(0.012, 0.012, 0.012);
      view.position.set(0.25, -0.25, -0.5); // Hold in right hand
      view.visible = false;
      this.weaponModels['grenade'] = view;
      this.viewModel.add(view);

      addUIWeapon('grenade', model, 0.010);
    });

    // Load Flashbang
    gltfLoader.load('assets/models/flashbang_grenade.glb', (gltf) => {
      const model = wrapAndCenter(gltf.scene);
      this.grenadeModels['flashbang'] = model;

      const view = model.clone();
      view.scale.set(0.4, 0.4, 0.4);
      view.position.set(0.25, -0.25, -0.5);
      view.rotation.set(Math.PI / 4, 0, 0);
      view.visible = false;
      this.weaponModels['flashbang'] = view;
      this.viewModel.add(view);

      addUIWeapon('flashbang', model, 0.35);
    });

    // Load Smoke (M18) - Bypassing wrapAndCenter because the M18 file has a corrupted bounding box
    gltfLoader.load('assets/models/m18_smoke_grenade/scene.gltf', (gltf) => {
      const model = gltf.scene; // Do NOT wrap and center this specific model!
      this.grenadeModels['smoke'] = model;

      const view = model.clone();
      view.scale.set(0.0001, 0.0001, 0.0001);
      view.position.set(0.25, -0.25, -0.5);
      view.visible = false;
      this.weaponModels['smoke'] = view;
      this.viewModel.add(view);

      addUIWeapon('smoke', model, 0.00008);
    });
  }

  // ─── Materials ────────────────────────────────────────
  getMaterial(colorNum, hpRatio = 1, isIron = false) {
    if (isIron) {
      const key = 'iron';
      if (!this.materials[key]) {
        this.materials[key] = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          roughness: 0.05, // very shiny
          metalness: 1.0,  // full metal
          emissive: 0x8899aa,
          emissiveIntensity: 0.25,
        });
      }
      return this.materials[key];
    }

    // Create base material per color, clone for damage
    const key = `${colorNum}_${Math.round(hpRatio * 10)}`;
    if (!this.materials[key]) {
      const baseColor = new THREE.Color(colorNum);
      const damage = 1 - hpRatio;

      // Darken significantly as damage increases
      const damaged = baseColor.clone().lerp(new THREE.Color(0x222222), damage * 0.6);

      this.materials[key] = new THREE.MeshStandardMaterial({
        color: damaged,
        roughness: 0.25 + damage * 0.5,
        metalness: 0.7 - damage * 0.5,
        emissive: damaged,
        emissiveIntensity: 0.25 * hpRatio,
      });
    }
    return this.materials[key];
  }

  getEdgeMaterial(colorNum, hpRatio = 1) {
    const key = `${colorNum}_${Math.round(hpRatio * 10)}`;
    if (!this.edgeMaterials[key]) {
      const baseColor = new THREE.Color(colorNum);
      // Edges turn stark red as the block takes damage
      const edgeColor = baseColor.clone().lerp(new THREE.Color(0xff0000), 1 - hpRatio);

      this.edgeMaterials[key] = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        // Edges become more opaque and visible when damaged
        opacity: 0.4 + (1 - hpRatio) * 0.5,
      });
    }
    return this.edgeMaterials[key];
  }

  // ─── Board Frame ──────────────────────────────────────
  _buildBoardFrame() {
    // Wireframe box around the play area
    const frameGeo = new THREE.BoxGeometry(TETRIS_COLS, TETRIS_ROWS, 1.2);
    const edgesGeo = new THREE.EdgesGeometry(frameGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.2 });
    const frame = new THREE.LineSegments(edgesGeo, frameMat);
    frame.position.set(TETRIS_COLS / 2 - 0.5, TETRIS_ROWS / 2 - 0.5, 0);
    this.scene.add(frame);

    // Back wall (dark transparent plane)
    const backGeo = new THREE.PlaneGeometry(TETRIS_COLS + 0.4, TETRIS_ROWS + 0.4);
    const backMat = new THREE.MeshBasicMaterial({
      color: 0x060a14,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.backWall = new THREE.Mesh(backGeo, backMat);
    this.backWall.position.set(TETRIS_COLS / 2 - 0.5, TETRIS_ROWS / 2 - 0.5, -0.7);
    this.scene.add(this.backWall);
  }

  // ─── Floor Grid ───────────────────────────────────────
  _buildFloorGrid() {
    // Playable area is X: -15 to 40 (width 55), Z: 2 to 160 (depth 158). Center is (12.5, 81)
    const gridHelper = new THREE.GridHelper(160, 160, 0x00d4ff, 0x0a1520);
    gridHelper.position.set(4.5, -0.6, 81);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.25;
    this.scene.add(gridHelper);

    // Glowing border to show EXACTLY where the player can move
    const borderGeo = new THREE.PlaneGeometry(55, 158);
    const borderEdges = new THREE.EdgesGeometry(borderGeo);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5 });
    const borderLine = new THREE.LineSegments(borderEdges, borderMat);
    borderLine.rotation.x = -Math.PI / 2;
    borderLine.position.set(4.5, -0.59, 81); // Slightly above grid
    this.scene.add(borderLine);

    // Faint highlight plane for the playable floor
    const planeGeo = new THREE.PlaneGeometry(55, 158);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.04, side: THREE.DoubleSide });
    const floorPlane = new THREE.Mesh(planeGeo, planeMat);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(4.5, -0.61, 81);
    this.scene.add(floorPlane);
  }

  // ─── 3D Hologram UI ───────────────────────────────────
  _buildHologramUI() {
    // Left Screen Canvas
    this.leftCanvas = document.createElement('canvas');
    this.leftCanvas.width = 512;
    this.leftCanvas.height = 1024;
    this.leftCtx = this.leftCanvas.getContext('2d', { willReadFrequently: true });
    this.leftTexture = new THREE.CanvasTexture(this.leftCanvas);

    const leftGeo = new THREE.PlaneGeometry(8, 16);
    const leftMat = new THREE.MeshBasicMaterial({ map: this.leftTexture, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.leftScreen = new THREE.Mesh(leftGeo, leftMat);
    // Position it further left so the inner UI doesn't clip into the Tetris board
    this.leftScreen.position.set(-6.5, 9.5, 0);
    this.leftScreen.rotation.y = Math.PI / 10;
    this.scene.add(this.leftScreen);

    // Right Screen Canvas
    this.rightCanvas = document.createElement('canvas');
    this.rightCanvas.width = 512;
    this.rightCanvas.height = 1024;
    this.rightCtx = this.rightCanvas.getContext('2d', { willReadFrequently: true });
    this.rightTexture = new THREE.CanvasTexture(this.rightCanvas);

    const rightGeo = new THREE.PlaneGeometry(8, 16);
    const rightMat = new THREE.MeshBasicMaterial({ map: this.rightTexture, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    this.rightScreen = new THREE.Mesh(rightGeo, rightMat);
    // Position it further right so the inner UI doesn't clip into the Tetris board
    this.rightScreen.position.set(15.5, 9.5, 0);
    this.rightScreen.rotation.y = -Math.PI / 10;
    this.scene.add(this.rightScreen);

    // UI Meshes Group for HOLD/NEXT queue
    this.leftBlocksGroup = new THREE.Group();
    this.leftScreen.add(this.leftBlocksGroup); // Inherit rotation!

    this.rightBlocksGroup = new THREE.Group();
    this.rightScreen.add(this.rightBlocksGroup); // Inherit rotation!

    this._uiCubes = new Map();
  }

  updateUI(state) {
    const drawVerticalHPBar = (ctx, x, y, w, h, currentHP, maxRegen, maxHP) => {
      const hpRatio = Math.max(0, currentHP / maxHP);
      const regenRatio = Math.max(0, maxRegen / maxHP);
      const fillHeight = h * hpRatio;

      const lostRatio = 1 - regenRatio;
      const lostHeight = h * lostRatio;

      // Background
      ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
      ctx.fillRect(x, y, w, h);

      // Draw burnt/lost permanent max HP (Dark Red) at the top
      if (lostHeight > 0) {
        ctx.fillStyle = 'rgba(51, 0, 0, 0.8)'; // 0x330000
        ctx.fillRect(x, y, w, lostHeight);
      }

      // HP Fill (Flat rectangle, always red)
      if (fillHeight > 0) {
        ctx.fillStyle = '#ff0000';

        ctx.fillRect(x, y + h - fillHeight, w, fillHeight);
      }

      // Border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Tick marks
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      for (let i = 1; i < 10; i++) {
        ctx.fillRect(x, y + (h / 10) * i, w, 3);
      }

      // Text label at top
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('HP', x + w / 2, y - 10);
      ctx.textAlign = 'left'; // Reset
    };

    const maxHP = GUNNER_MAX_HP;
    const currentHP = state.gunnerHP || 0;
    const maxRegen = state.gunnerMaxRegenHP || maxHP;

    // Update Holograms if they exist
    if (this.leftCtx && this.leftTexture) {
      const ctx = this.leftCtx;
      ctx.clearRect(0, 0, 512, 1024);

      // Panel background
      ctx.fillStyle = 'rgba(10, 14, 26, 0.6)';
      ctx.fillRect(0, 0, 512, 1024);
      ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 512, 1024);

      // Inner Vertical HP Bar (Left screen inner edge is x ≈ 450)
      // [ADJUST THIS] Change 452 (X pos) or 100 (Y pos) to move the left HP bar
      // Change 40 (width) or 800 (height) to resize it.
      drawVerticalHPBar(ctx, 452, 100, 40, 800, currentHP, maxRegen, maxHP);

      let y = 100; // [ADJUST THIS] This sets the starting Y position for SCORE

      // SCORE TEXT
      ctx.fillStyle = '#667788';
      ctx.font = '24px Orbitron';
      // [ADJUST THIS] Change 40 to move the 'SCORE' label left or right
      ctx.fillText('SCORE', 40, y);
      ctx.fillStyle = '#00d4ff';
      ctx.font = '48px Orbitron';
      // [ADJUST THIS] Change 40 to move the Score number left or right
      ctx.fillText(state.score.toString(), 40, y + 45);

      // HOLD TEXT (Next to Score)
      ctx.fillStyle = '#ffffff';
      ctx.font = '32px Orbitron';
      // [ADJUST THIS] Change 250 (X) or (y + 45) to move the 'HOLD' text
      ctx.fillText('HOLD', 250, y);

      // LEVEL TEXT
      y += 100; // [ADJUST THIS] Vertical spacing between SCORE and LEVEL
      ctx.fillStyle = '#667788';
      ctx.font = '24px Orbitron';
      ctx.fillText('LEVEL', 40, y);
      ctx.fillStyle = '#ffd700';
      ctx.font = '48px Orbitron';
      ctx.fillText(state.level.toString(), 40, y + 45);

      // LINES TEXT
      y += 100; // [ADJUST THIS] Vertical spacing between LEVEL and LINES
      ctx.fillStyle = '#667788';
      ctx.font = '24px Orbitron';
      ctx.fillText('LINES', 40, y);
      ctx.fillStyle = '#00ff88';
      ctx.font = '48px Orbitron';
      ctx.fillText(state.lines.toString(), 40, y + 45);

      // ABILITIES LIST at bottom left
      y += 200; // [ADJUST THIS] Vertical spacing between LINES and ABILITIES
      ctx.fillStyle = '#556677';
      ctx.font = '24px Orbitron';
      // [ADJUST THIS] Change 40 to move the 'ABILITIES' text
      ctx.fillText('ABILITIES', 40, y);

      ctx.font = '24px Inter';
      y += 40;
      state.abilities.forEach(a => {
        if (a.cooldown > 0) {
          ctx.fillStyle = '#556677';
          // [ADJUST THIS] Change 40 to move the abilities on cooldown
          ctx.fillText(`[${a.key}] ${a.name} (${Math.ceil(a.cooldown / 1000)}s)`, 40, y);
        } else {
          ctx.fillStyle = a.color;
          // [ADJUST THIS] Change 40 to move the ready abilities
          ctx.fillText(`[${a.key}] ${a.name} (RDY)`, 40, y);
        }
        y += 40; // [ADJUST THIS] Vertical spacing between each ability in the list
      });

      this.leftTexture.needsUpdate = true;
    }

    // ----------------------------------------------------
    // RIGHT SCREEN UI DRAWING
    // ----------------------------------------------------
    if (this.rightCtx && this.rightTexture) {
      const ctx = this.rightCtx;
      ctx.clearRect(0, 0, 512, 1024);

      ctx.fillStyle = 'rgba(10, 14, 26, 0.6)';
      ctx.fillRect(0, 0, 512, 1024);
      ctx.strokeStyle = 'rgba(255, 45, 85, 0.4)';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 512, 1024);

      // Inner Vertical HP Bar (Right screen inner edge is x ≈ 20)
      // [ADJUST THIS] Change 20 (X pos) or 100 (Y pos) to move the right HP bar
      drawVerticalHPBar(ctx, 20, 100, 40, 800, currentHP, maxRegen, maxHP);

      let y = 100;

      // NEXT TEXT
      // NEXT text on Right Screen - centered in the available space
      // Available space: x=60 to x=512. Center is (60+512)/2 = 286
      ctx.fillStyle = '#ffffff';
      ctx.font = '32px Orbitron';
      ctx.textAlign = 'center';
      // [ADJUST THIS] Change 286 to move the 'NEXT' text left or right
      ctx.fillText('NEXT', 286, y);
      ctx.textAlign = 'left'; // Reset

      // 3D NEXT BLOCKS are drawn right below this in the _updatePreviewBlocks function!

      // BUFFS (Iron Body / Shield Aura)
      y += 350; // [ADJUST THIS] Vertical spacing between NEXT text and the Buffs

      if (state.ironBodyActive) {
        ctx.fillStyle = '#aabbcc';
        ctx.font = '24px Inter';
        // [ADJUST THIS] Change 90 to move the Iron Body text left/right
        ctx.fillText(`🛡 Iron Body (${Math.ceil(state.ironBodyTimer / 1000)}s)`, 90, y);
        y += 40;
      }
      if (state.shieldHP > 0) {
        ctx.fillStyle = '#00d4ff';
        ctx.font = '24px Inter';
        // [ADJUST THIS] Change 90 to move the Shield Aura text left/right
        ctx.fillText(`✨ Shield Aura (${Math.floor(state.shieldHP)} HP)`, 90, y);
        y += 40;
      }

      this.rightTexture.needsUpdate = true;
    }

    // Update 3D Preview Blocks (This renders the actual 3D cubes for HOLD and NEXT)
    this._updatePreviewBlocks(state);
  }

  _updatePreviewBlocks(state) {
    const PIECE_SHAPES = {
      'I': [[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]]],
      'J': [[[1, 0, 0], [1, 1, 1], [0, 0, 0]]],
      'L': [[[0, 0, 1], [1, 1, 1], [0, 0, 0]]],
      'O': [[[1, 1], [1, 1]]],
      'S': [[[0, 1, 1], [1, 1, 0], [0, 0, 0]]],
      'T': [[[0, 1, 0], [1, 1, 1], [0, 0, 0]]],
      'Z': [[[1, 1, 0], [0, 1, 1], [0, 0, 0]]]
    };
    const PIECE_COLORS = { 'I': 0x00ffff, 'J': 0x0000ff, 'L': 0xffa500, 'O': 0xffff00, 'S': 0x00ff00, 'T': 0x800080, 'Z': 0xff0000 };

    const activeKeys = new Set();

    // Helper to draw a 3D shape on the Holographic screen
    const drawShape = (piece, localX, localY, localZ, prefix, parentGroup) => {
      if (!piece) return;
      const shape = PIECE_SHAPES[piece][0];
      const colorNum = PIECE_COLORS[piece];
      const mat = this.getMaterial(colorNum, 1, false);
      const edgeMat = this.getEdgeMaterial(colorNum, 1);

      const width = shape[0].length;
      const height = shape.length;

      // Calculate shape offset to center it based on its width
      // Since localX is the center, we subtract width / 2
      const startX = localX - (width / 2);

      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          if (shape[r][c]) {
            const key = `${prefix}_${r}_${c}`;
            activeKeys.add(key);

            let obj = this._uiCubes.get(key);
            if (!obj) {
              const mesh = new THREE.Mesh(this.cubeGeo, mat);
              const edge = new THREE.LineSegments(this.edgeGeo, edgeMat);
              parentGroup.add(mesh);
              parentGroup.add(edge);
              obj = { mesh, edge, parent: parentGroup };
              this._uiCubes.set(key, obj);
            } else if (obj.parent !== parentGroup) {
              // If it somehow changed parents (shouldn't happen, but just in case)
              obj.parent.remove(obj.mesh);
              obj.parent.remove(obj.edge);
              parentGroup.add(obj.mesh);
              parentGroup.add(obj.edge);
              obj.parent = parentGroup;
            }
            // Invert Y because array row 0 is top
            obj.mesh.position.set(startX + c + 0.5, localY - r, localZ);
            obj.edge.position.set(startX + c + 0.5, localY - r, localZ);
            obj.mesh.material = mat;
            obj.edge.material = edgeMat;
          }
        }
      }
    };

    // ----------------------------------------------------
    // HOLD PIECE 3D POSITIONING (LEFT SCREEN)
    // ----------------------------------------------------
    // Local coords (X: -4 to 4, Y: 8 to -8).
    // Canvas X=250 -> Local X ≈ -0.09. Canvas Y=150 -> Local Y ≈ 5.6

    // [ADJUST THIS] Change -0.09 to move the HOLD blocks left/right. 
    // [ADJUST THIS] Change 5.6 to move the HOLD blocks up/down.
    drawShape(state.heldPiece, 0.4, 4.6, 0, 'HOLD', this.leftBlocksGroup);

    // ----------------------------------------------------
    // NEXT PIECES 3D POSITIONING (RIGHT SCREEN)
    // ----------------------------------------------------
    // Canvas X=286 -> Local X ≈ 0.47

    // [ADJUST THIS] Change i < 4 to change how many blocks are shown (e.g. i < 3)
    for (let i = 0; i < 4; i++) {
      const piece = state.nextPieces[i];
      if (piece) {
        // [ADJUST THIS] Change 0.47 to move the NEXT blocks left/right.
        // [ADJUST THIS] Change 5.6 to move where the FIRST block starts up/down.
        // [ADJUST THIS] Change 3.0 to adjust the vertical spacing between each piece.
        drawShape(piece, 0.47, 4.6 - (i * 3.0), 0, `NEXT_${i}`, this.rightBlocksGroup);
      }
    }

    // Cleanup stale
    for (const [key, obj] of this._uiCubes.entries()) {
      if (!activeKeys.has(key)) {
        if (obj.mesh && obj.parent) obj.parent.remove(obj.mesh);
        if (obj.edge && obj.parent) obj.parent.remove(obj.edge);
        this._uiCubes.delete(key);
      }
    }
  }

  toggleThirdPerson() {
    if (this.role !== 'gunner') return;
    this.isThirdPerson = !this.isThirdPerson;

    // Toggle visibilities
    this.characterGroup.visible = this.isThirdPerson;
    this.viewModel.visible = !this.isThirdPerson;

    if (this.isThirdPerson) {
      this.thirdPersonCamera.add(this.uiModelGroup);
    } else {
      this.camera.add(this.uiModelGroup);
    }
  }

  _buildCharacterModel() {
    this.characterGroup = new THREE.Group();
    // Hide initially unless playing as Tetris (which always sees the Gunner)
    this.characterGroup.visible = (this.role === 'tetris');

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.8 });
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x334466, roughness: 0.9 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.set(0, 0.8, 0);

    // Visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.2), visorMat);
    visor.position.set(0, 0.85, -0.2); // front facing -Z

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), suitMat);
    body.position.set(0, 0.1, 0);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    this.armR = new THREE.Mesh(armGeo, suitMat);
    this.armR.position.set(0.45, 0.2, 0);

    this.armL = new THREE.Mesh(armGeo, suitMat);
    this.armL.position.set(-0.45, 0.2, 0);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
    this.legR = new THREE.Mesh(legGeo, suitMat);
    this.legR.position.set(0.2, -0.65, 0);

    this.legL = new THREE.Mesh(legGeo, suitMat);
    this.legL.position.set(-0.2, -0.65, 0);

    this.characterGroup.add(head);
    this.characterGroup.add(visor);
    this.characterGroup.add(body);
    this.characterGroup.add(this.armR);
    this.characterGroup.add(this.armL);
    this.characterGroup.add(this.legR);
    this.characterGroup.add(this.legL);

    this.scene.add(this.characterGroup);
  }

  // ─── Update ───────────────────────────────────────────
  update(delta, board, recoilOffset = { x: 0, y: 0 }) {
    this._time += delta;

    // Iron Skin background effect
    if (this.backWall) {
      if (board && board.ironBodyActive) {
        this.backWall.material.color.lerp(new THREE.Color(0x330a0a), 0.1);
      } else {
        this.backWall.material.color.lerp(new THREE.Color(0x060a14), 0.1);
      }
    }

    // ─── Gunner camera movement ─────────────────────
    if (this.role === 'gunner' && this.keys) {
      const dtF = delta / 16.6; // Time scaling for ~60 FPS

      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() > 0) forward.normalize();

      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      const inputDir = new THREE.Vector3();
      if (this.keys.W.isDown) inputDir.add(forward);
      if (this.keys.S.isDown) inputDir.add(forward.clone().negate());
      if (this.keys.A.isDown) inputDir.add(right.clone().negate());
      if (this.keys.D.isDown) inputDir.add(right);
      if (inputDir.lengthSq() > 0) inputDir.normalize();

      const isWalking = inputDir.lengthSq() > 0;

      // Handle Crouching
      const isCrouching = this.keys.SHIFT.isDown;
      const walkHeight = TETRIS_ROWS / 2 + 1;
      const targetHeight = isCrouching ? walkHeight * 0.7 : walkHeight;

      if (this.gunnerVelocity === undefined) this.gunnerVelocity = new THREE.Vector3();
      if (this.gunnerVelocityY === undefined) this.gunnerVelocityY = 0;
      if (this.baseCameraY === undefined) this.baseCameraY = targetHeight;

      // Smooth crouch transitioning on the ground level
      this.baseCameraY += (targetHeight - this.baseCameraY) * 0.15;

      const isGrounded = this.camera.position.y <= this.baseCameraY + 0.01;

      if (this.canJump === undefined) this.canJump = true;
      if (!this.keys.SPACE.isDown) {
        this.canJump = true;
      }

      // --- Physics Constants ---
      let maxGroundSpeed = isCrouching ? 0.1 : 0.3;

      // Weapon-based movement speed modifiers (High to low: Knife > Deagle > Utility > AK47)
      if (this.phaserScene && this.phaserScene.weaponSystem) {
        const wep = this.phaserScene.weaponSystem.currentWeapon;
        const wepObj = this.phaserScene.weaponSystem.getCurrentWeapon();
        if (wep === 'knife') maxGroundSpeed *= 2.0;
        else if (wep === 'deagle') maxGroundSpeed *= 1.65;
        else if (wepObj && wepObj.isUtility) maxGroundSpeed *= 1.3;
        else if (wep === 'ak47') maxGroundSpeed *= 1.5;
      }

      const groundAccel = 0.08;
      const maxAirSpeed = 0.06; // Limits how much speed you can gain *in the direction of input*
      const airAccel = 0.1; // High air acceleration enables B-Hopping when turning

      const currentSpeedInInput = this.gunnerVelocity.dot(inputDir);

      if (isGrounded) {
        // Friction
        const speed = Math.sqrt(this.gunnerVelocity.x ** 2 + this.gunnerVelocity.z ** 2);
        if (speed > 0) {
          // If jump is pressed, we don't apply friction this frame so we can preserve momentum
          if (!this.keys.SPACE.isDown) {
            // Smoothly interpolate friction for a nice slide that gradually slows down
            if (this.currentFriction === undefined) this.currentFriction = 0.15;
            const targetFriction = isCrouching ? 0.40 : 0.15;
            this.currentFriction += (targetFriction - this.currentFriction) * 0.15 * dtF;

            const drop = speed * this.currentFriction * dtF;
            const newSpeed = Math.max(speed - drop, 0);
            this.gunnerVelocity.x *= newSpeed / speed;
            this.gunnerVelocity.z *= newSpeed / speed;
          }
        }

        // Ground Acceleration
        if (isWalking) {
          const addSpeed = maxGroundSpeed - currentSpeedInInput;
          if (addSpeed > 0) {
            const accel = Math.min(groundAccel * dtF, addSpeed);
            this.gunnerVelocity.addScaledVector(inputDir, accel);
          }
        }

        this.camera.position.y = this.baseCameraY;
        this.gunnerVelocityY = 0;

        // Jump
        if (this.keys.SPACE.isDown && this.canJump) {
          this.gunnerVelocityY = 0.88; // Jump force
          this.canJump = false;
        }
      } else {
        // Air Acceleration (B-Hop logic)
        if (isWalking) {
          const addSpeed = maxAirSpeed - currentSpeedInInput;
          if (addSpeed > 0) {
            const accel = Math.min(airAccel * dtF, addSpeed);
            this.gunnerVelocity.addScaledVector(inputDir, accel);
          }
        }

        this.gunnerVelocityY -= 0.035 * dtF; // Gravity
      }

      // Apply velocity
      this.camera.position.x += this.gunnerVelocity.x * dtF;
      this.camera.position.y += this.gunnerVelocityY * dtF;
      this.camera.position.z += this.gunnerVelocity.z * dtF;

      // Prevent falling below floor
      if (this.camera.position.y < this.baseCameraY) {
        this.camera.position.y = this.baseCameraY;
        this.gunnerVelocityY = 0;
      }

      // Pass movement states to WeaponSystem
      if (this.phaserScene.weaponSystem) {
        this.phaserScene.weaponSystem.isWalking = isWalking;
        this.phaserScene.weaponSystem.isCrouching = isCrouching;
      }

      // Clamp position (X and Z only, Y is handled by crouch)
      // Expanded boundaries for freer movement: X from -22.5 to 32.5, Z from 2 to 160 (added more Z axis!)
      this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -22.5, 32.5);
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, 2, 160);

      // ─── FPS Mouse look ─────
      // Spring decay for View Punch (returns to 0 rapidly)
      this.viewPunch.pitch *= 0.8;
      this.viewPunch.yaw *= 0.8;

      const finalPitch = this.pitch - this.viewPunch.pitch;
      const finalYaw = this.yaw - this.viewPunch.yaw;

      this.camera.rotation.set(finalPitch, finalYaw, 0);

      // ─── Weapon View Model Animation ───
      // Update the current weapon model based on phaser scene
      if (this.phaserScene.weaponSystem) {
        const currentKey = this.phaserScene.weaponSystem.currentWeapon;

        // Hide all weapon models first
        Object.values(this.weaponModels).forEach(model => {
          if (model) model.visible = false;
        });

        // Show the active one
        if (this.weaponModels[currentKey]) {
          this.currentWeaponModel = this.weaponModels[currentKey];
          this.currentWeaponModel.visible = true;
        } else {
          this.currentWeaponModel = null;
        }

        // ─── 3D UI Updates ───
        if (this.uiWeaponModels) {
          Object.keys(this.uiWeaponModels).forEach(key => {
            const uiModel = this.uiWeaponModels[key];
            const isSelected = (key === currentKey);
            const isUtility = (key === 'grenade' || key === 'flashbang' || key === 'smoke');
            const ws = this.phaserScene.weaponSystem;

            const mat = this.uiWeaponMaterials[key];
            if (mat) {
              // Set foreground color (White if selected, Grey if not)
              if (isSelected) {
                mat.uniforms.color1.value.setHex(0xffffff);
              } else {
                mat.uniforms.color1.value.setHex(0x556677);
              }
              // Background is always black
              mat.uniforms.color2.value.setHex(0x000000);

              let fillRatio = 1.0;

              if (isUtility) {
                const cooldowns = this.phaserScene.utilityCooldowns;
                if (cooldowns && cooldowns[key] !== undefined) {
                  const currentCooldown = cooldowns[key];
                  const maxCooldown = GUNNER_UTILITIES[key]?.cooldown || 1;

                  if (currentCooldown > 0) {
                    fillRatio = 1.0 - (currentCooldown / maxCooldown);
                  }
                }
              } else {
                // Gun logic
                const weaponState = ws.weapons[key];
                if (weaponState) {
                  const maxAmmo = weaponState.maxAmmo;
                  const currentAmmo = weaponState.currentAmmo;

                  if (ws.isReloading && isSelected) {
                    // Fill based on reload progress
                    if (ws.reloadTimer) {
                      fillRatio = ws.reloadTimer.getProgress();
                    }
                  } else if (currentAmmo === 0) {
                    fillRatio = 0.0; // Out of ammo, solid black
                  } else {
                    fillRatio = 1.0; // Has ammo, solid color
                  }
                }
              }

              mat.uniforms.fillRatio.value = fillRatio;
            }

            // Pop out slightly when selected (no spinning)
            const targetScale = isSelected ? uiModel.userData.baseScale * 1.5 : uiModel.userData.baseScale;
            uiModel.scale.setScalar(uiModel.scale.x + (targetScale - uiModel.scale.x) * 0.1);
          });
        }
      }

      if (this.currentWeaponModel) {
        // Weapon bobbing when walking
        if (isWalking) {
          this.weaponBobPhase += (delta / 1000) * 12;
        } else {
          // Return to rest when stopped
          this.weaponBobPhase += (0 - this.weaponBobPhase) * 0.1;
        }

        const bobX = Math.sin(this.weaponBobPhase) * 0.005;
        const bobY = Math.cos(this.weaponBobPhase * 0.7) * 0.005;

        let switchDrop = 0;
        let reloadDrop = 0;

        if (this.phaserScene.weaponSystem) {
          const ws = this.phaserScene.weaponSystem;

          if (ws.isSwitching && ws.switchTimerObj) {
            const progress = ws.switchTimerObj.getProgress(); // 0 to 1
            switchDrop = -1.5 * Math.pow(1 - progress, 2); // Starts low (-1.5) and rises to 0
          }

          if (ws.isReloading && ws.reloadTimer) {
            const p = ws.reloadTimer.getProgress(); // 0 to 1
            // Bring down, then up
            reloadDrop = -0.5 * Math.sin(p * Math.PI);

            // Optional screen shake around middle of reload (p=0.5)
            if (p > 0.45 && p < 0.55 && Math.random() < 0.15) {
              if (this.phaserScene.cameras && this.phaserScene.cameras.main) {
                this.phaserScene.cameras.main.shake(50, 0.0015);
              }
            }
          }
        }

        // Apply recoil visual to the viewModel container (kicks up and back)
        const recoilX = Math.sin(recoilOffset.x * 0.1) * 0.02; // Slight horizontal shake
        const recoilY = -Math.abs(recoilOffset.y) * 0.0005; // Kick up slightly
        // recoilZ must be positive to move TOWARDS the camera (away from the screen)
        const recoilZ = Math.abs(recoilOffset.y) * 0.003;

        let meleeRotX = 0;
        let meleeRotZ = 0;
        if (this.meleeTimer !== undefined && this.meleeTimer > 0) {
          this.meleeTimer -= delta / 1000;
          const progress = 1 - (this.meleeTimer / 0.3); // 0 to 1
          // Swing forward (quick chop)
          const sliceProgress = Math.sin(progress * Math.PI);
          meleeRotX = -sliceProgress * 1.5;
          // Rotate the container to match the exact slash angle calculated in GameplayScene
          meleeRotZ = this.meleeTheta !== undefined ? this.meleeTheta : 0;
        }

        // Animate the container, leaving the base model position alone!
        this.viewModel.position.set(bobX + recoilX, bobY - recoilY + switchDrop + reloadDrop, recoilZ);
        // Tilt the barrel upwards when firing (negative X rotation)
        this.viewModel.rotation.x = (recoilOffset.y * 0.0015) + meleeRotX;
        this.viewModel.rotation.z = meleeRotZ;

      }
    }

    // ─── Parkour Obstacles Update ───────────────────
    if (this.parkourObstacles) {
      for (let i = this.parkourObstacles.length - 1; i >= 0; i--) {
        const obs = this.parkourObstacles[i];

        if (obs.type === 'cone') {
          if (obs.phase === 'warning') {
            obs.timer -= delta / 1000;
            // Blink warning circle
            obs.warning.material.opacity = 0.5 + 0.5 * Math.sin(this._time * 0.02);
            if (obs.timer <= 0) {
              obs.phase = 'launch';
              obs.velocity.y = 15; // Shoot up
              this.scene.remove(obs.warning);
            }
          } else {
            obs.mesh.position.addScaledVector(obs.velocity, delta / 1000);
            obs.life -= delta / 1000;
          }
        } else {
          // Rectangle or Triangle or Forward Cone: move
          if (obs.startupDelay > 0) {
            obs.startupDelay -= delta / 1000;
          } else {
            if (obs.currentSpeed === undefined) obs.currentSpeed = 0;
            obs.currentSpeed = Math.min(1, obs.currentSpeed + (delta / 1000) * 4); // Accelerate from 0 to 1 over 0.25s

            const vel = obs.velocity.clone().multiplyScalar(obs.currentSpeed);
            obs.mesh.position.addScaledVector(vel, delta / 1000);
            obs.life -= delta / 1000;

            // Massive rocket engine effect (wide fiery particle trail)
            for (let p = 0; p < 2; p++) {
              // Massive fire particles
              const size = 1.2 + Math.random() * 1.5;
              const fireGeo = new THREE.BoxGeometry(size, size, size);
              const fireMat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff4400 : 0xffcc00 });
              const fireMesh = new THREE.Mesh(fireGeo, fireMat);
              fireMesh.position.copy(obs.mesh.position);

              // push particles backwards along trajectory
              const pushBack = vel.clone().normalize().negate().multiplyScalar(1.0);
              fireMesh.position.add(pushBack);

              // Give them a wide spread (perpendicular to travel)
              const spread = 6.0;
              const effectVel = new THREE.Vector3(
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread,
                (Math.random() - 0.5) * spread
              );

              this.scene.add(fireMesh);
              this.effects.push({ mesh: fireMesh, velocity: effectVel, life: 350, maxLife: 350, type: 'spark' });
            }
          }
        }

        // Update Hitbox
        obs.hitbox.setFromObject(obs.mesh);

        // Collision detection with Gunner (camera)
        if (obs.active && obs.phase !== 'warning') {
          // Create a rough hitbox for the gunner based on their position
          const gunnerBox = new THREE.Box3();

          let p;
          let bodyHeight;
          if (this.role === 'gunner') {
            p = this.camera.position;
            bodyHeight = this.baseCameraY + 0.6;
          } else {
            // AI Gunner position (fixed at X=5, Y=10, Z=41, matching standard gunner spawn)
            p = new THREE.Vector3(5, 10, 41);
            bodyHeight = 10.6;
          }

          gunnerBox.min.set(p.x - 0.5, p.y - bodyHeight, p.z - 0.5);
          gunnerBox.max.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);

          if (obs.hitbox.intersectsBox(gunnerBox)) {
            // Hit! Damage Gunner
            if (this.phaserScene.bridge && this.phaserScene.bridge.damageGunner) {
              const dmg = Math.floor(Math.random() * 26) + 35; // 35 to 60 damage
              this.phaserScene.bridge.damageGunner(dmg);
            }
            // Add some screen shake
            if (this.phaserScene.cameras && this.phaserScene.cameras.main) {
              this.phaserScene.cameras.main.shake(200, 0.02);
            }
            obs.active = false; // Prevent multiple hits
            obs.life = 0; // Destroy it
          }
        }

        // Cleanup
        if (obs.life <= 0) {
          this.scene.remove(obs.mesh);
          if (obs.warning) this.scene.remove(obs.warning);
          this.parkourObstacles.splice(i, 1);
        }
      }
    }

    // ─── Visual Effects Update ──────────────────────
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= delta;

      if (fx.type === 'tracer') {
        fx.mesh.position.addScaledVector(fx.velocity, delta / 1000);
        fx.mesh.material.opacity = (fx.life / fx.maxLife) * 0.9;
      } else if (fx.type === 'grenade') {
        const p = 1 - (fx.life / fx.maxLife);
        fx.mesh.scale.setScalar(1 + p * 3);
        fx.mesh.material.opacity = (fx.life / fx.maxLife) * 0.8;
      } else if (fx.type === 'smoke') {
        // Smoke slowly expands and drifts up
        fx.mesh.position.y += (delta / 1000) * 1.5;
        fx.mesh.scale.setScalar(1 + (1 - fx.life / fx.maxLife) * 0.5);
        if (fx.life < 1000) fx.mesh.material.opacity = (fx.life / 1000) * 0.6; // fade out at end
      } else if (fx.type === 'spark') {
        fx.mesh.position.addScaledVector(fx.velocity, delta / 1000);
        fx.mesh.scale.setScalar(fx.life / fx.maxLife);
      } else if (fx.type === 'debris') {
        // Physics with gravity and bouncing
        fx.velocity.y -= (25 * delta / 1000);
        fx.mesh.position.addScaledVector(fx.velocity, delta / 1000);

        // Floor is around y = -0.5 in this coordinate system
        if (fx.mesh.position.y < -0.5) {
          fx.mesh.position.y = -0.5;
          fx.velocity.y *= -0.5; // bounce
          fx.velocity.x *= 0.8;  // friction
          fx.velocity.z *= 0.8;
        }
        // Spin based on velocity
        fx.mesh.rotation.x += fx.velocity.z * 0.02;
        fx.mesh.rotation.y += fx.velocity.x * 0.02;

        // Shrink at the very end
        if (fx.life < 300) {
          fx.mesh.scale.setScalar(fx.life / 300);
        }
      } else if (fx.type === 'lightflash') {
        fx.mesh.intensity = (fx.life / fx.maxLife) * 2;
      } else if (fx.type === 'pooledlightflash') {
        fx.light.intensity = (fx.life / fx.maxLife) * 2;
      } else if (fx.type === 'slash') {
        const ratio = fx.life / fx.maxLife;
        // Fade out
        fx.mesh.material.opacity = ratio * 0.9;
        if (fx.mesh.children[0]) {
          fx.mesh.children[0].material.opacity = ratio * 0.6;
        }
        // Slight scale up for dramatic effect
        const scale = 1 + (1 - ratio) * 0.5;
        fx.mesh.scale.set(scale, scale, 1);

        if (fx.life <= 0) {
          if (fx.mesh.children[0]) {
            fx.mesh.children[0].material.dispose();
            fx.mesh.children[0].geometry.dispose();
          }
        }
      } else if (fx.type === 'muzzleflash') {
        fx.mesh.scale.setScalar(fx.life / fx.maxLife);
        fx.mesh.material.opacity = (fx.life / fx.maxLife) * 0.9;
        if (fx.light) fx.light.intensity = (fx.life / fx.maxLife) * 2;
      }

      if (fx.life <= 0) {
        if (fx.type === 'pooledlightflash') {
          fx.light.intensity = 0; // Just turn it off, leave in scene
        } else {
          if (fx.mesh.isLight) {
            fx.mesh.dispose();
          } else {
            if (fx.mesh.material) fx.mesh.material.dispose();
            if (fx.mesh.geometry) fx.mesh.geometry.dispose();
            if (fx.mesh.parent) fx.mesh.parent.remove(fx.mesh);
            else this.scene.remove(fx.mesh);
          }

          if (fx.light) {
            if (fx.light.parent) fx.light.parent.remove(fx.light);
            fx.light.dispose();
          }
        }

        this.effects.splice(i, 1);
      }
    }

    // ─── Projectiles (Grenades/Flashbangs) ──────────
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= delta;

      // Gravity
      p.velocity.y -= (35 * (delta / 1000));

      p.mesh.position.addScaledVector(p.velocity, delta / 1000);

      // Spin the projectile
      p.mesh.rotation.x += 10 * (delta / 1000);
      p.mesh.rotation.z += 8 * (delta / 1000);

      // Collision with board (Z <= 0.5) OR floor (Y <= -0.5)
      if (p.mesh.position.z <= 0.5 || p.mesh.position.y <= -0.5) {
        if (p.type === 'flashbang') {
          // Bounce off floor/walls instead of exploding instantly
          if (p.mesh.position.y <= -0.5) {
            p.mesh.position.y = -0.5;
            p.velocity.y *= -0.5; // bounce vertical
            p.velocity.x *= 0.8; // friction
            p.velocity.z *= 0.8;
          }
          if (p.mesh.position.z <= 0.5) {
            p.mesh.position.z = 0.5;
            p.velocity.z *= -0.5; // bounce off board
            p.velocity.x *= 0.8;
            p.velocity.y *= 0.8;
          }
        } else {
          // Normal projectiles detonate on impact
          const hitCol = Math.round(p.mesh.position.x);
          let hitRow = 0;
          if (p.mesh.position.z <= 0.5) {
            hitRow = TETRIS_ROWS - 1 - Math.round(p.mesh.position.y);
          }
          if (p.onLandCallback) p.onLandCallback(hitCol, hitRow, p.mesh.position.clone());
          this.scene.remove(p.mesh);
          this.projectiles.splice(i, 1);
          continue;
        }
      }

      // Detonate on timer
      if (p.life <= 0) {
        if (p.type === 'flashbang' && p.onLandCallback) {
          const hitCol = Math.round(p.mesh.position.x);
          let hitRow = Math.max(0, TETRIS_ROWS - 1 - Math.round(p.mesh.position.y));
          p.onLandCallback(hitCol, hitRow, p.mesh.position.clone());
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // ─── Sync blocks ────────────────────────────────
    const activeKeys = new Set();

    // Locked blocks
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.grid[r][c];
        if (cell) {
          const key = `L_${r}_${c}`;
          const hpRatio = cell.hp / cell.maxHp;
          this._updateCube(key, c, board.rows - 1 - r, 0, cell.color, hpRatio, cell.iron);
          activeKeys.add(key);

          // Shield aura on individual locked blocks
          if (cell.shieldHp > 0) {
            const shieldKey = `SH_${r}_${c}`;
            this._updateShieldAura(shieldKey, c, board.rows - 1 - r, 0);
            activeKeys.add(shieldKey);
          }
        }
      }
    }

    // Falling piece
    if (board.currentPiece && !board.isGameOver) {
      const shape = board.getShape();
      const color = PIECE_COLORS[board.currentPiece];
      const dmg = board._fallingDamage || {};

      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const cellHp = dmg[`${r}_${c}`] !== undefined ? dmg[`${r}_${c}`] : 100;
            if (cellHp <= 0) continue;

            const tr = board.pieceRow + r;
            const tc = board.pieceCol + c;
            const key = `F_${r}_${c}`;
            this._updateCube(key, tc, board.rows - 1 - tr, 0, color, cellHp / 100, board.ironBodyActive);
            activeKeys.add(key);

            // Shield aura on falling piece
            if (board.pieceShieldHP > 0) {
              const shieldKey = `SF_${r}_${c}`;
              this._updateShieldAura(shieldKey, tc, board.rows - 1 - tr, 0);
              activeKeys.add(shieldKey);
            }
          }
        }
      }

      // Ghost piece
      if (board.ghostRow !== undefined) {
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
              const cellHp = dmg[`${r}_${c}`] !== undefined ? dmg[`${r}_${c}`] : 100;
              if (cellHp <= 0) continue;

              const gr = board.ghostRow + r;
              const gc = board.pieceCol + c;
              const key = `G_${r}_${c}`;
              this._updateGhost(key, gc, board.rows - 1 - gr, 0, board.ironBodyActive);
              activeKeys.add(key);
            }
          }
        }
      }
    }

    // ─── Iron Body overlay ──────────────────────────
    this._updateIronBodyOverlay(board.ironBodyActive);

    // ─── Remove stale meshes ────────────────────────
    for (const [key, obj] of this.cubes.entries()) {
      if (!activeKeys.has(key)) {
        if (obj.mesh) this.scene.remove(obj.mesh);
        if (obj.edge) this.scene.remove(obj.edge);
        this.cubes.delete(key);
      }
    }

    // ─── Render ─────────────────────────────────────
    if (this.characterGroup) {
      if (this.role === 'gunner') {
        this.characterGroup.position.set(this.camera.position.x, this.camera.position.y - 0.8, this.camera.position.z);
        this.characterGroup.rotation.y = this.camera.rotation.y + Math.PI; // model faces +Z, we look -Z

        if (this.armR && this.armL) {
          this.armR.rotation.x = -this.camera.rotation.x;
          this.armL.rotation.x = -this.camera.rotation.x;
        }

        if (this.legR && this.legL) {
          if (this.isCrouching) {
            this.legR.scale.y = 0.5;
            this.legL.scale.y = 0.5;
            this.legR.position.y = -0.35;
            this.legL.position.y = -0.35;
          } else {
            this.legR.scale.y = 1.0;
            this.legL.scale.y = 1.0;
            this.legR.position.y = -0.65;
            this.legL.position.y = -0.65;
          }
        }

        if (this.isThirdPerson) {
          const offset = new THREE.Vector3(0, 1.5, 4.5);
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camera.rotation.y);
          this.thirdPersonCamera.position.copy(this.camera.position).add(offset);

          // Look far ahead where the player is aiming, so the crosshair matches
          const aimPoint = new THREE.Vector3(0, 0, -500);
          aimPoint.applyEuler(this.camera.rotation);
          aimPoint.add(this.camera.position);
          this.thirdPersonCamera.lookAt(aimPoint);
        }
      } else {
        this.characterGroup.position.set(5, 9.2, 41);
        this.characterGroup.rotation.y = Math.PI; // face the board
      }
    }

    if (this.isThirdPerson) {
      this.renderer.render(this.scene, this.thirdPersonCamera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ─── Cube Management ──────────────────────────────────
  _updateCube(key, x, y, z, colorNum, hpRatio, isIron) {
    let obj = this.cubes.get(key);
    const mat = this.getMaterial(colorNum, hpRatio, isIron);
    const edgeMat = this.getEdgeMaterial(isIron ? 0xaabbcc : colorNum, hpRatio);

    if (!obj) {
      const mesh = new THREE.Mesh(this.cubeGeo, mat);
      const edge = new THREE.LineSegments(this.edgeGeo, edgeMat);
      this.scene.add(mesh);
      this.scene.add(edge);
      obj = { mesh, edge };
      this.cubes.set(key, obj);
    } else {
      obj.mesh.material = mat;
      obj.edge.material = edgeMat;
    }

    // Full size always
    obj.mesh.scale.set(1, 1, 1);
    obj.edge.scale.set(1, 1, 1);

    obj.mesh.position.set(x, y, z);
    obj.edge.position.set(x, y, z);
  }

  _updateGhost(key, x, y, z, isIron = false) {
    let obj = this.cubes.get(key);
    if (!obj) {
      const mesh = new THREE.Mesh(this.cubeGeo, this.ghostMaterial);
      this.scene.add(mesh);
      obj = { mesh, edge: null };
      this.cubes.set(key, obj);
    }

    if (isIron) {
      if (!this.ghostIronMaterial) {
        this.ghostIronMaterial = this.ghostMaterial.clone();
        this.ghostIronMaterial.color.setHex(0xcccccc);
        this.ghostIronMaterial.metalness = 1.0;
        this.ghostIronMaterial.emissive.setHex(0x8899aa);
        this.ghostIronMaterial.emissiveIntensity = 0.15;
      }
      obj.mesh.material = this.ghostIronMaterial;
    } else {
      obj.mesh.material = this.ghostMaterial;
    }

    obj.mesh.scale.set(1, 1, 1);
    obj.mesh.position.set(x, y, z);
  }

  _updateShieldAura(key, x, y, z) {
    let obj = this.cubes.get(key);
    if (!obj) {
      const shieldGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
      const mesh = new THREE.Mesh(shieldGeo, this.shieldMaterial.clone());
      this.scene.add(mesh);
      obj = { mesh, edge: null };
      this.cubes.set(key, obj);
    }
    // Pulse effect
    const pulse = 0.2 + 0.15 * Math.sin(this._time * 0.005);
    obj.mesh.material.opacity = pulse;
    obj.mesh.material.emissiveIntensity = 0.3 + 0.3 * Math.sin(this._time * 0.005);
    obj.mesh.position.set(x, y, z);
  }

  // ─── Iron Body Overlay ────────────────────────────────
  _updateIronBodyOverlay(active) {
    if (active) {
      if (!this._ironLight) {
        this._ironLight = new THREE.PointLight(0xffaa00, 0.8, 30);
        this._ironLight.position.set(TETRIS_COLS / 2, TETRIS_ROWS / 2, 5);
        this.scene.add(this._ironLight);
      }
      // Pulse the iron light
      this._ironLight.intensity = 0.5 + 0.4 * Math.sin(this._time * 0.003);
    } else {
      if (this._ironLight) {
        this.scene.remove(this._ironLight);
        this._ironLight = null;
      }
    }
  }

  // ─── Raycasting (CS:GO style spray control)
  shootRaycast(recoilOffset = { x: 0, y: 0 }) {
    // Aim Punch: Bullets land above the physical crosshair when spraying
    const aimPunchScalar = 0.0024; // This handles the remaining recoil not applied to the camera

    // In NDC, +Y is UP, +X is RIGHT. Recoil Y is usually negative (meaning UP in 2D space)
    const ndcX = recoilOffset.x * aimPunchScalar;
    const ndcY = -recoilOffset.y * aimPunchScalar;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    // Collect all block meshes (not ghosts, shields, edges)
    const meshes = [];
    for (const [key, obj] of this.cubes.entries()) {
      if (key.startsWith('L_') || key.startsWith('F_')) {
        if (obj.mesh) meshes.push(obj.mesh);
      }
    }
    if (this.parkourObstacles) {
      for (const obs of this.parkourObstacles) {
        if (obs.mesh) meshes.push(obs.mesh);
      }
    }

    const intersects = this.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const hitPoint = intersects[0].point;
      const hitNormal = intersects[0].face ? intersects[0].face.normal : new THREE.Vector3(0, 0, 1);

      // Find the key for this mesh
      for (const [key, obj] of this.cubes.entries()) {
        if (obj.mesh === hitMesh) {
          // Parse key to get row/col
          const parts = key.split('_');
          if (parts[0] === 'L') {
            return { r: parseInt(parts[1]), c: parseInt(parts[2]), point: hitPoint, normal: hitNormal, mesh: hitMesh };
          } else if (parts[0] === 'F') {
            // Falling piece — need to convert local coords to board coords
            const board = this.phaserScene.tetrisBoard;
            if (board) {
              const localR = parseInt(parts[1]);
              const localC = parseInt(parts[2]);
              return { r: board.pieceRow + localR, c: board.pieceCol + localC, point: hitPoint, normal: hitNormal, mesh: hitMesh };
            }
          }
        }
      }

      // Check obstacles
      if (this.parkourObstacles) {
        for (const obs of this.parkourObstacles) {
          if (obs.mesh === hitMesh || hitMesh.parent === obs.mesh) {
            return { r: -1, c: -1, point: hitPoint, normal: hitNormal, mesh: hitMesh, isObstacle: true };
          }
        }
      }
    }

    // If we missed, return a point far in the distance along the ray
    const farPoint = new THREE.Vector3();
    this.raycaster.ray.at(100, farPoint);
    return { r: -1, c: -1, point: farPoint };
  }

  // ─── Parkour Mechanics ─────────────────────────────────
  spawnParkourObstacle(type, difficulty = 1) {

    // Difficulty increases speed exponentially, similar to Tetris gravity scaling
    const speedMult = Math.pow(1.15, Math.max(0, difficulty - 1));

    let mesh, hitbox, obstacleObj;

    if (type === 1) {
      // 1. Rectangle (Horizontal Beam)
      const isHigh = this._lastRectWasHigh === undefined ? Math.random() > 0.5 : !this._lastRectWasHigh;
      this._lastRectWasHigh = isHigh;
      const yPos = isHigh ? 10 : 1.0;

      // Reverted to previous size
      const geo = new THREE.BoxGeometry(30, 1.5, 2);
      const mat = new THREE.MeshStandardMaterial({
        color: isHigh ? 0xff8800 : 0x0088ff,
        emissive: isHigh ? 0xff4400 : 0x0044ff,
        emissiveIntensity: 0.5
      });
      mesh = new THREE.Mesh(geo, mat);

      // Pick distinctly left or right side to ensure a clear dodge path, instead of random middle placements
      const isLeft = Math.random() > 0.5;

      // Arena X is roughly -15 to +25 (width ~40).
      const targetX = isLeft ? -5 : 15;
      mesh.position.set(targetX, yPos, -100); // Spawning FAR behind the arena no matter what

      obstacleObj = {
        mesh: mesh,
        type: 'rectangle',
        velocity: new THREE.Vector3(0, 0, 75 * speedMult), // Faster to cover the -100 distance
        hitbox: new THREE.Box3(),
        life: 10,
        active: true,
        startupDelay: 0.5
      };
    }
    else if (type === 2) {
      // 2. Triangle3D -> Thin Vertical Blade
      // Reverted to previous size
      const geo = new THREE.BoxGeometry(1.5, 15, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0x880022, emissiveIntensity: 0.5 });
      mesh = new THREE.Mesh(geo, mat);

      // Reverted to -40 -> Pushed to -100 as requested
      const spawnZ = -100;
      const distanceZ = this.camera.position.z - spawnZ;

      // Spawn angle: between 20 and 35 degrees left or right
      const fromLeft = Math.random() > 0.5;
      const minAngle = 20 * (Math.PI / 180);
      const maxAngle = 35 * (Math.PI / 180);
      let angle = THREE.MathUtils.randFloat(minAngle, maxAngle);
      if (fromLeft) angle = -angle;

      // Calculate X based on the Z distance and angle
      const offsetX = Math.tan(angle) * distanceZ;
      const startX = this.camera.position.x + offsetX;

      mesh.position.set(startX, 7.5, spawnZ);

      // Travel exactly from spawn to the player (or AI Gunner)
      let targetPos;
      if (this.role === 'gunner') {
        targetPos = this.camera.position.clone();
      } else {
        targetPos = new THREE.Vector3(5, 10, 41); // AI Gunner target
      }
      const dirVec = new THREE.Vector3(targetPos.x - startX, 0, targetPos.z - spawnZ).normalize();

      // Add a slight random variance (+/- 5 degrees) so it's not perfectly homing
      const slightVariance = (Math.random() - 0.5) * (10 * Math.PI / 180);
      dirVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), slightVariance);

      const moveVec = dirVec.multiplyScalar(75 * speedMult); // Faster to cover the -100 distance
      mesh.rotation.y = Math.atan2(moveVec.x, moveVec.z);

      obstacleObj = {
        mesh: mesh,
        type: 'triangle',
        velocity: moveVec,
        hitbox: new THREE.Box3(),
        life: 10,
        active: true,
        startupDelay: 0.5
      };
    }
    else if (type === 3) {
      // 3. Cone (Forward Homing Rocket)
      // Reverted to standard size
      const geo = new THREE.ConeGeometry(2.66, 5.33, 8);
      geo.rotateX(Math.PI / 2); // point forward
      const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88, emissive: 0x00aa44, emissiveIntensity: 0.5 });
      mesh = new THREE.Mesh(geo, mat);

      // Spawn in front of the player at a random wide X area
      const targetX = THREE.MathUtils.randFloat(-15, 25);
      const startZ = -100; // Spawns VERY deep behind the Tetris board because it travels so fast

      mesh.position.set(targetX, 0.5, startZ); // slightly above floor

      // Aim at player (or AI Gunner)
      let playerPos;
      if (this.role === 'gunner') {
        playerPos = this.camera.position.clone();
      } else {
        playerPos = new THREE.Vector3(5, 10, 41);
      }
      playerPos.y -= 1; // aim at body

      const dirVec = new THREE.Vector3().subVectors(playerPos, mesh.position).normalize();

      // Slight random variance (15 degrees) so it can come diagonally
      const slightVariance = (Math.random() - 0.5) * (15 * Math.PI / 180);
      dirVec.applyAxisAngle(new THREE.Vector3(0, 1, 0), slightVariance);

      // Massively increased base speed for the cone!
      const moveVec = dirVec.multiplyScalar(75 * speedMult);

      // Face the direction of travel
      mesh.rotation.y = Math.atan2(moveVec.x, moveVec.z);

      obstacleObj = {
        mesh: mesh,
        type: 'forward_cone', // No longer uses warning phase logic
        velocity: moveVec,
        hitbox: new THREE.Box3(),
        life: 10,
        active: true,
        startupDelay: 1.0
      };
    }

    if (mesh) {
      this.scene.add(mesh);
      this.parkourObstacles.push(obstacleObj);
    }
  }

  // ─── 3D Visual Effects ─────────────────────────────────
  spawnTracer(targetPoint, color = 0xffe259) {
    // Start position: slightly below and to the right of the camera
    const startPoint = this.camera.position.clone();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(this.camera.quaternion);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    // Offset to simulate gun barrel (further offset so it's visible in perspective and aligns with the weapon model)
    startPoint.addScaledVector(right, 0.25);
    startPoint.addScaledVector(down, 0.2);
    startPoint.addScaledVector(forward, 0.5);

    const distance = startPoint.distanceTo(targetPoint);
    const dir = new THREE.Vector3().subVectors(targetPoint, startPoint).normalize();

    // Create a short tracer bolt (length 3, or distance if closer)
    const tracerLength = Math.min(3, distance);
    const geo = new THREE.CylinderGeometry(0.04, 0.04, tracerLength, 4);
    geo.translate(0, tracerLength / 2, 0);
    // Rotate +Y to -Z so the lookAt function points the tip at the target!
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(startPoint);
    mesh.lookAt(targetPoint);

    this.scene.add(mesh);

    // Calculate velocity so it reaches the target in ~150ms
    const travelTime = 150; // ms
    const speed = distance / (travelTime / 1000);
    const velocity = dir.multiplyScalar(speed);

    this.effects.push({ mesh, velocity, life: travelTime, maxLife: travelTime, type: 'tracer' });
  }

  triggerMeleeAnimation() {
    this.meleeTimer = 0.3; // 300ms swing duration
  }

  spawnMeleeSlash(point, normal, theta) {
    const len = 4.0; // Slash length
    const thick = 0.3; // Slash thickness

    // Core white slash
    const geo = new THREE.PlaneGeometry(len, thick);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Outer glow
    const glowGeo = new THREE.PlaneGeometry(len * 1.2, thick * 3);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff0044,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glowMesh);

    // Position it slightly off the block surface to avoid z-fighting
    mesh.position.copy(point).add(normal.clone().multiplyScalar(0.05));

    // Align with normal
    mesh.lookAt(mesh.position.clone().add(normal));

    // Rotate it along its own Z axis by theta
    mesh.rotateZ(theta);

    this.scene.add(mesh);
    this.effects.push({ mesh, life: 250, maxLife: 250, type: 'slash' });
  }

  spawnMuzzleFlash(weaponKey) {
    if (!this.viewModel || weaponKey === 'knife') return;

    // Create a bright flash mesh
    const flashGeo = new THREE.PlaneGeometry(0.8, 0.8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const flashMesh = new THREE.Mesh(flashGeo, flashMat);

    // Position at the end of the barrel
    if (weaponKey === 'deagle') {
      flashMesh.position.set(0.18, -0.05, -0.7);
    } else {
      flashMesh.position.set(0.18, -0.05, -0.9); // AK47
    }
    // Random rotation for variation
    flashMesh.rotation.z = Math.random() * Math.PI;

    this.viewModel.add(flashMesh);

    // Also add a PointLight
    const flashLight = new THREE.PointLight(0xffddaa, 4, 10);
    flashLight.position.copy(flashMesh.position);
    this.viewModel.add(flashLight);

    // Muzzle flash effect object
    const effect = {
      life: 60,
      maxLife: 60,
      type: 'muzzleflash',
      mesh: flashMesh,
      light: flashLight
    };

    // Add to effects array for cleanup
    this.effects.push(effect);
  }

  spawnBulletImpact(point, normal, hitMesh) {
    if (!this._impactGeo) {
      this._impactGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      this._impactMat1 = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
      this._impactMat2 = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    }

    // 0. Use pooled light to avoid lag (shader recompile)
    if (this.impactLights && this.impactLights.length > 0) {
      const light = this.impactLights[this.impactLightIdx];
      this.impactLightIdx = (this.impactLightIdx + 1) % this.impactLights.length;
      light.position.copy(point);
      light.position.z += 0.5;
      light.intensity = 2; // Initial bright flash
      this.effects.push({ light: light, life: 100, maxLife: 100, type: 'pooledlightflash' });
    }

    // 0.5. Add scorch mark decal (bullet hole)
    if (this.scorches && this.scorches.length > 0 && normal && hitMesh) {
      const scorch = this.scorches[this.scorchIdx];
      this.scorchIdx = (this.scorchIdx + 1) % this.scorches.length;

      // Detach from previous parent if any
      if (scorch.parent) scorch.parent.remove(scorch);

      // Attach to the hit block so it moves and dies with it
      hitMesh.add(scorch);

      // Convert world hit point to local coordinates of the block
      scorch.position.copy(point).sub(hitMesh.position);
      // Nudge forward along the normal to prevent z-fighting
      scorch.position.addScaledVector(normal, 0.02);

      // Orient scorch to face the normal (relative to parent)
      const lookAtTarget = scorch.position.clone().add(normal);
      scorch.lookAt(lookAtTarget);
      scorch.rotation.z = Math.random() * Math.PI * 2;

      const scale = 0.5 + Math.random() * 0.5;
      scorch.scale.set(scale, scale, 1);
      scorch.visible = true;
    }

    // 1. Dramatic splash of particles
    for (let i = 0; i < 8; i++) {
      const mat = Math.random() > 0.5 ? this._impactMat1 : this._impactMat2;
      const mesh = new THREE.Mesh(this._impactGeo, mat);

      mesh.position.copy(point);
      mesh.position.z += 0.1;

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        2 + Math.random() * 10
      );

      this.scene.add(mesh);
      this.effects.push({ mesh, velocity, life: 400, maxLife: 400, type: 'spark' });
    }
  }

  spawnBlockDebris(x, y, z, colorHex, count = 5) {
    const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.8,
      metalness: 0.1
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat);

      // Random position inside the block
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.8,
        y + (Math.random() - 0.5) * 0.8,
        z + (Math.random() - 0.5) * 0.8
      );

      // Random rotation
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      // Explosive velocity outwards and upwards
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10 + 5, // Upward bias
        (Math.random() - 0.5) * 10
      );

      this.scene.add(mesh);
      // 'debris' will use the same physics as 'spark' but last longer and have gravity
      this.effects.push({ mesh, velocity, life: 1500 + Math.random() * 500, maxLife: 2000, type: 'debris' });
    }
  }

  spawnGrenadeExplosion(x, y, z, radius = 6) {
    // 1. Intense flash
    const flashLight = new THREE.PointLight(0xffaa00, 10, radius * 3);
    flashLight.position.set(x, y, z);
    this.scene.add(flashLight);
    this.effects.push({ mesh: flashLight, life: 150, maxLife: 150, type: 'lightflash' });

    // 2. High-velocity shrapnel / fire particles
    for (let i = 0; i < 40; i++) {
      const size = 0.2 + Math.random() * 0.4;
      const geo = new THREE.BoxGeometry(size, size, size);
      const color = Math.random() > 0.5 ? 0xff5500 : 0xff2200;
      const mat = new THREE.MeshBasicMaterial({ color: color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);

      // Spherical explosion velocity
      const phi = Math.acos(-1 + (2 * i) / 40);
      const theta = Math.sqrt(40 * Math.PI) * phi;
      const speed = 15 + Math.random() * 15;

      const velocity = new THREE.Vector3(
        speed * Math.cos(theta) * Math.sin(phi),
        speed * Math.cos(phi),
        speed * Math.sin(theta) * Math.sin(phi)
      );

      this.scene.add(mesh);
      this.effects.push({ mesh, velocity, life: 300, maxLife: 300, type: 'spark' });
    }

    // 3. Smoke puffs
    for (let i = 0; i < 15; i++) {
      const geo = new THREE.SphereGeometry(radius * 0.4, 8, 8);
      const mat = new THREE.MeshLambertMaterial({
        color: 0x333333,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(geo, mat);

      const ox = (Math.random() - 0.5) * radius * 1.5;
      const oy = (Math.random() - 0.5) * radius * 1.5;
      const oz = (Math.random() - 0.5) * radius * 1.5;
      mesh.position.set(x + ox, y + oy, z + oz);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      this.scene.add(mesh);
      const life = 1000 + Math.random() * 1000;
      this.effects.push({ mesh, life: life, maxLife: life, type: 'smoke' });
    }
  }

  spawnSmoke(x, y, z, radius = 8) {
    for (let i = 0; i < 20; i++) {
      const sr = radius * 0.8 + Math.random() * radius;
      const geo = new THREE.SphereGeometry(sr, 12, 12);
      const mat = new THREE.MeshLambertMaterial({
        color: 0xe0e0e0, // Light white/grey
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geo, mat);

      const ox = (Math.random() - 0.5) * radius * 2.5;
      const oy = (Math.random() - 0.5) * radius * 2.5;
      const oz = (Math.random() - 0.5) * radius * 2.5;
      mesh.position.set(x + ox, y + oy, z + oz);

      // Random rotation
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      this.scene.add(mesh);
      const life = 1666 + Math.random() * 666;
      this.effects.push({ mesh, life: life, maxLife: life, type: 'smoke' });
    }
  }

  // ─── Projectiles ────────────────────────────────────────
  throwProjectile(type, onLandCallback) {
    if (!this.grenadeModels) {
      if (onLandCallback) {
        // Dummy hit coordinate for the Tetris player
        onLandCallback(Math.floor(Math.random() * 10), Math.floor(Math.random() * 20));
      }
      return;
    }

    const startPos = this.camera.position.clone();
    const forwardDir = new THREE.Vector3();
    this.camera.getWorldDirection(forwardDir);

    // Determine visuals based on type
    let mesh;
    if (this.grenadeModels[type]) {
      // Clone the loaded 3D model
      mesh = this.grenadeModels[type].clone();

      // Set appropriate scaling (MANUAL CONTROL)
      if (type === 'grenade') mesh.scale.set(0.06, 0.06, 0.06);
      if (type === 'flashbang') mesh.scale.set(4.5, 4.5, 4.5);
      if (type === 'smoke') mesh.scale.set(0.001, 0.001, 0.001);
    } else {
      // Fallback if model not loaded
      const geo = type === 'grenade' ? new THREE.BoxGeometry(0.4, 0.4, 0.4) : new THREE.CylinderGeometry(0.15, 0.15, 0.6, 8);
      const color = type === 'grenade' ? 0xff4400 : 0xffffff;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
      mesh = new THREE.Mesh(geo, mat);
    }

    // Spawn at camera position
    mesh.position.copy(startPos);
    // Push slightly forward so it doesn't clip the camera
    mesh.position.addScaledVector(forwardDir, 1.5);

    if (type === 'flashbang') {
      mesh.rotation.x = Math.PI / 2;
    }

    this.scene.add(mesh);

    // Calculate throwing velocity (add player's current velocity to it!)
    const velocity = forwardDir.clone().multiplyScalar(30); // Base forward throw speed

    if (this.gunnerVelocity) {
      // gunnerVelocity is in units per 16.6ms frame, while projectile velocity is in units per second.
      // Multiply by 60 to correctly inherit the player's momentum.
      velocity.x += this.gunnerVelocity.x * 60;
      velocity.z += this.gunnerVelocity.z * 60;
      if (this.gunnerVelocityY) {
        velocity.y += this.gunnerVelocityY * 60;
      }
    }

    velocity.y += 12; // Arcing upwards

    this.projectiles.push({
      type,
      mesh,
      velocity,
      onLandCallback,
      life: type === 'flashbang' ? 2000 : 5000 // Flashbang has 3s fuse, others 5s despawn
    });
  }

  // ─── Update Mouse Look (FPS PointerLock) ──────────────
  applyMouseMovement(movementX, movementY) {
    if (this.role === 'gunner') {
      const sensitivity = 0.002;
      this.yaw -= movementX * sensitivity;
      this.pitch -= movementY * sensitivity;

      // Clamp pitch to look straight up or down (avoid flipping)
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
    }
  }

  // ─── Utility Methods ───────────────────────────────────
  _handleResize() {
    const aspect = GAME_WIDTH / GAME_HEIGHT;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // Keep internal resolution fixed, CSS handles scaling
    if (this._syncCanvasSize) {
      this._syncCanvasSize();
    }
  }

  // ─── Cleanup ──────────────────────────────────────────
  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Remove all meshes and free memory
    for (const [key, obj] of this.cubes.entries()) {
      if (obj.mesh) {
        if (obj.mesh.material) obj.mesh.material.dispose();
        if (obj.mesh.geometry) obj.mesh.geometry.dispose();
        this.scene.remove(obj.mesh);
      }
      if (obj.edge) {
        if (obj.edge.material) obj.edge.material.dispose();
        if (obj.edge.geometry) obj.edge.geometry.dispose();
        this.scene.remove(obj.edge);
      }
    }
    this.cubes.clear();

    // Remove iron light
    if (this._ironLight) this.scene.remove(this._ironLight);

    // Dispose renderer
    this.renderer.dispose();

    // Remove DOM element
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
