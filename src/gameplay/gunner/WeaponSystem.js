import { WEAPONS } from '../../config/constants.js';
import eventBus from '../bridge/EventBus.js';
import { EVENTS } from '../../config/constants.js';

// ─── Weapon System ────────────────────────────────────────
// Manages weapon switching, ammo, reloading, fire rate,
// and CS:GO-style recoil patterns.

export default class WeaponSystem {
  constructor(scene) {
    this.scene = scene;
    this.weapons = {};
    this.currentWeapon = 'deagle';
    this.isFiring = false;
    this.isReloading = false;
    this.lastFireTime = 0;
    this.reloadTimer = null;

    // Recoil state
    this.recoilOffset = { x: 0, y: 0 };  // Current visual recoil offset
    this.currentSpread = 0;
    this.shotIndex = 0;  // Which bullet in the spray pattern
    this.lastShotTime = 0;
    this.recoilResetTimer = 0; // Time since last shot for recovery

    // Initialize weapons
    for (const [key, config] of Object.entries(WEAPONS)) {
      this.weapons[key] = {
        ...config,
        currentAmmo: config.maxAmmo,
        currentReserve: config.reserveAmmo,
      };
    }
  }

  getCurrentWeapon() {
    return this.weapons[this.currentWeapon];
  }

  switchWeapon(weaponKey) {
    if (!this.weapons[weaponKey] || weaponKey === this.currentWeapon) return false;
    if (this.isReloading) this.cancelReload();
    this.currentWeapon = weaponKey;
    this.currentSpread = 0;
    this.recoilOffset = { x: 0, y: 0 };
    this.shotIndex = 0;
    this.recoilResetTimer = 0;
    return true;
  }

  canFire() {
    if (this.isReloading) return false;
    const weapon = this.getCurrentWeapon();
    const now = Date.now();
    if (now - this.lastFireTime < weapon.fireRate) return false;
    if (weapon.currentAmmo <= 0 && weapon.maxAmmo !== Infinity) return false;
    return true;
  }

  // Fire and return the recoil-adjusted aim offset
  fire() {
    if (!this.canFire()) return null;

    const weapon = this.getCurrentWeapon();
    const now = Date.now();
    this.lastFireTime = now;
    this.lastShotTime = now;
    this.recoilResetTimer = 0;

    // Consume ammo
    if (weapon.maxAmmo !== Infinity) {
      weapon.currentAmmo--;
    }

    // ─── Calculate recoil offset for this shot ───
    let recoilX = 0;
    let recoilY = 0;

    if (weapon.recoilPattern && weapon.recoilPattern.length > 0) {
      const patternIdx = Math.min(this.shotIndex, weapon.recoilPattern.length - 1);
      const pattern = weapon.recoilPattern[patternIdx];

      // Add some randomness (inaccuracy)
      const randomFactor = 0.3;
      recoilX = pattern.x + (Math.random() - 0.5) * Math.abs(pattern.x) * randomFactor;
      recoilY = pattern.y + (Math.random() - 0.5) * Math.abs(pattern.y) * randomFactor;

      this.shotIndex++;
    }

    // Capture the exact recoil state BEFORE applying the new kick for hit registration
    const preShotRecoilX = this.recoilOffset.x;
    const preShotRecoilY = this.recoilOffset.y;

    // Apply cumulative recoil to the crosshair offset (for the next shot/visuals)
    this.recoilOffset.x += recoilX;
    this.recoilOffset.y += recoilY;

    // Calculate spread (increases with rapid fire)
    const baseSpread = weapon.baseSpread || weapon.spread || 0;
    const spamSpread = weapon.spamSpread || baseSpread * 3;
    const sprayFactor = Math.min(1, this.shotIndex / (weapon.recoilPattern?.length || 10));
    this.currentSpread = baseSpread + (spamSpread - baseSpread) * sprayFactor;

    // Random spread on this shot
    const spreadAngle = (Math.random() - 0.5) * 2 * this.currentSpread;
    const spreadAngleY = (Math.random() - 0.5) * 2 * this.currentSpread * 0.5;

    const result = {
      weapon: this.currentWeapon,
      damage: weapon.damage,
      recoilOffsetX: preShotRecoilX + spreadAngle,
      recoilOffsetY: preShotRecoilY + spreadAngleY,
      shotIndex: this.shotIndex,
      spread: this.currentSpread,
    };

    eventBus.emit(EVENTS.SHOT_FIRED, result);

    // Auto-reload when empty
    if (weapon.currentAmmo <= 0 && weapon.maxAmmo !== Infinity) {
      this.reload();
    }

    return result;
  }

  reload() {
    const weapon = this.getCurrentWeapon();
    if (this.isReloading) return;
    if (weapon.maxAmmo === Infinity) return; // knife etc
    if (weapon.currentAmmo >= weapon.maxAmmo) return; // already full

    this.isReloading = true;
    this.reloadTimer = this.scene.time.delayedCall(weapon.reloadTime, () => {
      // Infinite reserve: just refill fully
      if (weapon.reserveAmmo === Infinity || weapon.currentReserve === Infinity) {
        weapon.currentAmmo = weapon.maxAmmo;
      } else {
        const needed = weapon.maxAmmo - weapon.currentAmmo;
        const available = Math.min(needed, weapon.currentReserve);
        weapon.currentAmmo += available;
        weapon.currentReserve -= available;
      }
      this.isReloading = false;
      this.shotIndex = 0;
      this.recoilOffset = { x: 0, y: 0 };
    });
  }

  cancelReload() {
    if (this.reloadTimer) {
      this.reloadTimer.remove();
      this.reloadTimer = null;
    }
    this.isReloading = false;
  }

  update(delta) {
    const weapon = this.getCurrentWeapon();
    const recovery = weapon.recoilRecovery || 0.03;

    // Track time since last shot
    this.recoilResetTimer += delta;

    // Recoil recovery: slowly return crosshair to center
    // Only start recovering after a delay longer than the fire rate, so holding the trigger prevents recovery
    const timeSinceShot = Date.now() - this.lastShotTime;
    const recoveryDelay = weapon.fireRate + 50;

    if (timeSinceShot > recoveryDelay) {
      // recovery is usually too high, cap it so it decays smoothly
      const recoveryRate = Math.min(0.2, recovery * delta * 0.15); // Much smoother decay
      this.recoilOffset.x *= (1 - recoveryRate);
      this.recoilOffset.y *= (1 - recoveryRate);

      if (Math.abs(this.recoilOffset.x) < 0.1) this.recoilOffset.x = 0;
      if (Math.abs(this.recoilOffset.y) < 0.1) this.recoilOffset.y = 0;

      // Reset shot index when recoil is mostly recovered
      if (Math.abs(this.recoilOffset.x) < 1 && Math.abs(this.recoilOffset.y) < 1) {
        this.shotIndex = 0;
      }

      // Spread recovery
      this.currentSpread = Math.max(0, this.currentSpread - delta * 0.005);
    }
  }

  // Get effective aim position (base aim + recoil)
  getEffectiveAim(baseX, baseY) {
    return {
      x: baseX + this.recoilOffset.x,
      y: baseY + this.recoilOffset.y,
    };
  }
}
