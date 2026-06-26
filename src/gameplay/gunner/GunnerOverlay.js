import { COLORS, ARENA_X, ARENA_Y, CELL_SIZE, TETRIS_ROWS, TETRIS_COLS, GAME_WIDTH, GAME_HEIGHT } from '../../config/constants.js';

// ─── Gunner Overlay ───────────────────────────────────────
// Renders the gun model, crosshair, and visual effects
// overlaid on the shared Tetris arena.

export default class GunnerOverlay {
  constructor(scene) {
    this.scene = scene;

    // Crosshair — tracks mouse position
    this.crosshairX = GAME_WIDTH / 2;
    this.crosshairY = GAME_HEIGHT / 2;

    // Graphics layers (high depth to render on top)
    this.weaponGraphics = scene.add.graphics().setDepth(50);
    this.crosshairGraphics = scene.add.graphics().setDepth(60);
    this.effectGraphics = scene.add.graphics().setDepth(55);

    // Weapon bob
    this.weaponBobPhase = 0;

    // Visibility (only shown for gunner role)
    this._visible = true;

    // Texts
    this._ammoText = null;
    this._reloadText = null;
  }

  setVisible(visible) {
    this._visible = visible;
    this.weaponGraphics.setVisible(visible);
    this.crosshairGraphics.setVisible(visible);
    this.effectGraphics.setVisible(visible);
    if (!visible) {
      this.weaponGraphics.clear();
      this.crosshairGraphics.clear();
      this.effectGraphics.clear();
    }
  }

  updateCrosshair(x, y) {
    this.crosshairX = x;
    this.crosshairY = y;
  }

  render(weaponSystem) {
    if (!this._visible) return;

    this.weaponGraphics.clear();
    this.crosshairGraphics.clear();

    this.drawCrosshair(weaponSystem);
    this.drawWeapon(weaponSystem);
    this.updateAmmoDisplay(weaponSystem);
  }

  drawCrosshair(weaponSystem) {
    const g = this.crosshairGraphics;
    const recoil = weaponSystem ? weaponSystem.recoilOffset : { x: 0, y: 0 };
    const spread = weaponSystem ? weaponSystem.currentSpread : 0;

    // Base crosshair position (always locked to mouse)
    const cx = this.crosshairX;
    const cy = this.crosshairY;
    
    // Recoil aim position (where bullets actually hit)
    const rx = cx + recoil.x;
    const ry = cy + recoil.y;

    const baseGap = 4;
    const baseSize = 14;
    const gap = baseGap + spread * 1.5;
    const size = baseSize + spread * 0.5;

    // Crosshair color changes based on spread
    const color = spread > 4 ? 0xff2d55 : spread > 2 ? 0xffd700 : 0x00ff88;

    // 1. Draw primary crosshair at exact mouse position
    g.lineStyle(2, color, 0.9);
    g.lineBetween(cx, cy - size, cx, cy - gap); // Top
    g.lineBetween(cx, cy + gap, cx, cy + size); // Bottom
    g.lineBetween(cx - size, cy, cx - gap, cy); // Left
    g.lineBetween(cx + gap, cy, cx + size, cy); // Right
    g.fillStyle(color, 0.8);
    g.fillCircle(cx, cy, 1.5); // Center dot

    // 2. Draw faint ghost crosshair at recoil position if there's recoil
    if (Math.abs(recoil.x) > 1 || Math.abs(recoil.y) > 1) {
      g.lineStyle(1, 0xffffff, 0.3); // Faint white
      g.lineBetween(rx, ry - size, rx, ry - gap);
      g.lineBetween(rx, ry + gap, rx, ry + size);
      g.lineBetween(rx - size, ry, rx - gap, ry);
      g.lineBetween(rx + gap, ry, rx + size, ry);
      g.fillStyle(0xffffff, 0.4);
      g.fillCircle(rx, ry, 1);
    }

    // Spread indicator circle (faint, around recoil position since that's where spread applies)
    if (spread > 1) {
      g.lineStyle(1, color, 0.15);
      g.strokeCircle(rx, ry, spread * 3);
    }
  }

  drawWeapon(weaponSystem) {
    if (!weaponSystem) return;
    const g = this.weaponGraphics;
    const recoil = weaponSystem.recoilOffset;
    const weaponKey = weaponSystem.currentWeapon;

    // Weapon position: bottom-right of screen
    const baseX = GAME_WIDTH - 200;
    const baseY = GAME_HEIGHT - 50;

    this.weaponBobPhase += 0.025;
    const bobX = Math.sin(this.weaponBobPhase) * 2;
    const bobY = Math.cos(this.weaponBobPhase * 0.7) * 1.5;

    // Recoil visual — weapon kicks up and to the side
    const recoilVisualX = recoil.x * 0.3;
    const recoilVisualY = Math.min(0, recoil.y * 0.4);

    const wx = baseX + bobX + recoilVisualX;
    const wy = baseY + bobY + recoilVisualY;

    if (weaponKey === 'knife') {
      this._drawKnife(g, wx, wy);
    } else if (weaponKey === 'deagle') {
      this._drawDeagle(g, wx, wy);
    } else if (weaponKey === 'ak47') {
      this._drawAK47(g, wx, wy);
    }
  }

  _drawKnife(g, x, y) {
    // Blade
    g.fillStyle(0xcccccc, 0.9);
    g.fillTriangle(x + 50, y - 40, x + 130, y - 80, x + 55, y - 15);
    // Edge highlight
    g.lineStyle(1, 0xffffff, 0.5);
    g.lineBetween(x + 50, y - 40, x + 130, y - 80);
    // Handle
    g.fillStyle(0x553311, 0.9);
    g.fillRect(x + 30, y - 28, 28, 45);
    // Guard
    g.fillStyle(0x888888, 0.9);
    g.fillRect(x + 25, y - 30, 38, 5);
    // Grip texture
    g.lineStyle(1, 0x442200, 0.4);
    for (let i = 0; i < 5; i++) {
      g.lineBetween(x + 32, y - 22 + i * 8, x + 56, y - 22 + i * 8);
    }
  }

  _drawDeagle(g, x, y) {
    // Slide (top)
    g.fillStyle(0x2a2a2a, 0.95);
    g.fillRect(x, y - 30, 120, 22);
    // Barrel
    g.fillStyle(0x1a1a1a, 0.95);
    g.fillRect(x + 110, y - 27, 40, 16);
    // Muzzle
    g.fillStyle(0x111111, 1);
    g.fillCircle(x + 150, y - 19, 6);
    // Slide serrations
    g.lineStyle(1, 0x444444, 0.4);
    for (let i = 0; i < 6; i++) {
      g.lineBetween(x + 80 + i * 5, y - 29, x + 80 + i * 5, y - 10);
    }
    // Trigger guard
    g.lineStyle(2, 0x333333, 0.8);
    g.strokeCircle(x + 55, y + 5, 14);
    // Grip
    g.fillStyle(0x222222, 0.95);
    g.beginPath();
    g.moveTo(x + 20, y - 8);
    g.lineTo(x + 70, y - 8);
    g.lineTo(x + 60, y + 45);
    g.lineTo(x + 15, y + 45);
    g.closePath();
    g.fill();
    // Grip texture
    g.lineStyle(1, 0x333333, 0.3);
    for (let i = 0; i < 6; i++) {
      g.lineBetween(x + 22, y + i * 7, x + 62, y + i * 7);
    }
    // Top highlight
    g.lineStyle(1, 0x555555, 0.5);
    g.lineBetween(x + 2, y - 29, x + 118, y - 29);
    // Front sight
    g.fillStyle(0x555555, 0.8);
    g.fillRect(x + 105, y - 35, 3, 6);
    // Rear sight
    g.fillStyle(0x555555, 0.8);
    g.fillRect(x + 5, y - 35, 8, 5);
    g.fillRect(x + 18, y - 35, 8, 5);
  }

  _drawAK47(g, x, y) {
    // Receiver / main body
    g.fillStyle(0x2d2d2d, 0.95);
    g.fillRect(x - 60, y - 28, 170, 20);
    // Barrel + gas tube
    g.fillStyle(0x1f1f1f, 0.95);
    g.fillRect(x + 100, y - 25, 70, 12);
    g.fillStyle(0x252525, 0.9);
    g.fillRect(x + 100, y - 30, 60, 6);
    // Front sight
    g.fillStyle(0x444444, 0.9);
    g.fillRect(x + 155, y - 38, 3, 12);
    // Rear sight
    g.fillStyle(0x444444, 0.8);
    g.fillRect(x + 30, y - 34, 10, 6);
    // Magazine (curved)
    g.fillStyle(0x252525, 0.95);
    g.beginPath();
    g.moveTo(x + 10, y - 8);
    g.lineTo(x + 45, y - 8);
    g.lineTo(x + 38, y + 50);
    g.lineTo(x + 5, y + 55);
    g.closePath();
    g.fill();
    // Stock (wooden)
    g.fillStyle(0x5a3820, 0.9);
    g.fillRect(x - 100, y - 25, 45, 16);
    // Stock bottom
    g.fillStyle(0x4a2e18, 0.85);
    g.beginPath();
    g.moveTo(x - 100, y - 9);
    g.lineTo(x - 58, y - 9);
    g.lineTo(x - 65, y + 25);
    g.lineTo(x - 105, y + 20);
    g.closePath();
    g.fill();
    // Pistol grip (wooden)
    g.fillStyle(0x4a2e18, 0.9);
    g.beginPath();
    g.moveTo(x + 55, y - 8);
    g.lineTo(x + 78, y - 8);
    g.lineTo(x + 72, y + 35);
    g.lineTo(x + 50, y + 35);
    g.closePath();
    g.fill();
    // Muzzle brake
    g.fillStyle(0x111111, 1);
    g.fillRect(x + 165, y - 24, 10, 10);
    // Highlight
    g.lineStyle(1, 0x444444, 0.3);
    g.lineBetween(x - 58, y - 27, x + 108, y - 27);
    // Wood grain on stock
    g.lineStyle(1, 0x3a2010, 0.2);
    for (let i = 0; i < 4; i++) {
      g.lineBetween(x - 98 + i * 10, y - 24, x - 98 + i * 10, y - 10);
    }
  }

  // ─── Ammo display ─────────────────────────────────────
  updateAmmoDisplay(weaponSystem) {
    const weapon = weaponSystem.getCurrentWeapon();

    if (weapon.maxAmmo !== Infinity) {
      const ammoStr = `${weapon.currentAmmo} / ${weapon.currentReserve}`;
      if (!this._ammoText) {
        this._ammoText = this.scene.add.text(GAME_WIDTH - 160, GAME_HEIGHT - 30, '', {
          fontFamily: 'Orbitron', fontSize: '16px', color: '#00d4ff',
          stroke: '#000', strokeThickness: 3,
        }).setDepth(60);
      }
      this._ammoText.setText(ammoStr);
      this._ammoText.setColor(weapon.currentAmmo <= Math.ceil(weapon.maxAmmo * 0.25) ? '#ff2d55' : '#00d4ff');
      this._ammoText.setVisible(true);
    } else {
      if (this._ammoText) this._ammoText.setVisible(false);
    }

    if (weaponSystem.isReloading) {
      if (!this._reloadText) {
        this._reloadText = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'RELOADING...', {
          fontFamily: 'Orbitron', fontSize: '18px', color: '#ffd700',
          stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(60);
      }
      this._reloadText.setVisible(true);
    } else {
      if (this._reloadText) this._reloadText.setVisible(false);
    }
  }

  // ─── Muzzle flash / attack effect ──────────────────────────────
  muzzleFlash(weaponKey) {
    const g = this.scene.add.graphics().setDepth(55);
    let fx, fy;

    if (weaponKey === 'knife') {
      // Slash effect — multi-layer diagonal slash
      fx = this.crosshairX;
      fy = this.crosshairY;
      const angle = -0.6 + Math.random() * 0.3; // slight random angle

      // Outer glow
      const g2 = this.scene.add.graphics().setDepth(54);
      g2.lineStyle(12, 0xff2d55, 0.25);
      g2.beginPath();
      g2.moveTo(fx - 50, fy - 45);
      g2.lineTo(fx + 55, fy + 40);
      g2.stroke();

      // Main slash line (bright white)
      g.lineStyle(5, 0xffffff, 0.95);
      g.beginPath();
      g.moveTo(fx - 45, fy - 40);
      g.lineTo(fx + 50, fy + 35);
      g.stroke();

      // Inner slash (thinner, cyan)
      g.lineStyle(2, 0x00d4ff, 0.8);
      g.beginPath();
      g.moveTo(fx - 42, fy - 37);
      g.lineTo(fx + 47, fy + 32);
      g.stroke();

      // Spark particles along the slash
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const px = fx - 45 + t * 95 + (Math.random() - 0.5) * 20;
        const py = fy - 40 + t * 75 + (Math.random() - 0.5) * 20;
        const sz = 2 + Math.random() * 3;
        g.fillStyle(i < 4 ? 0xffffff : 0xff2d55, 0.7 + Math.random() * 0.3);
        g.fillCircle(px, py, sz);
      }

      // Impact flash at center
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(fx, fy, 15);
      g.fillStyle(0xff2d55, 0.3);
      g.fillCircle(fx, fy, 25);

      // Animate both layers out
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
      this.scene.tweens.add({ targets: g2, alpha: 0, scaleX: 1.3, scaleY: 1.3, duration: 300, onComplete: () => g2.destroy() });

      // Small screen shake for impact feel
      this.scene.cameras.main.shake(80, 0.004);
      return;
    } else if (weaponKey === 'ak47') {
      fx = GAME_WIDTH - 25;
      fy = GAME_HEIGHT - 75;
    } else if (weaponKey === 'deagle') {
      fx = GAME_WIDTH - 50;
      fy = GAME_HEIGHT - 70;
    } else {
      return;
    }

    // Flash
    g.fillStyle(0xffcc00, 0.8);
    g.fillCircle(fx, fy, 18);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(fx, fy, 8);

    // Rays
    g.lineStyle(2, 0xffaa00, 0.6);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const len = 15 + Math.random() * 10;
      g.lineBetween(fx, fy, fx + Math.cos(angle) * len, fy + Math.sin(angle) * len);
    }

    this.scene.tweens.add({
      targets: g, alpha: 0, duration: 50,
      onComplete: () => g.destroy(),
    });
  }

  // ─── Hit marker ───────────────────────────────────────
  showHitMarker(x, y, isDestroyed) {
    const color = isDestroyed ? '#ff2d55' : '#ffffff';
    const symbol = isDestroyed ? '✕' : '×';
    const size = isDestroyed ? '22px' : '16px';

    const marker = this.scene.add.text(x, y, symbol, {
      fontFamily: 'Inter', fontSize: size, color, fontStyle: 'bold',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(70);

    this.scene.tweens.add({
      targets: marker, alpha: 0, y: y - 25, duration: 350,
      onComplete: () => marker.destroy(),
    });
  }

  // ─── Damage flash on screen edges ─────────────────────
  damageFlash() {
    const g = this.scene.add.graphics().setDepth(80);
    // Red vignette on edges
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0xff0000, 0.15 * (1 - i / 40));
      g.fillRect(0, i, w, 1);
      g.fillRect(0, h - i, w, 1);
      g.fillRect(i, 0, 1, h);
      g.fillRect(w - i, 0, 1, h);
    }
    this.scene.tweens.add({
      targets: g, alpha: 0, duration: 400,
      onComplete: () => g.destroy(),
    });
  }

  destroy() {
    this.weaponGraphics.destroy();
    this.crosshairGraphics.destroy();
    this.effectGraphics.destroy();
    if (this._ammoText) this._ammoText.destroy();
    if (this._reloadText) this._reloadText.destroy();
  }
}
