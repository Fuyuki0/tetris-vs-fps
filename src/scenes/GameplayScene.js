import Phaser from 'phaser';
import { COLORS, SCENES, EVENTS, GAME_WIDTH, GAME_HEIGHT, ARENA_X, ARENA_Y, CELL_SIZE, TETRIS_COLS, TETRIS_ROWS, GUNNER_MAX_HP, BLOCK_HP, GUNNER_UTILITIES } from '../config/constants.js';
import TetrisBoard from '../gameplay/tetris/TetrisBoard.js';
import TetrisRenderer from '../gameplay/tetris/TetrisRenderer.js';
import TetrisController from '../gameplay/tetris/TetrisController.js';
import GunnerOverlay from '../gameplay/gunner/GunnerOverlay.js';
import WeaponSystem from '../gameplay/gunner/WeaponSystem.js';
import GameBridge from '../gameplay/bridge/GameBridge.js';
import eventBus from '../gameplay/bridge/EventBus.js';
import DoomRenderer from '../gameplay/gunner/DoomRenderer.js';

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
    if (this.playerRole !== 'gunner') {
      this.cameras.main.setBackgroundColor(COLORS.BG_DARK);
    } else {
      this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    }
    this.cameras.main.fadeIn(500);
    eventBus.removeAll();

    this.tetrisBoard = new TetrisBoard();
    this.bridge = new GameBridge(this);
    this.tetrisRenderer = new TetrisRenderer(this);
    this.gunnerOverlay = new GunnerOverlay(this);
    this.weaponSystem = new WeaponSystem(this);

    // Preview positions
    this.holdPos = { x: LP_X + LP_W / 2, y: ARENA_Y + 55 };
    this.nextQueueX = RP_X + RP_W / 2;
    this.nextStartY = ARENA_Y + 50;
    this.nextSpacing = 85;

    // Controls
    if (this.playerRole === 'tetris') {
      this.tetrisController = new TetrisController(this, this.tetrisBoard);

      // Ability keybinds — use addKey for reliability
      const keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
      const keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      const keyF = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
      const keyG = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);

      keyQ.on('down', () => {
        if (this.tetrisBoard.activateIronBody()) this.flashAbility('Iron Body ACTIVE! (6s)', '#ffaa00');
        else this.flashAbility('Iron Body on cooldown', '#ff4444');
      });
      keyE.on('down', () => {
        if (this.tetrisBoard.activateShield()) this.flashAbility('Shield Aura ACTIVE!', '#00d4ff');
        else this.flashAbility('Shield on cooldown', '#ff4444');
      });
      keyF.on('down', () => {
        if (this.tetrisBoard.activateRepair()) this.flashAbility('Blocks Repaired! +30 HP', '#00ff88');
        else this.flashAbility('Repair on cooldown', '#ff4444');
      });
      keyG.on('down', () => {
        if (this.tetrisBoard.activateSeismicPurge()) { this.flashAbility('SEISMIC PURGE!', '#ff8800'); this.cameras.main.shake(400, 0.02); }
        else this.flashAbility('Seismic Purge on cooldown', '#ff4444');
      });
    }

    // Both roles see gunner crosshair + weapon
    this.gunnerOverlay.setVisible(true);
    if (this.playerRole === 'gunner') {
      // Hide OS cursor, use game crosshair
      this.game.canvas.style.cursor = 'none';
      
      // Hide flat 2D board, enable Doom 3D renderer
      this.tetrisRenderer.setVisible(false);
      this.doomRenderer = new DoomRenderer(this);
      
      this.input.on('pointermove', (p) => {
        this.gunnerOverlay.updateCrosshair(p.x, p.y);
      });
      
      this.input.on('pointerdown', (p) => {
        this.isFiringHeld = true;
        this.handleShot(this.gunnerOverlay.crosshairX, this.gunnerOverlay.crosshairY);
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

    // Utility cooldowns (both roles track, gunner uses)
    this.utilityCooldowns = { grenade: 0, flashbang: 0, smoke: 0 };
    this._smokeOverlay = null;
    this._smokeTimer = 0;
    if (this.playerRole === 'gunner') {
      this.input.keyboard.on('keydown-FOUR', () => this.useGrenade());
      this.input.keyboard.on('keydown-FIVE', () => this.useFlashbang());
      this.input.keyboard.on('keydown-SIX', () => this.useSmoke());
    }
  }

  /* ════════════════════ HUD ════════════════════ */
  createHUD() {
    const isTetris = this.playerRole === 'tetris';
    const isGunner = this.playerRole === 'gunner';
    const font = (sz, c='#667788') => ({ fontFamily:'Orbitron', fontSize:sz, color:c });
    const fontI = (sz, c='#445566') => ({ fontFamily:'Inter', fontSize:sz, color:c });

    // ── Left Panel ──
    const lpG = this.add.graphics().setDepth(10);
    lpG.fillStyle(0x0a0e1a, 0.85).fillRoundedRect(LP_X, 10, LP_W, GAME_HEIGHT - 20, 8);
    lpG.lineStyle(1, COLORS.ACCENT_BLUE, 0.2).strokeRoundedRect(LP_X, 10, LP_W, GAME_HEIGHT - 20, 8);

    // HOLD block
    this.add.text(this.holdPos.x, ARENA_Y + 10, 'HOLD', font('11px')).setOrigin(0.5,0).setDepth(11);

    // Score/Level/Lines below hold
    let y = ARENA_Y + 140;
    this.add.text(LP_X+15, y, 'SCORE', font('9px','#556677')).setDepth(11);
    this.scoreText = this.add.text(LP_X+15, y+14, '0', font('18px','#00d4ff')).setDepth(11);
    y += 48;
    this.add.text(LP_X+15, y, 'LEVEL', font('9px','#556677')).setDepth(11);
    this.levelText = this.add.text(LP_X+15, y+14, '1', font('18px','#ffd700')).setDepth(11);
    y += 48;
    this.add.text(LP_X+15, y, 'LINES', font('9px','#556677')).setDepth(11);
    this.linesText = this.add.text(LP_X+15, y+14, '0', font('18px','#00ff88')).setDepth(11);

    // Abilities (tetris only)
    this.abilityTexts = [];
    this.chargeText = null;
    if (isTetris) {
      y += 55;
      this.add.text(LP_X+15, y, 'ABILITIES', font('9px','#556677')).setDepth(11);
      y += 18;
      const abils = [
        { key:'Q', name:'Iron Body', color:'#ffaa00' },
        { key:'E', name:'Shield', color:'#00d4ff' },
        { key:'F', name:'Repair', color:'#00ff88' },
        { key:'G', name:'Seismic Purge', color:'#ff8800' },
      ];
      abils.forEach(a => {
        const t = this.add.text(LP_X+15, y, `[${a.key}] ${a.name}`, fontI('11px')).setDepth(11);
        this.abilityTexts.push({ text: t, key: a.key, name: a.name, activeColor: a.color });
        y += 24;
      });
    }

    // Gunner HP on left panel bottom
    y = BOARD_BOTTOM - 65;
    this.add.text(LP_X+15, y, 'GUNNER HP', font('9px')).setDepth(11);
    this.hpBarBgG = this.add.graphics().setDepth(11);
    this.hpBarFillG = this.add.graphics().setDepth(12);
    this.hpBarX = LP_X + 15; this.hpBarY = y + 16; this.hpBarW = LP_W - 30;
    this.hpBarBgG.fillStyle(0x1a1a2e, 0.8).fillRoundedRect(this.hpBarX, this.hpBarY, this.hpBarW, 14, 4);
    this.hpText = this.add.text(LP_X + LP_W - 15, y, `${GUNNER_MAX_HP}`, font('9px','#00ff88')).setOrigin(1,0).setDepth(11);
    this.regenText = this.add.text(LP_X+15, y+35, '', fontI('9px','#00ff88')).setDepth(11);
    this.updateHPBar(GUNNER_MAX_HP, GUNNER_MAX_HP);

    // ── Right Panel ──
    const rpG = this.add.graphics().setDepth(10);
    rpG.fillStyle(0x0a0e1a, 0.85).fillRoundedRect(RP_X, 10, RP_W, GAME_HEIGHT - 20, 8);
    rpG.lineStyle(1, COLORS.ACCENT_PINK, 0.2).strokeRoundedRect(RP_X, 10, RP_W, GAME_HEIGHT - 20, 8);

    // NEXT label
    this.add.text(this.nextQueueX, ARENA_Y + 10, 'NEXT', font('11px')).setOrigin(0.5,0).setDepth(11);

    // Weapon slots + status below queue
    this.weaponSlotTexts = {};
    let wy = ARENA_Y + 480;
    if (isGunner) {
      this.add.text(RP_X+15, wy, 'WEAPONS', font('9px')).setDepth(11);
      wy += 16;
      [{ key:'knife', label:'[1] 🔪 Knife' }, { key:'deagle', label:'[2] 🔫 Deagle' }, { key:'ak47', label:'[3] 🔫 AK-47' }].forEach(s => {
        this.weaponSlotTexts[s.key] = this.add.text(RP_X+15, wy, s.label, fontI('11px','#556677')).setDepth(11);
        wy += 20;
      });
      wy += 10;
      // Utility slots
      this.add.text(RP_X+15, wy, 'UTILITIES', font('9px')).setDepth(11);
      wy += 16;
      this._utilTexts = [];
      [{ key:'grenade', num:'4', name:'Grenade', icon:'💣' },
       { key:'flashbang', num:'5', name:'Flash', icon:'✨' },
       { key:'smoke', num:'6', name:'Smoke', icon:'💨' }].forEach(u => {
        const t = this.add.text(RP_X+15, wy, `[${u.num}] ${u.icon} ${u.name} (RDY)`, fontI('11px','#00ff88')).setDepth(11);
        this._utilTexts.push({ text: t, ...u });
        wy += 20;
      });
      wy += 8;
    } else {
      this._utilTexts = [];
    }

    // Status indicators
    this.add.text(RP_X+15, wy, isTetris ? 'GUNNER STATUS' : 'ENEMY SKILLS', font('9px')).setDepth(11);
    this.ironIndicator = this.add.text(RP_X+15, wy+16, '', fontI('10px','#aabbcc')).setDepth(11);
    this.shieldIndicator = this.add.text(RP_X+15, wy+32, '', fontI('10px','#00d4ff')).setDepth(11);

    // Timer
    this.timerText = this.add.text(GAME_WIDTH/2, 8, '00:00', font('13px','#334455')).setOrigin(0.5,0).setDepth(11);
  }

  updateHPBar(current, max, maxRegen = max) {
    this.hpBarFillG.clear();
    const ratio = Math.max(0, current / max);
    const regenRatio = Math.max(0, maxRegen / max);
    
    // Draw burnt/lost permanent max HP
    const lostRatio = 1 - regenRatio;
    if (lostRatio > 0) {
      const lostW = this.hpBarW * lostRatio;
      const lostX = this.hpBarX + (this.hpBarW * regenRatio);
      this.hpBarFillG.fillStyle(0x333333, 0.8).fillRoundedRect(lostX, this.hpBarY, lostW, 14, 4);
    }
    
    const w = this.hpBarW * ratio;
    this.hpBarFillG.fillStyle(color, 0.9).fillRoundedRect(this.hpBarX, this.hpBarY, Math.max(0, w), 14, 4);
    this.hpBarFillG.fillStyle(color, 0.12).fillRoundedRect(this.hpBarX, this.hpBarY - 2, Math.max(0, w), 18, 4);
    if (this.hpText) {
      this.hpText.setText(`${Math.floor(current)}/${Math.floor(maxRegen)}`);
      this.hpText.setColor('#' + color.toString(16).padStart(6, '0'));
    }
  }

  /* ════════════════════ SHOOTING ════════════════════ */
  handleShot(aimX, aimY) {
    const result = this.weaponSystem.fire();
    if (!result) return;
    
    // Apply visual recoil kick to the 3D camera
    if (this.doomRenderer) {
      this.doomRenderer.camera.pitch -= result.recoilOffsetY * 0.001; // physical kick
    }

    // Actual bullet hit location (recoil included)
    const ex = aimX + result.recoilOffsetX;
    const ey = aimY + result.recoilOffsetY;
    
    this.gunnerOverlay.muzzleFlash(this.weaponSystem.currentWeapon);
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

    // Use DoomRenderer 3D raycasting if active, otherwise fallback to flat 2D raycasting
    if (this.doomRenderer) {
      const hitBlock = this.doomRenderer.getHitBlock(ex, ey);
      if (hitBlock) {
        r = hitBlock.r;
        c = hitBlock.c;
      }
    } else {
      if (ex >= ARENA_X && ex <= ARENA_X + TETRIS_COLS * CELL_SIZE && ey >= ARENA_Y && ey <= ARENA_Y + TETRIS_ROWS * CELL_SIZE) {
        c = Math.floor((ex - ARENA_X) / CELL_SIZE);
        r = Math.floor((ey - ARENA_Y) / CELL_SIZE);
      }
    }

    // AOE for knife
    if (weapon.aoe > 0) {
      let hitAny = false;
      const rad = Math.ceil(weapon.aoe);
      const centerR = r !== -1 ? r : Math.floor((ey - ARENA_Y) / CELL_SIZE);
      const centerC = c !== -1 ? c : Math.floor((ex - ARENA_X) / CELL_SIZE);
      
      for (let rr = -rad; rr <= rad; rr++) {
        for (let cc = -rad; cc <= rad; cc++) {
          if (rr*rr + cc*cc > weapon.aoe*weapon.aoe) continue;
          const tr = centerR+rr, tc = centerC+cc;
          if (this.tetrisBoard.damageFallingPiece(tr, tc, blockDamage)) hitAny = true;
          else if (tr >= 0 && tr < TETRIS_ROWS && tc >= 0 && tc < TETRIS_COLS && this.tetrisBoard.grid[tr]?.[tc]) {
            this.tetrisBoard.damageBlock(tr, tc, blockDamage);
            hitAny = true;
          }
        }
      }
      if (hitAny) this.gunnerOverlay.showHitMarker(ex, ey, true);
      return;
    }

    let hit = false;
    if (r !== -1 && c !== -1) {
      if (this.tetrisBoard.damageFallingPiece(r, c, blockDamage)) {
        hit = true; this.gunnerOverlay.showHitMarker(ex, ey, false);
      } else if (r >= 0 && r < TETRIS_ROWS && c >= 0 && c < TETRIS_COLS) {
        const cell = this.tetrisBoard.grid[r]?.[c];
        if (cell) {
          const destroyed = this.tetrisBoard.damageBlock(r, c, blockDamage);
          hit = true; this.gunnerOverlay.showHitMarker(ex, ey, destroyed);
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
    const cx = this.gunnerOverlay.crosshairX, cy = this.gunnerOverlay.crosshairY;
    const gc = Math.floor((cx - ARENA_X) / CELL_SIZE), gr = Math.floor((cy - ARENA_Y) / CELL_SIZE);
    const rad = GUNNER_UTILITIES.grenade.radius, dmg = GUNNER_UTILITIES.grenade.damage;

    // Destroy blocks in radius
    for (let r = -Math.ceil(rad); r <= Math.ceil(rad); r++) {
      for (let c = -Math.ceil(rad); c <= Math.ceil(rad); c++) {
        if (r*r + c*c > rad*rad) continue;
        const tr = gr+r, tc = gc+c;
        this.tetrisBoard.damageFallingPiece(tr, tc, dmg);
        if (tr >= 0 && tr < TETRIS_ROWS && tc >= 0 && tc < TETRIS_COLS) {
          if (this.tetrisBoard.grid[tr]?.[tc]) this.tetrisBoard.damageBlock(tr, tc, dmg);
        }
      }
    }

    // Visual: explosion
    const g = this.add.graphics().setDepth(75);
    g.fillStyle(0xff6600, 0.6); g.fillCircle(cx, cy, rad * CELL_SIZE);
    g.fillStyle(0xffcc00, 0.4); g.fillCircle(cx, cy, rad * CELL_SIZE * 0.6);
    g.fillStyle(0xffffff, 0.3); g.fillCircle(cx, cy, rad * CELL_SIZE * 0.3);
    this.tweens.add({ targets: g, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 400, onComplete: () => g.destroy() });
    this.cameras.main.shake(300, 0.015);
  }

  useFlashbang() {
    if (this.utilityCooldowns.flashbang > 0) return;
    this.utilityCooldowns.flashbang = GUNNER_UTILITIES.flashbang.cooldown;
    const dur = GUNNER_UTILITIES.flashbang.duration;

    // White flash covering the whole screen (affects both players)
    const flash = this.add.graphics().setDepth(100);
    flash.fillStyle(0xffffff, 0.95);
    flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.tweens.add({ targets: flash, alpha: 0, duration: dur, ease: 'Power2', onComplete: () => flash.destroy() });
    this.cameras.main.shake(100, 0.005);
  }

  useSmoke() {
    if (this.utilityCooldowns.smoke > 0) return;
    this.utilityCooldowns.smoke = GUNNER_UTILITIES.smoke.cooldown;
    const cx = this.gunnerOverlay.crosshairX, cy = this.gunnerOverlay.crosshairY;
    const dur = GUNNER_UTILITIES.smoke.duration;
    const rad = GUNNER_UTILITIES.smoke.radius * CELL_SIZE;

    // Smoke cloud (semi-opaque circles covering arena area)
    const smoke = this.add.graphics().setDepth(45);
    for (let i = 0; i < 12; i++) {
      const ox = (Math.random() - 0.5) * rad * 1.5;
      const oy = (Math.random() - 0.5) * rad * 1.5;
      const sr = rad * 0.5 + Math.random() * rad * 0.5;
      smoke.fillStyle(0x888888, 0.3 + Math.random() * 0.3);
      smoke.fillCircle(cx + ox, cy + oy, sr);
    }
    this._smokeOverlay = smoke;
    this._smokeTimer = dur;
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
    const t = this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2-30, names[data.count]||'CLEAR', { fontFamily:'Orbitron', fontSize:data.count>=4?'34px':'22px', fontStyle:'bold', color, stroke:'#000', strokeThickness:4 }).setOrigin(0.5).setDepth(80);
    this.tweens.add({ targets:t, alpha:0, y:GAME_HEIGHT/2-80, scale:1.4, duration:800, ease:'Power2', onComplete:()=>t.destroy() });
    if (data.count >= 3) this.cameras.main.shake(200, data.count >= 4 ? 0.01 : 0.005);
  }

  onGameOver(data) {
    this.time.delayedCall(1200, () => {
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
            // Score: prefer lower placement, filled neighbors, no holes
            let score = dropRow * 3;
            for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) {
              if (!shape[r][c]) continue;
              const gr = dropRow + r, gc = col + c;
              if (gr >= 0 && gr < TETRIS_ROWS && gc >= 0 && gc < TETRIS_COLS) {
                // Bonus for adjacent filled cells
                if (gc > 0 && board.grid[gr][gc-1]) score += 2;
                if (gc < TETRIS_COLS-1 && board.grid[gr][gc+1]) score += 2;
                if (gr < TETRIS_ROWS-1 && board.grid[gr+1]?.[gc]) score += 1;
                // Penalty for creating holes below
                for (let below = gr+1; below < TETRIS_ROWS; below++) {
                  if (!board.grid[below][gc]) { score -= 4; break; }
                }
              }
            }
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
    if (this.isPaused || this.tetrisBoard.isGameOver) return;

    this.matchTime += delta / 1000;
    this.timerText.setText(`${Math.floor(this.matchTime/60).toString().padStart(2,'0')}:${Math.floor(this.matchTime%60).toString().padStart(2,'0')}`);

    this.tetrisBoard.update(delta);
    if (this.tetrisController) this.tetrisController.update(delta);
    this.weaponSystem.update(delta);
    this.bridge.update(delta);

    // Auto-fire AK-47
    if (this.playerRole === 'gunner' && this.isFiringHeld && this.weaponSystem.currentWeapon === 'ak47') {
      const ptr = this.input.activePointer;
      if (ptr.isDown) this.handleShot(this.gunnerOverlay.crosshairX, this.gunnerOverlay.crosshairY);
    }

    // Render 2D Overlays
    if (this.doomRenderer) {
      // 3D background with physical recoil recovery
      if (this.doomRenderer.camera.pitch < 0) {
        this.doomRenderer.camera.pitch = Math.min(0, this.doomRenderer.camera.pitch + delta * 0.005);
      }
      this.doomRenderer.update(delta, this.tetrisBoard, { x: this.weaponSystem.recoilOffsetX, y: this.weaponSystem.recoilOffsetY });
    } else {
      this.tetrisRenderer.render(this.tetrisBoard);
    }
    
    this.gunnerOverlay.render(this.weaponSystem);

    // Draw 5 next pieces (bigger, visible to gunner for shooting)
    this._lastNextBounds = [];
    for (let i = 0; i < 5; i++) {
      const piece = this.tetrisBoard.nextPieces[i];
      if (piece) {
        const dmg = this.tetrisBoard.getNextPieceDamage(i);
        const py = this.nextStartY + i * this.nextSpacing;
        const sz = i === 0 ? 22 : 17;
        this._lastNextBounds.push(this.tetrisRenderer.drawPreview(piece, this.nextQueueX, py, sz, dmg));
      }
    }

    // Draw hold piece (big, visible to gunner for shooting)
    this._lastHoldBounds = this.tetrisRenderer.drawPreview(this.tetrisBoard.heldPiece, this.holdPos.x, this.holdPos.y, 22, this.tetrisBoard._holdDamage);

    // Update HUD texts
    this.scoreText.setText(this.tetrisBoard.score.toString());
    this.levelText.setText(this.tetrisBoard.level.toString());
    this.linesText.setText(this.tetrisBoard.linesCleared.toString());

    this.ironIndicator.setText(this.tetrisBoard.ironBodyActive ? `🛡 Iron Body (${Math.ceil(this.tetrisBoard.ironBodyTimer/1000)}s)` : '');
    this.shieldIndicator.setText(this.tetrisBoard.pieceShieldHP > 0 ? `✨ Shield Aura (${Math.floor(this.tetrisBoard.pieceShieldHP)} HP)` : '');

    // Ability cooldowns
    this.abilityTexts.forEach(a => {
      const cd = this.tetrisBoard.cooldowns[a.key];
      if (cd > 0) { a.text.setText(`[${a.key}] ${a.name} (${Math.ceil(cd/1000)}s)`); a.text.setColor('#334455'); }
      else { a.text.setText(`[${a.key}] ${a.name} (RDY)`); a.text.setColor(a.activeColor); }
    });

    // Weapon highlighting
    for (const [key, txt] of Object.entries(this.weaponSlotTexts)) {
      txt.setColor(key === this.weaponSystem.currentWeapon ? '#00d4ff' : '#556677');
    }

    // HP regen
    const hp = Math.floor(this.bridge.getGunnerHP());
    this.updateHPBar(hp, GUNNER_MAX_HP, this.bridge.gunnerMaxRegenHP);
    this.regenText.setText(this.bridge.regenActive ? '♥ REGENERATING...' : '');
    if (this.bridge.regenActive) {
      this.regenText.setAlpha(0.6 + 0.4 * Math.sin(Date.now() / 150));
    } else {
      this.regenText.setAlpha(1);
    }

    // Utility cooldowns
    for (const key of Object.keys(this.utilityCooldowns)) {
      if (this.utilityCooldowns[key] > 0) this.utilityCooldowns[key] -= delta;
    }

    // Smoke timer
    if (this._smokeOverlay && this._smokeTimer > 0) {
      this._smokeTimer -= delta;
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
