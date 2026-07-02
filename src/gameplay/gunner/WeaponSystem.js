import { WEAPONS, GUNNER_UTILITIES } from '../../config/constants.js';
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
    this.isWalking = false;
    this.isCrouching = false;
    this.isSwitching = false;
    this.switchTimerObj = null;

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

    // Add utilities as selectable weapons
    for (const [key, config] of Object.entries(GUNNER_UTILITIES)) {
      this.weapons[key] = {
        ...config,
        isUtility: true,
        maxAmmo: Infinity,
        currentAmmo: Infinity
      };
    }
    
    this.previousWeaponKey = 'deagle';
  }

  getCurrentWeapon() {
    return this.weapons[this.currentWeapon];
  }

  switchWeapon(weaponKey) {
    if (!this.weapons[weaponKey] || weaponKey === this.currentWeapon) return false;
    if (this.isReloading) this.cancelReload();
    if (this.switchTimerObj) {
      this.switchTimerObj.remove();
      this.switchTimerObj = null;
    }
    
    if (!this.weapons[this.currentWeapon].isUtility) {
      this.previousWeaponKey = this.currentWeapon;
    }
    this.currentWeapon = weaponKey;
    this.currentSpread = 0;
    this.recoilOffset = { x: 0, y: 0 };
    this.shotIndex = 0;
    this.recoilResetTimer = 0;
    
    this.isSwitching = true;
    this.switchTimerObj = this.scene.time.delayedCall(400, () => {
      this.isSwitching = false;
      this.switchTimerObj = null;
    });
    
    return true;
  }

  nextWeapon() {
    const order = ['knife', 'deagle', 'ak47', 'grenade', 'flashbang', 'smoke'];
    let idx = order.indexOf(this.currentWeapon);
    idx = (idx + 1) % order.length;
    
    this.switchWeapon(order[idx]);
  }

  previousWeapon() {
    const order = ['knife', 'deagle', 'ak47', 'grenade', 'flashbang', 'smoke'];
    let idx = order.indexOf(this.currentWeapon);
    idx = (idx - 1 + order.length) % order.length;
    
    this.switchWeapon(order[idx]);
  }

  canFire() {
    if (this.isReloading || this.isSwitching) return false;
    const weapon = this.getCurrentWeapon();
    const now = Date.now();
    if (now - this.lastFireTime < weapon.fireRate) return false;
    if (weapon.currentAmmo <= 0 && weapon.maxAmmo !== Infinity) return false;
    return true;
  }

  // Fire and return the recoil-adjusted aim offset
  fire() {
    if (this.isReloading) return null;

    const weapon = this.getCurrentWeapon();
    
    // Auto-reload if trying to fire with 0 ammo
    if (weapon.currentAmmo <= 0 && weapon.maxAmmo !== Infinity) {
      this.reload();
      return null;
    }

    if (!this.canFire()) return null;

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
      const idx = Math.min(Math.floor(this.shotIndex), weapon.recoilPattern.length - 1);
      const pattern = weapon.recoilPattern[idx];

      let crouchMod = this.isCrouching ? 0.6 : 1.0;
      let walkSpread = this.isWalking ? 30.0 : 0; // Massive penalty for walking
      
      const randomFactor = this.isWalking ? 2.0 : 0.4;
      // Add a baseline randomness (e.g. 2 for X, 2 for Y) so even 0-value patterns have some random deviation
      recoilX = (pattern.x + (Math.random() - 0.5) * (Math.abs(pattern.x) * randomFactor + 2) + (Math.random() - 0.5) * walkSpread) * crouchMod;
      recoilY = (pattern.y + (Math.random() - 0.5) * (Math.abs(pattern.y) * randomFactor + 2) - Math.abs(walkSpread * Math.random())) * crouchMod;

      this.shotIndex++;
    }

    const preShotRecoilX = this.recoilOffset.x;
    const preShotRecoilY = this.recoilOffset.y;

    this.recoilOffset.x = recoilX;
    this.recoilOffset.y = recoilY;

    // Calculate spread (increases with rapid fire)
    const baseSpread = weapon.baseSpread || weapon.spread || 0;
    const spamSpread = weapon.spamSpread || baseSpread * 3;
    const sprayFactor = Math.min(1, this.shotIndex / (weapon.recoilPattern?.length || 10));
    this.currentSpread = baseSpread + (spamSpread - baseSpread) * sprayFactor;
    
    // Apply crouch / walk modifiers to spread
    if (this.isCrouching) this.currentSpread *= 0.6;
    if (this.isWalking) this.currentSpread += 15;

    // Random spread on this shot
    const spreadAngle = (Math.random() - 0.5) * 2 * this.currentSpread;
    const spreadAngleY = (Math.random() - 0.5) * 2 * this.currentSpread * 0.5;

    // Trigger independent View Punch (sharp screen shake)
    if (this.scene.threeScene && this.scene.threeScene.viewPunch) {
      // Deagle needs a bigger kick, AK-47 needs a steady kick
      const kickStrength = this.currentWeapon === 'deagle' ? 0.30 : 0.04;
      this.scene.threeScene.viewPunch.pitch += kickStrength;
      this.scene.threeScene.viewPunch.yaw += (Math.random() - 0.5) * (kickStrength / 2);
    }

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
    // Recovery starts almost immediately. If you hold the trigger, it will only slightly recover between shots,
    // which is expected. If you tap fire, it will fully recover.
    const timeSinceShot = Date.now() - this.lastShotTime;
    const recoveryDelay = weapon.fireRate * 0.1; // Very short delay before recovery starts

    if (timeSinceShot > recoveryDelay) {
      // Rapidly trace the recoil pattern backwards!
      const recoverySpeed = weapon.recoilRecovery || 0.05;
      this.shotIndex = Math.max(0, this.shotIndex - delta * recoverySpeed);

      if (weapon.recoilPattern && weapon.recoilPattern.length > 0) {
        if (this.shotIndex === 0) {
          this.recoilOffset.x = 0;
          this.recoilOffset.y = 0;
        } else {
          const idx = Math.min(Math.floor(this.shotIndex), weapon.recoilPattern.length - 1);
          const pattern = weapon.recoilPattern[idx];
          // Smoothly interpolate to the pattern position of the recovering index
          this.recoilOffset.x += (pattern.x - this.recoilOffset.x) * 0.5;
          this.recoilOffset.y += (pattern.y - this.recoilOffset.y) * 0.5;
        }
      } else {
        // Fallback rapid decay if no pattern
        this.recoilOffset.x *= 0.8;
        this.recoilOffset.y *= 0.8;
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
