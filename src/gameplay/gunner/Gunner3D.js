import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { TETRIS_ROWS, TETRIS_COLS, PIECE_COLORS } from '../../config/constants.js';

export default class Gunner3D {
  constructor(scene) {
    this.phaserScene = scene;
    this.isActive = false;

    // Create container for Three.js
    this.container = document.createElement('div');
    this.container.id = 'three-container';
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.zIndex = '0'; 
    document.getElementById('game-container').insertBefore(this.container, document.getElementById('game-container').firstChild);

    // Force Phaser canvas to render on top of the 3D container
    this.phaserScene.game.canvas.style.position = 'relative';
    this.phaserScene.game.canvas.style.zIndex = '1';

    // Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);
    this.scene.fog = new THREE.FogExp2(0x050810, 0.015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(TETRIS_COLS / 2, TETRIS_ROWS / 2, 15);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    // Controls (PointerLock for FPS view)
    this.controls = new PointerLockControls(this.camera, this.phaserScene.game.canvas);
    
    // Recoil state
    this.recoilPitch = 0;
    this.recoilYaw = 0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 20, 20);
    this.scene.add(dirLight);

    // Board Frame (optional visual)
    const frameGeo = new THREE.BoxGeometry(TETRIS_COLS + 0.2, TETRIS_ROWS + 0.2, 0.5);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x334455, wireframe: true });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(TETRIS_COLS/2 - 0.5, TETRIS_ROWS/2 - 0.5, -0.5);
    this.scene.add(frame);

    // Block meshes cache
    this.cubes = new Map();
    this.cubeGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    this.materials = {};

    window.addEventListener('resize', this.onResize.bind(this));
  }

  getMaterial(colorNum) {
    if (!this.materials[colorNum]) {
      this.materials[colorNum] = new THREE.MeshStandardMaterial({
        color: colorNum,
        roughness: 0.2,
        metalness: 0.8,
        emissive: colorNum,
        emissiveIntensity: 0.2
      });
    }
    return this.materials[colorNum];
  }

  activate() {
    this.isActive = true;
    this.container.style.display = 'block';
  }

  deactivate() {
    this.isActive = false;
    this.container.style.display = 'none';
    this.controls.unlock();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  lockPointer() {
    this.controls.lock();
  }

  applyRecoil(rx, ry) {
    // Kicks the camera pitch and yaw
    // In Three.js, looking up means pitch > 0.
    // Recoil Y from 2D was negative (up). So we convert it to positive pitch kick.
    this.recoilPitch += ry * 0.001; 
    this.recoilYaw += rx * 0.001;
  }

  update(delta, tetrisBoard) {
    if (!this.isActive) return;

    // Handle recoil decay
    if (this.recoilPitch > 0) {
      this.recoilPitch = Math.max(0, this.recoilPitch - delta * 0.005);
      // We manually adjust the controls' pitch
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(this.camera.quaternion);
      euler.x += this.recoilPitch;
      euler.y += this.recoilYaw;
      this.camera.quaternion.setFromEuler(euler);
      this.recoilYaw *= 0.8; // Decay yaw faster
    }

    const activeKeys = new Set();

    // Render locked blocks
    for (let r = 0; r < tetrisBoard.rows; r++) {
      for (let c = 0; c < tetrisBoard.cols; c++) {
        const cell = tetrisBoard.grid[r][c];
        if (cell) {
          const key = `L_${r}_${c}`;
          this.updateCube(key, c, tetrisBoard.rows - 1 - r, cell.color, cell.hp / cell.maxHp);
          activeKeys.add(key);
        }
      }
    }

    // Render falling piece
    if (tetrisBoard.currentPiece && !tetrisBoard.isGameOver) {
      const shape = tetrisBoard.getShape();
      const color = PIECE_COLORS[tetrisBoard.currentPiece];
      const dmg = tetrisBoard._fallingDamage || {};

      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const cellHp = dmg[`${r}_${c}`] !== undefined ? dmg[`${r}_${c}`] : 100;
            if (cellHp <= 0) continue;
            
            const tr = tetrisBoard.pieceRow + r;
            const tc = tetrisBoard.pieceCol + c;
            const key = `F_${r}_${c}`;
            
            this.updateCube(key, tc, tetrisBoard.rows - 1 - tr, color, cellHp / 100);
            activeKeys.add(key);
          }
        }
      }
    }

    // Remove old meshes
    for (const [key, mesh] of this.cubes.entries()) {
      if (!activeKeys.has(key)) {
        this.scene.remove(mesh);
        this.cubes.delete(key);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateCube(key, x, y, color, hpRatio) {
    let mesh = this.cubes.get(key);
    if (!mesh) {
      mesh = new THREE.Mesh(this.cubeGeo, this.getMaterial(color));
      this.scene.add(mesh);
      this.cubes.set(key, mesh);
    }
    
    // Scale down if damaged
    const scale = 0.5 + 0.5 * Math.max(0.1, hpRatio);
    mesh.scale.set(scale, scale, scale);
    
    // Set material (handle iron body or shield coloring here if needed)
    mesh.material = this.getMaterial(color);
    
    // Position
    mesh.position.set(x, y, 0);
  }

  // Returns { r, c } or null
  shootRaycast() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera); // Shoot from exact center of screen

    const intersects = raycaster.intersectObjects(Array.from(this.cubes.values()));
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      
      // We can deduce the grid row/col from the mesh position
      const hitC = Math.round(hitMesh.position.x);
      const hitR = TETRIS_ROWS - 1 - Math.round(hitMesh.position.y);
      
      return { r: hitR, c: hitC, intersectPoint: intersects[0].point };
    }
    return null;
  }
}
