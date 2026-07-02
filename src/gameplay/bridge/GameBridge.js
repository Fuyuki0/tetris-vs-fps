import eventBus from './EventBus.js';
import { EVENTS, LINE_DAMAGE, COMBO_BONUS, GUNNER_MAX_HP, HP_REGEN_RATE, HP_REGEN_DELAY } from '../../config/constants.js';

// ─── Game Bridge ──────────────────────────────────────────
// Orchestrates communication between Tetris and Gunner systems.
// Handles damage calculation, win/lose conditions, HP regen, and state sync.

export default class GameBridge {
  constructor(scene) {
    this.scene = scene;
    this.gunnerHP = GUNNER_MAX_HP;
    this.gunnerMaxRegenHP = GUNNER_MAX_HP;
    this.combo = 0;
    this.winner = null;
    this.isGameOver = false;
    this.lastLineClearTime = Date.now();
    this.regenActive = false;

    this._bindEvents();
  }

  _bindEvents() {
    // When Tetris clears lines → damage the Gunner
    eventBus.on(EVENTS.LINE_CLEARED, this.onLineCleared, this);

    // When Gunner destroys a block → notify Tetris
    eventBus.on(EVENTS.BLOCK_DESTROYED, this.onBlockDestroyed, this);

    // When Tetris tops out → Gunner wins
    eventBus.on(EVENTS.TETRIS_GAME_OVER, this.onTetrisGameOver, this);

    // When Gunner HP reaches 0 → Tetris wins
    eventBus.on(EVENTS.GUNNER_GAME_OVER, this.onGunnerGameOver, this);
  }

  onLineCleared(data) {
    if (this.isGameOver) return;
    
    // Purge ability clears lines for survival, but deals no damage to Gunner
    if (data.isPurge) return;

    this.combo++;
    this.lastLineClearTime = Date.now();
    this.regenActive = false;
    
    // The damage to gunner is now handled by Parkour Obstacles colliding in ThreeScene.js!
  }

  damageGunner(amount) {
    if (this.isGameOver) return;
    
    const actualDamageTaken = Math.min(this.gunnerHP, amount);
    this.gunnerHP = Math.max(0, this.gunnerHP - amount);
    
    // Permanent damage: Gunner loses 20% of damage taken from their max possible regeneration cap
    this.gunnerMaxRegenHP = Math.max(1, this.gunnerMaxRegenHP - (actualDamageTaken * 0.2));
    
    this.regenActive = false;
    
    eventBus.emit(EVENTS.BLOCK_DAMAGED, {
      gunnerHP: this.gunnerHP,
      maxHP: GUNNER_MAX_HP,
      damage: amount,
      combo: 1, // Doesn't apply here for obstacles
    });

    if (this.gunnerHP <= 0) {
      this.endGame('tetris');
    }
  }

  onBlockDestroyed(data) {
    // Gunner destroyed a block — Tetris board handles this directly
  }

  resetCombo() {
    this.combo = 0;
  }

  onTetrisGameOver() {
    this.endGame('gunner');
  }

  onGunnerGameOver() {
    this.endGame('tetris');
  }

  endGame(winner) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.winner = winner;
    eventBus.emit(EVENTS.GAME_OVER, { winner });
  }

  getGunnerHP() {
    return this.gunnerHP;
  }

  // Call every frame from GameplayScene
  update(delta) {
    if (this.isGameOver) return;

    // HP regeneration: if no lines cleared for HP_REGEN_DELAY, heal slowly up to maxRegenHP
    const timeSinceClear = Date.now() - this.lastLineClearTime;
    if (timeSinceClear >= HP_REGEN_DELAY && this.gunnerHP < this.gunnerMaxRegenHP) {
      this.regenActive = true;
      const healAmount = HP_REGEN_RATE * (delta / 1000);
      this.gunnerHP = Math.min(this.gunnerMaxRegenHP, this.gunnerHP + healAmount);
      this.gunnerHP = Math.round(this.gunnerHP * 10) / 10; // Avoid float noise
    } else {
      this.regenActive = false;
    }
  }

  destroy() {
    eventBus.off(EVENTS.LINE_CLEARED);
    eventBus.off(EVENTS.BLOCK_DESTROYED);
    eventBus.off(EVENTS.TETRIS_GAME_OVER);
    eventBus.off(EVENTS.GUNNER_GAME_OVER);
  }
}
