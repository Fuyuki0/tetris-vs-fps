import Phaser from 'phaser';
import { TETRIS_ROWS, TETRIS_COLS, PIECE_COLORS, GAME_WIDTH, GAME_HEIGHT } from '../../config/constants.js';

export default class DoomRenderer {
  constructor(scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(5); // Render above background, below HUD

    // 3D Camera (Y is up, Z is depth)
    this.camera = { x: TETRIS_COLS / 2, y: TETRIS_ROWS / 2, z: -15, pitch: 0, yaw: 0 };
    
    // WASD Controls
    this.keys = scene.input.keyboard.addKeys('W,A,S,D');

    this.hitPolygons = []; // To store 2D hitboxes for mouse shooting
  }

  update(delta, board, recoilOffset) {
    // 1. WASD Movement
    const speed = 0.015 * delta;
    if (this.keys.W.isDown) this.camera.z += speed;
    if (this.keys.S.isDown) this.camera.z -= speed;
    if (this.keys.A.isDown) this.camera.x -= speed;
    if (this.keys.D.isDown) this.camera.x += speed;

    // Clamp camera so they don't walk through the board or go too far
    this.camera.z = Phaser.Math.Clamp(this.camera.z, -30, -2);
    this.camera.x = Phaser.Math.Clamp(this.camera.x, -5, TETRIS_COLS + 5);
    this.camera.y = Phaser.Math.Clamp(this.camera.y, 0, TETRIS_ROWS);

    // Apply visual recoil to pitch
    // recoilOffset.y is negative when shooting (up)
    const currentPitch = this.camera.pitch + (recoilOffset ? recoilOffset.y * 0.002 : 0);
    const currentYaw = this.camera.yaw + (recoilOffset ? recoilOffset.x * 0.002 : 0);

    this.graphics.clear();
    this.hitPolygons = [];

    // 2. Collect all blocks
    const blocks = [];
    
    // Locked blocks
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (board.grid[r][c]) {
           blocks.push({ r, c, color: board.grid[r][c].color, hpRatio: board.grid[r][c].hp / board.grid[r][c].maxHp });
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
            if (cellHp > 0) {
              blocks.push({ r: board.pieceRow + r, c: board.pieceCol + c, color, hpRatio: cellHp / 100 });
            }
          }
        }
      }
    }

    // 3. Sort blocks by distance (Painter's algorithm: draw furthest first)
    blocks.forEach(b => {
      const bx = b.c + 0.5;
      const by = (TETRIS_ROWS - 1 - b.r) + 0.5;
      const bz = 0.5; // Centers of cubes are at Z=0.5 (spanning 0 to 1)
      const dx = bx - this.camera.x;
      const dy = by - this.camera.y;
      const dz = bz - this.camera.z;
      b.dist = dx*dx + dy*dy + dz*dz;
    });
    blocks.sort((a, b) => b.dist - a.dist);

    // 4. Draw Floor/Grid Frame (optional, for spatial reference)
    this.drawFloorGrid(currentPitch, currentYaw);

    // 5. Draw Blocks
    blocks.forEach(b => {
      this.drawCube(b.c, TETRIS_ROWS - 1 - b.r, 0, b.color, b.hpRatio, currentPitch, currentYaw, b.r, b.c);
    });
  }

  project(x, y, z, pitch, yaw) {
    let dx = x - this.camera.x;
    let dy = y - this.camera.y;
    let dz = z - this.camera.z;

    // Yaw (Y-axis rotation)
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    let x1 = dx * cosY - dz * sinY;
    let z1 = dx * sinY + dz * cosY;

    // Pitch (X-axis rotation)
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    let y1 = dy * cosP - z1 * sinP;
    let z2 = dy * sinP + z1 * cosP;

    // Perspective projection
    const fov = 400;
    if (z2 <= 0.1) z2 = 0.1; // Behind camera clipping
    
    return {
      x: (x1 * fov) / z2 + GAME_WIDTH / 2,
      y: -(y1 * fov) / z2 + GAME_HEIGHT / 2,
      z: z2
    };
  }

  drawCube(x, y, z, color, hpRatio, pitch, yaw, logicR, logicC) {
    // Scale block slightly if damaged
    const pad = 0.05 + (1 - hpRatio) * 0.4;
    const s0 = pad, s1 = 1 - pad;

    const v = [
      this.project(x+s0, y+s0, z+s0, pitch, yaw), // 0: bottom-left-front
      this.project(x+s1, y+s0, z+s0, pitch, yaw), // 1: bottom-right-front
      this.project(x+s1, y+s1, z+s0, pitch, yaw), // 2: top-right-front
      this.project(x+s0, y+s1, z+s0, pitch, yaw), // 3: top-left-front
      this.project(x+s0, y+s0, z+s1, pitch, yaw), // 4: bottom-left-back
      this.project(x+s1, y+s0, z+s1, pitch, yaw), // 5: bottom-right-back
      this.project(x+s1, y+s1, z+s1, pitch, yaw), // 6: top-right-back
      this.project(x+s0, y+s1, z+s1, pitch, yaw)  // 7: top-left-back
    ];

    // If block is completely behind camera, skip
    if (v.some(p => p.z <= 0.11)) return;

    const drawFace = (p0, p1, p2, p3, shade) => {
      // Cross product for backface culling (Clockwise winding on screen Y-down)
      const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (cross > 0) {
        this.graphics.fillStyle(this.darken(color, shade), 1);
        this.graphics.lineStyle(1, this.darken(color, shade * 0.5), 0.8);
        
        this.graphics.beginPath();
        this.graphics.moveTo(p0.x, p0.y);
        this.graphics.lineTo(p1.x, p1.y);
        this.graphics.lineTo(p2.x, p2.y);
        this.graphics.lineTo(p3.x, p3.y);
        this.graphics.closePath();
        
        this.graphics.fillPath();
        this.graphics.strokePath();

        // Save polygon for hit detection
        this.hitPolygons.push({
          r: logicR, c: logicC,
          poly: new Phaser.Geom.Polygon([p0, p1, p2, p3])
        });
      }
    };

    // Faces defined in clockwise order when looking AT the face from the outside
    drawFace(v[0], v[3], v[2], v[1], 1.0); // Front
    drawFace(v[5], v[6], v[7], v[4], 0.6); // Back
    drawFace(v[3], v[7], v[6], v[2], 1.2); // Top
    drawFace(v[1], v[2], v[6], v[5], 0.8); // Right
    drawFace(v[4], v[7], v[3], v[0], 0.7); // Left
    drawFace(v[4], v[0], v[1], v[5], 0.5); // Bottom
  }

  drawFloorGrid(pitch, yaw) {
    this.graphics.lineStyle(1, 0x00d4ff, 0.2);
    // Draw floor frame
    const p1 = this.project(0, 0, 0, pitch, yaw);
    const p2 = this.project(TETRIS_COLS, 0, 0, pitch, yaw);
    const p3 = this.project(TETRIS_COLS, TETRIS_ROWS, 0, pitch, yaw);
    const p4 = this.project(0, TETRIS_ROWS, 0, pitch, yaw);
    
    if (p1.z > 0.1 && p2.z > 0.1 && p3.z > 0.1 && p4.z > 0.1) {
      this.graphics.strokePoints([p1, p2, p3, p4], true, true);
    }
  }

  darken(color, factor) {
    let r = (color >> 16) & 0xff;
    let g = (color >> 8) & 0xff;
    let b = color & 0xff;
    r = Math.min(255, Math.floor(r * factor));
    g = Math.min(255, Math.floor(g * factor));
    b = Math.min(255, Math.floor(b * factor));
    return (r << 16) | (g << 8) | b;
  }

  // Returns { r, c } if screen coordinate intersects a rendered face
  getHitBlock(screenX, screenY) {
    // Iterate backwards (furthest rendered first, so last in array is closest to camera!)
    for (let i = this.hitPolygons.length - 1; i >= 0; i--) {
      const hit = this.hitPolygons[i];
      if (Phaser.Geom.Polygon.Contains(hit.poly, screenX, screenY)) {
        return { r: hit.r, c: hit.c };
      }
    }
    return null;
  }

  setVisible(visible) {
    this.graphics.setVisible(visible);
  }
}
