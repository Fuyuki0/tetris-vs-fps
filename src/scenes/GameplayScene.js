import Phaser from 'phaser';
import { COLORS, SCENES, EVENTS, GAME_WIDTH, GAME_HEIGHT, ARENA_X, ARENA_Y, CELL_SIZE, TETRIS_COLS, TETRIS_ROWS, GUNNER_MAX_HP, BLOCK_HP, GUNNER_UTILITIES } from '../config/constants.js';
import TetrisBoard from '../gameplay/tetris/TetrisBoard.js';
import TetrisRenderer from '../gameplay/tetris/TetrisRenderer.js';
import TetrisController from '../gameplay/tetris/TetrisController.js';
import GunnerOverlay from '../gameplay/gunner/GunnerOverlay.js';
import WeaponSystem from '../gameplay/gunner/WeaponSystem.js';
import GameBridge from '../gameplay/bridge/GameBridge.js';
import eventBus from '../gameplay/bridge/EventBus.js';
import ThreeScene from '../gameplay/ThreeScene.js';
import * as THREE from 'three';

// Layout constants
const BOARD_W = TETRIS_COLS * CELL_SIZE; // 300
const BOARD_H = TETRIS_ROWS * CELL_SIZE; // 600
const BOARD_LEFT = ARENA_X;             // ~490
const BOARD_RIGHT = ARENA_X + BOARD_W;  // ~790
const BOARD_BOTTOM = ARENA_Y + BOARD_H;
const LP_X = 15, LP_W = BOARD_LEFT - 30;  // left panel
const RP_X = BOARD_RIGHT + 15, RP_W = GAME_WIDTH - RP_X - 15; // right panel

export default class GameplayScene extends Phaser.Scene {
  constructor() { super({ key: SCENES.GAMEPLAY }); }
  init(data) { this.playerRole = data.role || 'tetris'; }

  create() {
    // Phaser canvas is transparent — Three.js renders the 3D world behind it
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.cameras.main.fadeIn(500);
    eventBus.removeAll();

    // Clean up Three.js on scene restart/shutdown
    this.events.once('shutdown', () => {
      // Release mouse if locked
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      
      if (this.threeScene) {
        this.threeScene.dispose();
        this.threeScene = null;
      }
    });

    this.tetrisBoard = new TetrisBoard();
    this.bridge = new GameBridge(this);
    // Force 3D mode for both players so the center is clean
    this.tetrisRenderer = new TetrisRenderer(this, true);
    this.gunnerOverlay = new GunnerOverlay(this);
    this.weaponSystem = new WeaponSystem(this);

    // Preview positions
    this.holdPos = { x: LP_X + LP_W / 2, y: ARENA_Y + 55 };
    this.nextQueueX = RP_X + RP_W / 2;
    this.nextStartY = ARENA_Y + 50;
    this.nextSpacing = 65;

    // Controls
    if (this.playerRole === 'tetris') {
      this.tetrisController = new TetrisController(this, this.tetrisBoard);

      // Ability keybinds — use addKey for reliability
      const keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      const keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      const keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      const keyF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

      keyA.on('down', () => {
        if (this.tetrisBoard.activateIronBody()) this.flashAbility('Iron Body ACTIVE! (6s)', '#ffaa00');
        else this.flashAbility('Iron Body on cooldown', '#ff4444');
      });
      keyS.on('down', () => {
        if (this.tetrisBoard.activateShield()) this.flashAbility('Shield Aura ACTIVE!', '#00d4ff');
        else this.flashAbility('Shield on cooldown', '#ff4444');
      });
      keyD.on('down', () => {
        if (this.tetrisBoard.activateRepair()) this.flashAbility('Blocks Repaired! +30 HP', '#00ff88');
        else this.flashAbility('Repair on cooldown', '#ff4444');
      });
      keyF.on('down', () => {
        if (this.tetrisBoard.activateSeismicPurge()) { this.flashAbility('SEISMIC PURGE!', '#ff8800'); this.cameras.main.shake(400, 0.02); }
        else this.flashAbility('Seismic Purge on cooldown', '#ff4444');
      });
    }

    // Only gunner sees their crosshair + weapon
    this.gunnerOverlay.setVisible(this.playerRole === 'gunner');

    // Initialize Three.js 3D scene
    this.threeScene = new ThreeScene(this, this.playerRole);
    
    if (this.playerRole === 'gunner') {
      // Hide OS cursor, use game crosshair
      this.game.canvas.style.cursor = 'none';
      
      this.input.on('pointermove', (p) => {
        if (this.input.mouse.locked && this.threeScene) {
          this.threeScene.applyMouseMovement(p.movementX, p.movementY);
        }
      });
      
      this.input.on('pointerdown', (p) => {
        if (!this.input.mouse.locked) {
          this.input.mouse.requestPointerLock();
          if (this._lockHintText) {
            this._lockHintText.destroy();
            this._lockHintText = null;
          }
          return;
        }
        this.isFiringHeld = true;
        this.handleShot();
      });
      
      this.input.on('pointerup', () => { this.isFiringHeld = false; });
      this.input.keyboard.on('keydown-ONE', () => this.weaponSystem.switchWeapon('knife'));
      this.input.keyboard.on('keydown-TWO', () => this.weaponSystem.switchWeapon('deagle'));
      this.input.keyboard.on('keydown-THREE', () => this.weaponSystem.switchWeapon('ak47'));
      this.input.keyboard.on('keydown-R', () => this.weaponSystem.reload());
    }

    this.createHUD();

    eventBus.on(EVENTS.LINE_CLEARED, (d) => this.onLineClear(d));
    eventBus.on(EVENTS.GAME_OVER, (d) => this.onGameOver(d));
    eventBus.on(EVENTS.BLOCK_DAMAGED, (d) => {
      this.updateHPBar(d.gunnerHP, d.maxHP);
      if (d.damage > 0) { this.gunnerOverlay.damageFlash(); this.showDamageNumber(d.damage, d.combo); }
    });
    eventBus.on(EVENTS.ABILITY_USED, (d) => this.showAbilityNotice(d.ability));

    if (this.playerRole === 'tetris') this.setupAIGunner();
    if (this.playerRole === 'gunner') this.setupAITetris();

    this.input.keyboard.on('keydown-ESC', () => this.togglePause());
    this.isPaused = false;
    this.matchTime = 0;
    this.timeScale = 1.0;
    this.isGameOverState = false;

    // Exit button
    const exitBtn = this.add.text(20, 20, 'EXIT GAME', { fontFamily: 'Orbitron', fontSize: '14px', color: '#ff4444', fontStyle: 'bold' })
      .setInteractive({ useHandCursor: true })
      .setDepth(100)
      .on('pointerdown', () => {
        if (this.playerRole === 'gunner' && this.input.mouse.locked) this.input.mouse.releasePointerLock();
        eventBus.emit(EVENTS.GAME_OVER, { winner: 'quit' });
      })
      .on('pointerover', () => exitBtn.setColor('#ffaaaa'))
      .on('pointerout', () => exitBtn.setColor('#ff4444'));

    // Prevent default browser actions for Ctrl + WASD to allow crouching and moving
    this._preventShortcuts = (e) => {
      if (e.ctrlKey && ['w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this._preventShortcuts, { passive: false });

    // Clean up when scene is destroyed
    this.events.on('shutdown', () => {
      window.removeEventListener('keydown', this._preventShortcuts);
      if (this._wheelListener) window.removeEventListener('wheel', this._wheelListener);
      if (this.htmlTimer) this.htmlTimer.style.display = 'none';
    });

    // Utility cooldowns (both roles track, gunner uses)
    this.utilityCooldowns = { grenade: 0, flashbang: 0, smoke: 0 };
    this._smokeOverlay = null;
    this._smokeTimer = 0;
    if (this.playerRole === 'gunner') {
      // Weapon Hotkeys
      this.input.keyboard.on('keydown-ONE', () => this.weaponSystem.switchWeapon('knife'));
      this.input.keyboard.on('keydown-TWO', () => this.weaponSystem.switchWeapon('deagle'));
      this.input.keyboard.on('keydown-THREE', () => this.weaponSystem.switchWeapon('ak47'));
      this.input.keyboard.on('keydown-FOUR', () => this.weaponSystem.switchWeapon('grenade'));
      this.input.keyboard.on('keydown-FIVE', () => this.weaponSystem.switchWeapon('flashbang'));
      this.input.keyboard.on('keydown-SIX', () => this.weaponSystem.switchWeapon('smoke'));

      // Debug Hotkeys for Weapon Cycling
      this.input.keyboard.on('keydown-Q', () => this.weaponSystem.previousWeapon());
      this.input.keyboard.on('keydown-E', () => this.weaponSystem.nextWeapon());

      this._wheelListener = (e) => {
        // Pure unthrottled wheel event to guarantee we don't drop any inputs
        if (e.deltaY > 0) {
          this.weaponSystem.nextWeapon();
        } else if (e.deltaY < 0) {
          this.weaponSystem.previousWeapon();
        }
      };
      // Passive: false ensures the browser can still cancel it if we needed to, but we don't.
      // We bind directly to the window to ensure NOTHING blocks the scroll input.
      window.addEventListener('wheel', this._wheelListener, { passive: true });
    }

    // Attempt to auto-lock the pointer for the gunner if the browser allows it (from previous click)
    if (this.playerRole === 'gunner') {
      this.time.delayedCall(100, () => {
        if (!this.input.mouse.locked) {
          try {
            this.input.mouse.requestPointerLock();
          } catch (e) {}
        }
      });
      
      // Hint text if lock fails
      this._lockHintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'CLICK SCREEN TO LOCK AIM', {
        fontFamily: 'Orbitron',
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(100);
      this._lockHintText.setVisible(!this.input.mouse.locked);
    }

  }

  /* ════════════════════ HUD ════════════════════ */
  createHUD() {
    const isTetris = this.playerRole === 'tetris';
    const isGunner = this.playerRole === 'gunner';
    const font = (sz, c='#667788') => ({ fontFamily:'Orbitron', fontSize:sz, color:c });
    const fontI = (sz, c='#445566') => ({ fontFamily:'Inter', fontSize:sz, color:c });

    this.abilityTexts = [];
    this.chargeText = null;
    this.weaponSlotTexts = {};
    this._utilTexts = [];

    // Timer (Use HTML overlay so it stays exactly at top even with F11 letterboxing)
    this.htmlTimer = document.getElementById('global-timer');
    if (this.htmlTimer) this.htmlTimer.style.display = 'block';

    // Gunner HP on bottom center
    // (Only show for gunner in 2D UI; Tetris player sees it on 3D Holographic screens)
    if (isGunner) {
      let y = GAME_HEIGHT - 60;
      this.add.text(GAME_WIDTH / 2, y, 'HP', font('11px')).setOrigin(0.5,0).setDepth(11);
      this.hpBarBgG = this.add.graphics().setDepth(11);
      this.hpBarFillG = this.add.graphics().setDepth(12);
      this.hpBarX = GAME_WIDTH / 2 - 150; 
      this.hpBarY = y + 16; 
      this.hpBarW = 300;
      this.hpBarBgG.fillStyle(0x1a1a2e, 0.8).fillRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, 14, 4);
      this.hpText = this.add.text(this.hpBarX + this.hpBarW + 10, y + 10, `${GUNNER_MAX_HP}`, font('12px', '#00ff88')).setDepth(11);
      this.regenText = this.add.text(this.hpBarX, y+35, '', fontI('9px','#00ff88')).setDepth(11);
      this.updateHPBar(GUNNER_MAX_HP, GUNNER_MAX_HP);
    }
  }

  updateHPBar(current, max, maxRegen = max) {
    if (!this.hpBarFillG) return;
    this.hpBarFillG.clear();
    const ratio = Math.max(0, current / max);
    const regenRatio = Math.max(0, maxRegen / max);
    
    // Draw burnt/lost permanent max HP
    const lostRatio = 1 - regenRatio;
    if (lostRatio > 0) {
      const lostW = this.hpBarW * lostRatio;
      const lostX = this.hpBarX + (this.hpBarW * regenRatio);
      this.hpBarFillG.fillStyle(0x330000, 0.8).fillRoundedRect(lostX, this.hpBarY, lostW, 14, 4);
    }
    
    // Draw current HP
    const w = this.hpBarW * ratio;
    const color = this.playerRole === 'tetris' ? 0xff2d55 : (ratio > 0.5 ? 0x00ff88 : ratio > 0.25 ? 0xffd700 : 0xff2d55);
    if (w > 0) {
      this.hpBarFillG.fillStyle(color, 1).fillRoundedRect(this.hpBarX, this.hpBarY, w, 14, 4);
    }
    this.hpBarFillG.fillStyle(color, 0.12).fillRoundedRect(this.hpBarX, this.hpBarY - 2, Math.max(0, w), 18, 4);
    if (this.hpText) {
      this.hpText.setText(`${Math.floor(current)}/${Math.floor(maxRegen)}`);
      this.hpText.setColor('#' + color.toString(16).padStart(6, '0'));
    }
  }

  /* ════════════════════ SHOOTING ════════════════════ */
  handleShot() {
    if (this.weaponSystem.isReloading) return;

    // Check if we are throwing a utility
    if (this.weaponSystem.currentWeapon === 'grenade') {
      if (this.utilityCooldowns.grenade <= 0) {
        this.useGrenade();
        this.weaponSystem.switchWeapon(this.weaponSystem.previousWeapon || 'deagle');
      }
      return;
    } else if (this.weaponSystem.currentWeapon === 'flashbang') {
      if (this.utilityCooldowns.flashbang <= 0) {
        this.useFlashbang();
        this.weaponSystem.switchWeapon(this.weaponSystem.previousWeapon || 'deagle');
      }
      return;
    } else if (this.weaponSystem.currentWeapon === 'smoke') {
      if (this.utilityCooldowns.smoke <= 0) {
        this.useSmoke();
        this.weaponSystem.switchWeapon(this.weaponSystem.previousWeapon || 'deagle');
      }
      return;
    }

    const result = this.weaponSystem.fire();
    if (!result) return;

    // Screen coordinates for hit markers (center of screen in FPS mode)
    let ex = GAME_WIDTH / 2;
    let ey = GAME_HEIGHT / 2;

    let theta = 0;
    if (this.weaponSystem.currentWeapon === 'knife') {
      theta = Math.random() * Math.PI;

      if (this.threeScene) {
        this.threeScene.triggerMeleeAnimation(theta);
      }
    } else {
      if (this.threeScene) {
        this.threeScene.spawnMuzzleFlash(this.weaponSystem.currentWeapon);
      }
    }
    const weapon = this.weaponSystem.getCurrentWeapon();
    let blockDamage = result.damage;
    if (weapon.blockDamagePercent !== undefined) {
      blockDamage = BLOCK_HP * (weapon.blockDamagePercent / 100);
    } else if (weapon.blockDamagePercentMax !== undefined && weapon.blockDamagePercentMin !== undefined) {
      const sprayRatio = Math.min(1, (result.shotIndex || 0) / (weapon.recoilPattern?.length || 30));
      const percent = weapon.blockDamagePercentMax - sprayRatio * (weapon.blockDamagePercentMax - weapon.blockDamagePercentMin);
      blockDamage = BLOCK_HP * (percent / 100);
    }

    let r = -1, c = -1;
    let hitBlock = null;

    // Use Three.js raycasting for hit detection
    if (this.threeScene) {
      hitBlock = this.threeScene.shootRaycast({
        x: result.recoilOffsetX,
        y: result.recoilOffsetY
      });
      if (hitBlock) {
        r = hitBlock.r;
        c = hitBlock.c;
        if (hitBlock.point) {
          if (weapon.id !== 'knife' && weapon.key !== 'knife' && this.weaponSystem.currentWeapon !== 'knife') {
            this.threeScene.spawnTracer(hitBlock.point);
          }
          this.threeScene.spawnBulletImpact(hitBlock.point, hitBlock.normal, hitBlock.mesh);
          
          // Project hit point to 2D screen space for accurate hit marker
          const screenPos = hitBlock.point.clone();
          const activeCamera = this.threeScene.isThirdPerson ? this.threeScene.thirdPersonCamera : this.threeScene.camera;
          screenPos.project(activeCamera);
          ex = (screenPos.x * 0.5 + 0.5) * GAME_WIDTH;
          ey = (1 - (screenPos.y * 0.5 + 0.5)) * GAME_HEIGHT;
        }
      }
    } else {
      if (ex >= ARENA_X && ex <= ARENA_X + TETRIS_COLS * CELL_SIZE && ey >= ARENA_Y && ey <= ARENA_Y + TETRIS_ROWS * CELL_SIZE) {
        c = Math.floor((ex - ARENA_X) / CELL_SIZE);
        r = Math.floor((ey - ARENA_Y) / CELL_SIZE);
      }
    }

    // AOE for knife (Random Slash Angle + Per-Block Crit)
    if (weapon.aoe > 0) {
      if (this.threeScene) {
        let point = hitBlock?.point;
        let normal = hitBlock?.normal;
        
        // If we missed all blocks and obstacles, we want an air slash close to the player.
        if (!hitBlock || (!hitBlock.isObstacle && hitBlock.r === -1) || !normal) {
           const activeCamera = this.threeScene.isThirdPerson ? this.threeScene.thirdPersonCamera : this.threeScene.camera;
           const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCamera.quaternion);
           point = activeCamera.position.clone().add(forward.multiplyScalar(4)); 
           normal = forward.clone().negate(); 
        }
        
        this.threeScene.spawnMeleeSlash(point, normal, theta);
      }

      let hitAny = false;
      let critAny = false;

      const centerR = r !== -1 ? r : Math.floor((ey - ARENA_Y) / CELL_SIZE);
      const centerC = c !== -1 ? c : Math.floor((ex - ARENA_X) / CELL_SIZE);
      
      // Retrieve the theta calculated earlier for sync
      const rad = 2; // radius of 2 for length of 5 blocks

      for (let rr = -rad; rr <= rad; rr++) {
        for (let cc = -rad; cc <= rad; cc++) {
          if (rr*rr + cc*cc > rad*rad) continue; // Must be within circle
          
          // Check distance to the angled slash line
          const distToLine = Math.abs(cc * Math.sin(theta) - rr * Math.cos(theta));
          
          // A distance of ~0.9 captures the main line and some adjacent blocks (around 8-9 blocks total)
          if (distToLine <= 0.9) {
            const tr = centerR+rr, tc = centerC+cc;
            
            // Random crit per block
            const isCrit = Math.random() < 0.3;
            if (isCrit) critAny = true;
            const finalDamage = isCrit ? blockDamage * 2 : blockDamage;

            if (this.tetrisBoard.damageFallingPiece(tr, tc, finalDamage)) hitAny = true;
            else if (tr >= 0 && tr < TETRIS_ROWS && tc >= 0 && tc < TETRIS_COLS && this.tetrisBoard.grid[tr]?.[tc]) {
              this.tetrisBoard.damageBlock(tr, tc, finalDamage);
              hitAny = true;
            }
          }
        }
      }

      if (hitAny) {
        this.gunnerOverlay.showHitMarker(ex, ey, true);
        if (critAny && this.playerRole === 'gunner') {
          const txt = this.add.text(ex, ey-20, 'CRIT!', { fontFamily:'Orbitron', fontSize:'18px', fontStyle: 'bold', color:'#ff0000', stroke:'#ffffff', strokeThickness:3 }).setOrigin(0.5).setDepth(70);
          this.tweens.add({ targets:txt, alpha:0, y:ey-50, scale: 1.5, duration:800, onComplete:()=>txt.destroy() });
        }
      }
      return;
    }

    let hit = false;
    if (r !== -1 && c !== -1) {
      if (this.tetrisBoard.damageFallingPiece(r, c, blockDamage)) {
        hit = true; this.gunnerOverlay.showHitMarker(ex, ey, false);
      } else if (r >= 0 && r < TETRIS_ROWS && c >= 0 && c < TETRIS_COLS) {
        const cell = this.tetrisBoard.grid[r]?.[c];
        if (cell) {
          const color = cell.color;
          const destroyed = this.tetrisBoard.damageBlock(r, c, blockDamage);
          hit = true; this.gunnerOverlay.showHitMarker(ex, ey, destroyed);
          
          if (this.threeScene) {
            this.threeScene.spawnBlockDebris(c, TETRIS_ROWS - 1 - r, 0, color, destroyed ? 15 : 4);
          }

          if (cell.iron) {
            const txt = this.add.text(ex, ey-10, 'IRON', { fontFamily:'Orbitron', fontSize:'10px', color:'#aabbcc', stroke:'#000', strokeThickness:2 }).setOrigin(0.5).setDepth(70);
            this.tweens.add({ targets:txt, alpha:0, y:ey-30, duration:500, onComplete:()=>txt.destroy() });
          }
        }
      }
    }
  }

  /* ════════════════ UTILITIES ════════════════ */
  useGrenade() {
    if (this.utilityCooldowns.grenade > 0) return;
    this.utilityCooldowns.grenade = GUNNER_UTILITIES.grenade.cooldown;
    const rad = GUNNER_UTILITIES.grenade.radius, dmg = GUNNER_UTILITIES.grenade.damage;

    if (this.threeScene) {
      this.threeScene.throwProjectile('grenade', (hitCol, hitRow, hitPos) => {
        // Destroy blocks in radius
        for (let r = -Math.ceil(rad); r <= Math.ceil(rad); r++) {
          for (let c = -Math.ceil(rad); c <= Math.ceil(rad); c++) {
            if (r*r + c*c > rad*rad) continue;
            const tr = hitRow + r, tc = hitCol + c;
            this.tetrisBoard.damageFallingPiece(tr, tc, dmg);
            if (tr >= 0 && tr < TETRIS_ROWS && tc >= 0 && tc < TETRIS_COLS) {
              const cell = this.tetrisBoard.grid[tr]?.[tc];
              if (cell) {
                const destroyed = this.tetrisBoard.damageBlock(tr, tc, dmg);
                this.threeScene.spawnBlockDebris(tc, TETRIS_ROWS - 1 - tr, 0, cell.color, destroyed ? 15 : 4);
              }
            }
          }
        }
        // Visual: explosion
        const exX = hitPos ? hitPos.x : hitCol;
        const exY = hitPos ? hitPos.y : TETRIS_ROWS - 1 - hitRow;
        const exZ = hitPos ? hitPos.z : 0;
        this.threeScene.spawnGrenadeExplosion(exX, exY, exZ, rad);
        this.cameras.main.shake(300, 0.015);
      });
    }
  }

  useFlashbang() {
    if (this.utilityCooldowns.flashbang > 0) return;
    this.utilityCooldowns.flashbang = GUNNER_UTILITIES.flashbang.cooldown;
    const dur = GUNNER_UTILITIES.flashbang.duration;

    if (this.threeScene) {
      this.threeScene.throwProjectile('flashbang', (hitCol, hitRow, hitPos) => {
        let flashMultiplier = 1.0;
        
        // Directional flash check for Gunner
        if (this.playerRole === 'gunner' && hitPos) {
          const camPos = this.threeScene.camera.position;
          const camDir = new THREE.Vector3();
          this.threeScene.camera.getWorldDirection(camDir);
          
          const toFlash = new THREE.Vector3().subVectors(hitPos, camPos).normalize();
          const dot = camDir.dot(toFlash);
          
          if (dot < 0) {
            flashMultiplier = 0.15; // Looking entirely away
          } else if (dot < 0.6) {
            flashMultiplier = 0.15 + (dot / 0.6) * 0.4; // Looking somewhat away
          } else {
            flashMultiplier = 0.55 + ((dot - 0.6) / 0.4) * 0.45; // Looking directly at it
          }
        }
        
        const finalDur = dur * flashMultiplier;
        const maxAlpha = 0.95 * flashMultiplier;

        // White flash covering the whole screen
        const flash = this.add.graphics().setDepth(100);
        flash.fillStyle(0xffffff, maxAlpha);
        flash.fillRect(-200, -200, GAME_WIDTH + 400, GAME_HEIGHT + 400);
        flash.setScrollFactor(0);
        this.tweens.add({ targets: flash, alpha: 0, duration: finalDur, ease: 'Power2', onComplete: () => flash.destroy() });
        this.cameras.main.shake(100, 0.005);
      });
    }
  }

  useSmoke() {
    if (this.utilityCooldowns.smoke > 0) return;
    this.utilityCooldowns.smoke = GUNNER_UTILITIES.smoke.cooldown;
    const dur = GUNNER_UTILITIES.smoke.duration;
    const rad = GUNNER_UTILITIES.smoke.radius * CELL_SIZE;

    if (this.threeScene) {
      this.threeScene.throwProjectile('smoke', (hitCol, hitRow, hitPos) => {
        // Visual: 3D Smoke
        const exX = hitPos ? hitPos.x : hitCol;
        const exY = hitPos ? hitPos.y : TETRIS_ROWS - 1 - hitRow;
        const exZ = hitPos ? hitPos.z : 0;
        this.threeScene.spawnSmoke(exX, exY, exZ, rad / CELL_SIZE);
        this._smokeTimer = dur;
      });
    }
  }

  /* ════════════════════ EFFECTS ════════════════════ */
  flashAbility(msg, color) {
    const t = this.add.text(GAME_WIDTH / 2, ARENA_Y + 80, msg, {
      fontFamily: 'Orbitron', fontSize: '22px', fontStyle: 'bold',
      color: color, stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(90);
    this.tweens.add({
      targets: t, alpha: 0, y: ARENA_Y + 40, scale: 1.3,
      duration: 1000, ease: 'Power2', onComplete: () => t.destroy(),
    });
    // Edge flash for activation
    if (color !== '#ff4444') {
      const flash = this.add.graphics().setDepth(85);
      const c = Phaser.Display.Color.HexStringToColor(color).color;
      flash.fillStyle(c, 0.15);
      flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
    }
  }

  showDamageNumber(damage, combo) {
    if (this.playerRole !== 'gunner') return;
    const text = combo > 1 ? `-${damage} HP (${combo}× COMBO!)` : `-${damage} HP`;
    const color = combo > 1 ? '#ffd700' : '#ff2d55';
    const d = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2, text, { fontFamily:'Orbitron', fontSize: combo>1?'26px':'20px', fontStyle:'bold', color, stroke:'#000', strokeThickness:3 }).setOrigin(0.5).setDepth(80);
    this.tweens.add({ targets:d, alpha:0, y:GAME_HEIGHT/2-50, scale:1.2, duration:900, ease:'Power2', onComplete:()=>d.destroy() });
  }

  showAbilityNotice(ability) {
    const names = { ironBlock:'IRON BLOCK ACTIVE', shield:'SHIELD ACTIVATED', repair:'BLOCKS REPAIRED', lineBomb:'LINE BOMB!' };
    const t = this.add.text(GAME_WIDTH/2, ARENA_Y-20, names[ability]||ability, { fontFamily:'Orbitron', fontSize:'16px', fontStyle:'bold', color:'#ffd700', stroke:'#000', strokeThickness:3 }).setOrigin(0.5).setDepth(80);
    this.tweens.add({ targets:t, alpha:0, y:ARENA_Y-50, duration:1200, onComplete:()=>t.destroy() });
  }

  onLineClear(data) {
    const names = { 1:'SINGLE', 2:'DOUBLE', 3:'TRIPLE', 4:'TETRIS!' };
    const color = data.count>=4?'#ffd700':data.count>=3?'#bb44ff':'#00d4ff';
    if (this.playerRole === 'tetris') {
      const t = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2-30, names[data.count]||'CLEAR', { fontFamily:'Orbitron', fontSize:data.count>=4?'34px':'22px', fontStyle:'bold', color, stroke:'#000', strokeThickness:4 }).setOrigin(0.5).setDepth(80);
      this.tweens.add({ targets:t, alpha:0, y:GAME_HEIGHT/2-80, scale:1.4, duration:800, ease:'Power2', onComplete:()=>t.destroy() });
    }
    if (data.count >= 3) this.cameras.main.shake(200, data.count >= 4 ? 0.01 : 0.005);

    // Parkour Course Mechanic
    if (this.threeScene) {
      const difficulty = this.tetrisBoard ? this.tetrisBoard.level : 1;
      
      let lastType = 0;
      for (let i = 0; i < data.count; i++) {
        this.time.delayedCall(i * 800, () => {
          // Pick a random obstacle type (1, 2, or 3) and prevent repeats in the same burst
          let type = Phaser.Math.Between(1, 3);
          while (type === lastType && data.count > 1) {
            type = Phaser.Math.Between(1, 3);
          }
          lastType = type;
          this.threeScene.spawnParkourObstacle(type, difficulty);
        });
      }
    }
  }

  onGameOver(data) {
    if (this.isGameOverState) return;
    this.isGameOverState = true;
    
    // Slow motion effect over 2 seconds
    this.tweens.add({
      targets: this,
      timeScale: 0,
      duration: 2000,
      ease: 'Power2'
    });

    this.time.delayedCall(2500, () => {
      this.scene.start(SCENES.GAMEOVER, { winner:data.winner, playerRole:this.playerRole, score:this.tetrisBoard.score, lines:this.tetrisBoard.linesCleared, level:this.tetrisBoard.level, gunnerHP:Math.floor(this.bridge.getGunnerHP()), matchTime:this.matchTime });
    });
  }

  /* ════════════════════ AI ════════════════════ */
  setupAIGunner() {
    // Main shooting loop
    this.time.addEvent({ delay: 150, loop:true, callback:()=>{
      if (this.tetrisBoard.isGameOver) return;
      const board = this.tetrisBoard;
      let tr, tc;

      // 65% target falling piece, 35% locked blocks
      if (Math.random() < 0.65 && board.currentPiece) {
        const shape = board.getShape();
        const cells = [];
        for (let r=0;r<shape.length;r++) for(let c=0;c<shape[r].length;c++)
          if (shape[r][c]) cells.push({ r: board.pieceRow+r, c: board.pieceCol+c });
        if (cells.length > 0) { const t = cells[Math.floor(Math.random()*cells.length)]; tr = t.r; tc = t.c; }
      } else {
        const filled = [];
        for (let r=0;r<TETRIS_ROWS;r++) for(let c=0;c<TETRIS_COLS;c++) if(board.grid[r][c]) filled.push({r,c});
        if (filled.length > 0) { const t = filled[Math.floor(Math.random()*filled.length)]; tr = t.r; tc = t.c; }
      }

      if (tr !== undefined) {
        const sx = ARENA_X + tc*CELL_SIZE + CELL_SIZE/2, sy = ARENA_Y + tr*CELL_SIZE + CELL_SIZE/2;
        this.gunnerOverlay.updateCrosshair(sx, sy);
        const res = this.weaponSystem.fire();
        if (res) {
          this.gunnerOverlay.muzzleFlash(this.weaponSystem.currentWeapon);
          board.damageFallingPiece(tr, tc, res.damage);
          board.damageBlock(tr, tc, res.damage);
        }
      }
    }});

    // Strategic utility + weapon switching (every 2-4 seconds, with thought)
    this.time.addEvent({ delay: 2500, loop:true, callback:()=>{
      if (this.tetrisBoard.isGameOver) return;
      const board = this.tetrisBoard;

      // Count filled cells to gauge board state
      let filledCount = 0, highestRow = TETRIS_ROWS;
      for (let r=0;r<TETRIS_ROWS;r++) for(let c=0;c<TETRIS_COLS;c++) {
        if (board.grid[r][c]) { filledCount++; if (r < highestRow) highestRow = r; }
      }

      // Grenade: use when there's a dense cluster (lots of blocks)
      if (filledCount > 30 && this.utilityCooldowns.grenade <= 0 && Math.random() < 0.4) {
        // Aim at the densest area
        let bestR = TETRIS_ROWS-3, bestC = 5, bestDensity = 0;
        for (let r = 5; r < TETRIS_ROWS-2; r += 2) {
          for (let c = 2; c < TETRIS_COLS-2; c += 2) {
            let density = 0;
            for (let dr=-2;dr<=2;dr++) for(let dc=-2;dc<=2;dc++) {
              if (board.grid[r+dr]?.[c+dc]) density++;
            }
            if (density > bestDensity) { bestDensity = density; bestR = r; bestC = c; }
          }
        }
        this.gunnerOverlay.updateCrosshair(ARENA_X + bestC*CELL_SIZE + CELL_SIZE/2, ARENA_Y + bestR*CELL_SIZE + CELL_SIZE/2);
        this.useGrenade();
        return;
      }

      // Flashbang: use when board is getting dangerously tall
      if (highestRow < 6 && this.utilityCooldowns.flashbang <= 0 && Math.random() < 0.5) {
        this.useFlashbang();
        return;
      }

      // Smoke: use on the falling piece area to confuse
      if (board.currentPiece && this.utilityCooldowns.smoke <= 0 && Math.random() < 0.3) {
        const sx = ARENA_X + board.pieceCol * CELL_SIZE + CELL_SIZE*2;
        const sy = ARENA_Y + board.pieceRow * CELL_SIZE + CELL_SIZE*2;
        this.gunnerOverlay.updateCrosshair(sx, sy);
        this.useSmoke();
        return;
      }

      // Weapon switching: prefer deagle for accuracy, ak for suppression
      if (filledCount > 40 && this.weaponSystem.currentWeapon !== 'ak47') {
        this.weaponSystem.switchWeapon('ak47');
      } else if (filledCount <= 20 && this.weaponSystem.currentWeapon !== 'deagle') {
        this.weaponSystem.switchWeapon('deagle');
      }
    }});
  }

  setupAITetris() {
    // Strategic skill usage (every 2 seconds)
    this.time.addEvent({ delay: 2000, loop: true, callback: () => {
      if (this.tetrisBoard.isGameOver) return;
      const board = this.tetrisBoard;

      let filledCount = 0;
      let highestFilledRow = TETRIS_ROWS;
      let totalDamage = 0;
      
      for (let r = 0; r < TETRIS_ROWS; r++) {
        for (let c = 0; c < TETRIS_COLS; c++) {
          if (board.grid[r][c]) {
            filledCount++;
            highestFilledRow = Math.min(highestFilledRow, r);
            totalDamage += (board.grid[r][c].maxHp - board.grid[r][c].hp);
          }
        }
      }

      // Seismic Purge: If board is getting full (highest filled row < 8)
      if (highestFilledRow < 8 && Math.random() < 0.6) board.activateSeismicPurge();
      
      // Repair: If there is a lot of damaged blocks
      if (totalDamage > 150 && Math.random() < 0.6) board.activateRepair();
      
      // Iron Body: If there's a decent amount of blocks
      if (filledCount > 20 && Math.random() < 0.4) board.activateIronBody();
      
      // Shield: If falling piece is vulnerable high up
      if (board.currentPiece && board.pieceRow < 5 && Math.random() < 0.5) board.activateShield();
    }});

    // Smart AI: finds best column, moves there, then drops
    this._aiTarget = null;
    this.time.addEvent({ delay: 120, loop:true, callback:()=>{
      if (this.tetrisBoard.isGameOver) return;
      const board = this.tetrisBoard;
      if (!board.currentPiece) return;

      // Pick a target column if we don't have one
      if (this._aiTarget === null) {
        let bestCol = board.pieceCol, bestScore = -Infinity;
        for (let rot = 0; rot < 4; rot++) {
          const shape = board.getShape(board.currentPiece, rot);
          if (!shape) continue;
          for (let col = -2; col < TETRIS_COLS; col++) {
            // Check if position is valid at the top
            if (!board.isValidPosition(0, col, rot)) continue;
            // Simulate drop
            let dropRow = 0;
            while (board.isValidPosition(dropRow + 1, col, rot)) dropRow++;
            // Create a virtual grid to evaluate
            let vGrid = board.grid.map(row => [...row]);
            for (let r = 0; r < shape.length; r++) {
              for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c]) {
                  const gr = dropRow + r;
                  const gc = col + c;
                  if (gr >= 0 && gr < TETRIS_ROWS && gc >= 0 && gc < TETRIS_COLS) {
                    vGrid[gr][gc] = 1;
                  }
                }
              }
            }
            
            let lines = 0;
            let aggHeight = 0;
            let heights = Array(TETRIS_COLS).fill(0);
            
            for (let r = 0; r < TETRIS_ROWS; r++) {
              let isLine = true;
              for (let c = 0; c < TETRIS_COLS; c++) {
                if (!vGrid[r][c]) isLine = false;
                else if (heights[c] === 0) heights[c] = TETRIS_ROWS - r;
              }
              if (isLine) lines++;
            }
            
            let holes = 0;
            for (let c = 0; c < TETRIS_COLS; c++) {
              aggHeight += heights[c];
              let blockFound = false;
              for (let r = 0; r < TETRIS_ROWS; r++) {
                if (vGrid[r][c]) blockFound = true;
                else if (blockFound) holes++;
              }
            }
            
            let bumpiness = 0;
            for (let c = 0; c < TETRIS_COLS - 1; c++) {
              bumpiness += Math.abs(heights[c] - heights[c + 1]);
            }
            
            let score = (lines * 760) - (holes * 350) - (bumpiness * 180) - (aggHeight * 510);
            if (score > bestScore) { bestScore = score; bestCol = col; this._aiTargetRot = rot; }
          }
        }
        this._aiTarget = bestCol;
      }

      // Rotate to target
      if (board.rotation !== (this._aiTargetRot || 0)) {
        board.rotate(1);
        return;
      }
      // Move toward target column
      if (board.pieceCol < this._aiTarget) { board.moveRight(); return; }
      if (board.pieceCol > this._aiTarget) { board.moveLeft(); return; }
      // At target — hard drop
      board.hardDrop();
      this._aiTarget = null;
    }});
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.tetrisBoard.isPaused = this.isPaused;
    if (this.isPaused) {
      this.pauseOverlay = this.add.graphics().setDepth(90);
      this.pauseOverlay.fillStyle(0x000000, 0.75).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.pauseText = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2, 'PAUSED', { fontFamily:'Orbitron', fontSize:'40px', fontStyle:'bold', color:'#ffffff' }).setOrigin(0.5).setDepth(91);
      this.resumeHint = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2+45, 'Press ESC to resume', { fontFamily:'Inter', fontSize:'14px', color:'#8899aa' }).setOrigin(0.5).setDepth(91);
    } else {
      if(this.pauseOverlay) this.pauseOverlay.destroy();
      if(this.pauseText) this.pauseText.destroy();
      if(this.resumeHint) this.resumeHint.destroy();
    }
  }

  /* ════════════════════ UPDATE LOOP ════════════════════ */
  update(time, delta) {
    if (this.isPaused) return;
    
    // Toggle pointer lock hint
    if (this._lockHintText) {
      this._lockHintText.setVisible(!this.input.mouse.locked);
    }
    
    // In game over state, wait for timeScale to reach 0 before stopping update completely
    if (this.isGameOverState && this.timeScale <= 0.01) return;

    const scaledDelta = delta * this.timeScale;

    this.matchTime += scaledDelta / 1000;
    if (this.htmlTimer) {
      this.htmlTimer.innerText = `${Math.floor(this.matchTime/60).toString().padStart(2,'0')}:${Math.floor(this.matchTime%60).toString().padStart(2,'0')}`;
    }

    const gunnerHP = this.bridge.getGunnerHP();
    this.tetrisBoard.update(scaledDelta, gunnerHP, this.matchTime);
    if (this.tetrisController) this.tetrisController.update(scaledDelta);
    this.weaponSystem.update(scaledDelta);
    this.bridge.update(scaledDelta);

    // Auto-fire AK-47
    if (this.playerRole === 'gunner' && this.isFiringHeld && this.weaponSystem.currentWeapon === 'ak47' && !this.isGameOverState) {
      const ptr = this.input.activePointer;
      if (ptr.isDown) this.handleShot();
    }

    // Update Three.js 3D scene
    if (this.threeScene) {
      const recoilOffset = this.playerRole === 'gunner' ? this.weaponSystem.recoilOffset : { x: 0, y: 0 };
      this.threeScene.update(scaledDelta, this.tetrisBoard, recoilOffset);
      
      const uiState = {
        score: this.tetrisBoard.score,
        level: this.tetrisBoard.level,
        lines: this.tetrisBoard.linesCleared,
        gunnerHP: gunnerHP,
        gunnerMaxRegenHP: this.bridge.gunnerMaxRegenHP,
        abilities: [
          { key: 'A', name: 'Iron Body', color: '#ffaa00', cooldown: this.tetrisBoard.cooldowns['A'] || 0 },
          { key: 'S', name: 'Shield', color: '#00d4ff', cooldown: this.tetrisBoard.cooldowns['S'] || 0 },
          { key: 'D', name: 'Repair', color: '#00ff88', cooldown: this.tetrisBoard.cooldowns['D'] || 0 },
          { key: 'F', name: 'Seismic Purge', color: '#ff8800', cooldown: this.tetrisBoard.cooldowns['F'] || 0 }
        ],
        ironBodyActive: this.tetrisBoard.ironBodyActive,
        ironBodyTimer: this.tetrisBoard.ironBodyTimer,
        shieldHP: this.tetrisBoard.pieceShieldHP,
        heldPiece: this.tetrisBoard.heldPiece,
        nextPieces: this.tetrisBoard.nextPieces
      };
      this.threeScene.updateUI(uiState);
    }
    // TetrisRenderer handles 2D previews only (effectGraphics cleared inside render)
    this.tetrisRenderer.render(this.tetrisBoard);
    
    this.gunnerOverlay.render(this.weaponSystem);

    // Gunner crosshair uses raycast coords for 3D
    if (this.playerRole === 'gunner' && !this.input.mouse.locked) {
      this.gunnerOverlay.updateCrosshair(this.input.activePointer.x, this.input.activePointer.y);
    }
    // Update HUD texts (safe check)
    if (this.scoreText) this.scoreText.setText(this.tetrisBoard.score.toString());
    if (this.levelText) this.levelText.setText(this.tetrisBoard.level.toString());
    if (this.linesText) this.linesText.setText(this.tetrisBoard.linesCleared.toString());

    if (this.ironIndicator) this.ironIndicator.setText(this.tetrisBoard.ironBodyActive ? `🛡 Iron Body (${Math.ceil(this.tetrisBoard.ironBodyTimer/1000)}s)` : '');
    if (this.shieldIndicator) this.shieldIndicator.setText(this.tetrisBoard.pieceShieldHP > 0 ? `✨ Shield Aura (${Math.floor(this.tetrisBoard.pieceShieldHP)} HP)` : '');

    // HP regen
    const hp = Math.floor(this.bridge.getGunnerHP());
    this.updateHPBar(hp, GUNNER_MAX_HP, this.bridge.gunnerMaxRegenHP);
    if (this.regenText) {
      this.regenText.setText(this.bridge.regenActive ? '♥ REGENERATING...' : '');
      if (this.bridge.regenActive) {
        this.regenText.setAlpha(0.6 + 0.4 * Math.sin(Date.now() / 150));
      } else {
        this.regenText.setAlpha(1);
      }
    }

    // Utility cooldowns
    for (const key of Object.keys(this.utilityCooldowns)) {
      if (this.utilityCooldowns[key] > 0) this.utilityCooldowns[key] -= scaledDelta;
    }

    // Smoke timer
    if (this._smokeOverlay && this._smokeTimer > 0) {
      this._smokeTimer -= scaledDelta;
      if (this._smokeTimer <= 0) { this._smokeOverlay.destroy(); this._smokeOverlay = null; }
      else { this._smokeOverlay.setAlpha(Math.min(1, this._smokeTimer / 1000)); }
    }

    // Utility HUD (show for gunner)
    if (this._utilTexts) {
      this._utilTexts.forEach(u => {
        const cd = this.utilityCooldowns[u.key];
        if (cd > 0) { u.text.setText(`[${u.num}] ${u.icon} ${u.name} (${Math.ceil(cd/1000)}s)`); u.text.setColor('#334455'); }
        else { u.text.setText(`[${u.num}] ${u.icon} ${u.name} (RDY)`); u.text.setColor('#00ff88'); }
      });
    }
  }
}
