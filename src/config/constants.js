// ─── Shared Constants & Enums ─────────────────────────────

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// ─── Tetris Constants ─────────────────────────────────────
export const TETRIS_COLS = 10;
export const TETRIS_ROWS = 20;
export const CELL_SIZE = 30;

// Arena is centered
export const ARENA_X = (GAME_WIDTH - TETRIS_COLS * CELL_SIZE) / 2;
export const ARENA_Y = (GAME_HEIGHT - TETRIS_ROWS * CELL_SIZE) / 2 + 10;

// ─── Colors ───────────────────────────────────────────────
export const COLORS = {
  BG_DARK: 0x050810,
  BG_NAVY: 0x0a0e1a,
  GRID_LINE: 0x1a3a4a,
  ACCENT_BLUE: 0x00d4ff,
  ACCENT_PINK: 0xff2d55,
  ACCENT_GREEN: 0x00ff88,
  ACCENT_GOLD: 0xffd700,
  ACCENT_PURPLE: 0xbb44ff,
  WHITE: 0xffffff,
  DIM_WHITE: 0x8899aa,
};

// ─── Tetromino Colors ─────────────────────────────────────
export const PIECE_COLORS = {
  I: 0x00d4ff,   // Cyan
  O: 0xffd700,   // Yellow
  T: 0xbb44ff,   // Purple
  S: 0x00ff88,   // Green
  Z: 0xff2d55,   // Red
  L: 0xff8800,   // Orange
  J: 0x4488ff,   // Blue
};

// ─── Tetromino Shapes (SRS) ───────────────────────────────
export const PIECE_SHAPES = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
    [[1,1],[1,1]],
  ],
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]],
  ],
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]],
  ],
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]],
  ],
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]],
  ],
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]],
  ],
};

// ─── SRS Wall Kick Data ───────────────────────────────────
export const WALL_KICKS = {
  normal: {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  },
  I: {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  },
};

// ─── Damage Table ─────────────────────────────────────────
export const LINE_DAMAGE = {
  1: 10,
  2: 25,
  3: 45,
  4: 80,
};
export const COMBO_BONUS = 5;

// ─── Gunner Constants ─────────────────────────────────────
export const GUNNER_MAX_HP = 300;
export const BLOCK_HP = 80;
export const HP_REGEN_RATE = 15;      // HP per second when regenerating
export const HP_REGEN_DELAY = 2000;  // ms without line clears before regen starts

// ─── Weapon Stats ─────────────────────────────────────────
// Recoil patterns inspired by CS:GO
// AK-47: reverse-7 shape — up, then left, then right, then S-wiggle
// Desert Eagle: high vertical kick, slow recovery, tap-fire style
export const WEAPONS = {
  knife: {
    name: 'Knife',
    damage: 45,
    fireRate: 1500,
    maxAmmo: Infinity,
    reserveAmmo: Infinity,
    reloadTime: 0,
    spread: 0,
    type: 'melee',
    aoe: 1.5, // 1.5 cell radius
    icon: '🔪',
    slot: 1,
    recoilPattern: [],
    recoilRecovery: 0,
  },
  deagle: {
    name: 'Deagle',
    damage: 35,
    fireRate: 250, // Much faster RPM
    maxAmmo: 7,
    reserveAmmo: Infinity,
    reloadTime: 1200, // Reduced from 2200
    blockDamagePercent: 75, // Exactly 75% of a block's max HP per shot
    spread: 2.5, // Increased base spread due to recoil
    type: 'hitscan',
    icon: '🔫',
    slot: 2,
    recoilPattern: [
      { x: 0, y: -10 },
      { x: 2, y: -20 },
      { x: -4, y: -30 },
      { x: 6, y: -50 },
      { x: -4, y: -70 },
      { x: 8, y: -90 },
      { x: -8, y: -110 },
    ],
    recoilRecovery: 0.15, // VERY fast recovery so it snaps down quickly
    baseSpread: 1.5,
    spamSpread: 4,
  },
  ak47: {
    name: 'AK-47',
    damage: 18,
    fireRate: 130,
    maxAmmo: 30,
    reserveAmmo: Infinity,
    reloadTime: 1400, // Reduced from 2500
    blockDamagePercentMax: 40, // Starts at 40% of block HP per shot
    blockDamagePercentMin: 25, // Diminishes to 25% when spraying
    spread: 2,
    type: 'hitscan',
    icon: '🔫',
    slot: 3,
    // AK-47 CS:GO Recoil: Accurate to the classic spray pattern image
    recoilPattern: [
      // Shots 1-9: Climbs straight up with a very slight leftward curve at the top
      { x: 0, y: -6 }, { x: 1, y: -13 }, { x: 0, y: -20 }, { x: -1, y: -28 },
      { x: 0, y: -36 }, { x: -2, y: -44 }, { x: -4, y: -52 }, { x: -6, y: -58 }, { x: -8, y: -62 },
      
      // Shots 10-14: Hooks to the right
      { x: -2, y: -64 }, { x: 5, y: -65 }, { x: 12, y: -66 }, { x: 15, y: -65 }, { x: 10, y: -64 },
      
      // Shots 15-22: Sweeps hard left
      { x: 2, y: -63 }, { x: -8, y: -62 }, { x: -18, y: -61 }, { x: -26, y: -60 },
      { x: -32, y: -59 }, { x: -36, y: -58 }, { x: -34, y: -59 }, { x: -28, y: -60 },
      
      // Shots 23-30: Sweeps all the way back to the far right
      { x: -15, y: -62 }, { x: -2, y: -63 }, { x: 10, y: -64 }, { x: 22, y: -63 },
      { x: 32, y: -62 }, { x: 40, y: -61 }, { x: 45, y: -60 }, { x: 48, y: -59 }
    ],
    recoilRecovery: 0.03,
    baseSpread: 2.5,
    spamSpread: 10,
  },
};

// ─── Gunner Utilities ───────────────────────────────────
export const GUNNER_UTILITIES = {
  grenade: { name: 'Grenade', key: '4', cooldown: 8000, radius: 2.5, damage: 60, icon: '💣' },
  flashbang: { name: 'Flashbang', key: '5', cooldown: 12000, duration: 10000, icon: '✨' },
  smoke: { name: 'Smoke', key: '6', cooldown: 15000, duration: 1666, radius: 1.8, icon: '💨' },
};

// ─── Tetris Abilities ─────────────────────────────────────
export const ABILITIES = {
  ironBody: { name: 'Iron Body', cooldown: 15000, duration: 6000, key: 'Q', description: 'All blocks become harder to destroy for 6s', hpMultiplier: 3 },
  shield: { name: 'Shield', cooldown: 12000, shieldHP: 120, key: 'E', description: 'Falling block gets a protective aura' },
  repair: { name: 'Repair', cooldown: 18000, healAmount: 30, key: 'F', description: 'Restores 30 HP to all damaged blocks' },
  seismicPurge: { name: 'Seismic Purge', cooldown: 20000, rows: 3, key: 'G', description: 'Clears the bottom 3 rows instantly' },
};

// ─── Scene Keys ───────────────────────────────────────────
export const SCENES = {
  BOOT: 'BootScene',
  PRELOAD: 'PreloadScene',
  MENU: 'MenuScene',
  LOBBY: 'LobbyScene',
  GAMEPLAY: 'GameplayScene',
  GAMEOVER: 'GameOverScene',
};

// ─── Event Names ──────────────────────────────────────────
export const EVENTS = {
  BLOCK_PLACED: 'tetris:blockPlaced',
  BLOCK_LOCKED: 'tetris:blockLocked',
  LINE_CLEARED: 'tetris:lineCleared',
  BOARD_UPDATED: 'tetris:boardUpdated',
  ABILITY_USED: 'tetris:abilityUsed',
  TETRIS_GAME_OVER: 'tetris:gameOver',
  SHOT_FIRED: 'gunner:shotFired',
  BLOCK_DAMAGED: 'gunner:blockDamaged',
  BLOCK_DESTROYED: 'gunner:blockDestroyed',
  GUNNER_GAME_OVER: 'gunner:gameOver',
  GAME_START: 'game:start',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  GAME_OVER: 'game:over',
};
