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
    
    // Weapon Stack (CS:GO style inventory)
    this._weaponStackTexts = [];
    this._weaponList = [
      { key: 'knife', label: '[1] 🔪 Knife' },
      { key: 'deagle', label: '[2] 🔫 Deagle' },
      { key: 'ak47', label: '[3] 🔫 AK-47' },
      { key: 'grenade', label: '[4] 💣 Grenade' },
      { key: 'flashbang', label: '[5] ✨ Flash' },
    ];

    // Toggle View UI
    this._toggleViewText = this.scene.add.text(GAME_WIDTH - 200, 20, '[V] Toggle View', {
      fontFamily: 'Orbitron',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(1, 0).setDepth(80);

    // Keyboard listener for V key
    this.scene.input.keyboard.on('keydown-V', () => {
      if (this.scene.threeScene && this.scene.playerRole === 'gunner') {
        this.scene.threeScene.toggleThirdPerson();
      }
    });
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
      this._weaponStackTexts.forEach(t => t.setVisible(false));
      this._toggleViewText.setVisible(false);
    } else {
      this._weaponStackTexts.forEach(t => t.setVisible(true));
      this._toggleViewText.setVisible(true);
    }
  }

  updateCrosshair(x, y) {
    // In FPS mode, the crosshair is permanently locked to the center of the screen.
    this.crosshairX = GAME_WIDTH / 2;
    this.crosshairY = GAME_HEIGHT / 2;
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

    // 1. Draw primary crosshair at exact center of screen
    g.lineStyle(2, color, 0.9);
    g.lineBetween(cx, cy - size, cx, cy - gap); // Top
    g.lineBetween(cx, cy + gap, cx, cy + size); // Bottom
    g.lineBetween(cx - size, cy, cx - gap, cy); // Left
    g.lineBetween(cx + gap, cy, cx + size, cy); // Right
    g.fillStyle(color, 0.8);
    g.fillCircle(cx, cy, 1.5); // Center dot

    // Spread indicator circle (faint, around primary crosshair)
    if (spread > 1) {
      g.lineStyle(1, color, 0.15);
      g.strokeCircle(cx, cy, spread * 3);
    }
  }

  drawWeapon(weaponSystem) {
    // 2D weapons have been replaced by true 3D view models in ThreeScene.js!
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

  // ─── CS:GO 2 Style Weapon Stack ───────────────────────
    // Note: The 2D Weapon Stack UI has been replaced by the 3D Holographic UI in ThreeScene.js.
    // The cooldowns and selections are now rendered directly as 3D models.

  // ─── Muzzle flash / attack effect ──────────────────────────────
  muzzleFlash(weaponKey, theta = 0, hitX = null, hitY = null) {
    const g = this.scene.add.graphics().setDepth(55);
    let fx, fy;

    if (weaponKey === 'knife') {
      // Slash effect — multi-layer slash matching the theta angle
      fx = hitX !== null ? hitX : this.crosshairX;
      fy = hitY !== null ? hitY : this.crosshairY;
      
      const len = 70;
      const dx = Math.cos(theta) * len;
      const dy = Math.sin(theta) * len;

      // Outer glow
      const g2 = this.scene.add.graphics().setDepth(54);
      g2.lineStyle(12, 0xff2d55, 0.25);
      g2.beginPath();
      g2.moveTo(fx - dx, fy - dy);
      g2.lineTo(fx + dx, fy + dy);
      g2.stroke();

      // Main slash line (bright white)
      g.lineStyle(5, 0xffffff, 0.95);
      g.beginPath();
      g.moveTo(fx - dx * 0.9, fy - dy * 0.9);
      g.lineTo(fx + dx * 0.9, fy + dy * 0.9);
      g.stroke();

      // Inner slash (thinner, cyan)
      g.lineStyle(2, 0x00d4ff, 0.8);
      g.beginPath();
      g.moveTo(fx - dx * 0.85, fy - dy * 0.85);
      g.lineTo(fx + dx * 0.85, fy + dy * 0.85);
      g.stroke();

      // Spark particles along the slash
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const px = fx - dx + t * (dx * 2) + (Math.random() - 0.5) * 20;
        const py = fy - dy + t * (dy * 2) + (Math.random() - 0.5) * 20;
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
    if (!isDestroyed) return; // Only show red hit markers for destroyed blocks

    const color = '#ff2d55';
    const symbol = '✕';
    const size = '22px';

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
