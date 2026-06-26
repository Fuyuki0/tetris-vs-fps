import { TETRIS_COLS, TETRIS_ROWS, CELL_SIZE, PIECE_SHAPES, PIECE_COLORS, WALL_KICKS, BLOCK_HP, ABILITIES } from '../../config/constants.js';
import eventBus from '../bridge/EventBus.js';
import { EVENTS } from '../../config/constants.js';

// ─── Tetris Board ─────────────────────────────────────────
// Manages the grid, collision, line clearing, piece locking.
// Supports iron blocks (indestructible) and block HP for gunner damage.

export default class TetrisBoard {
  constructor() {
    this.cols = TETRIS_COLS;
    this.rows = TETRIS_ROWS;
    this.grid = this.createEmptyGrid();
    this.score = 0;
    this.level = 1;
    this.linesCleared = 0;
    this.combo = -1;
    this.abilityCharge = 0; // Kept for score/level purposes if needed
    
    this.cooldowns = { Q: 0, E: 0, F: 0, G: 0 };

    this.currentPiece = null;
    this.nextPieces = [];  // Queue of 5 upcoming pieces
    this.heldPiece = null;
    this.canHold = true;
    this.lastLineClearTime = 0; // Track for gunner HP regen

    this.pieceRow = 0;
    this.pieceCol = 0;
    this.rotation = 0;

    this.bag = [];

    this.dropInterval = 1000;
    this.dropTimer = 0;
    this.lockDelay = 500;
    this.lockTimer = 0;
    this.isLocking = false;
    this.ghostRow = 0;
    this.isGameOver = false;
    this.isPaused = false;

    // Ability states
    this.ironBodyActive = false;
    this.ironBodyTimer = 0;
    this.pieceShieldHP = 0; // Shield aura on falling piece

    // Fill the 5-piece queue
    for (let i = 0; i < 5; i++) {
      this.nextPieces.push(this._getRandomPiece());
    }
    this._nextDamage = {};  // Damage tracking per queue slot: { '0_r_c': hp, '1_r_c': hp, ... }
    this.spawnPiece();
  }

  createEmptyGrid() {
    return Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => null)
    );
  }

  _getRandomPiece() {
    if (this.bag.length === 0) {
      this.bag = ['I', 'O', 'T', 'S', 'Z', 'L', 'J'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  spawnPiece() {
    // Take first piece from queue, shift damage keys down
    this.currentPiece = this.nextPieces.shift();
    this.nextPieces.push(this._getRandomPiece());

    // Shift damage tracking: slot 1->0, 2->1, etc.
    const newDamage = {};
    this._fallingDamage = {}; // Initialize falling damage from slot 0
    for (const [key, val] of Object.entries(this._nextDamage || {})) {
      const parts = key.split('_');
      const slotIdx = parseInt(parts[0]);
      if (slotIdx === 0) {
        this._fallingDamage[`${parts[1]}_${parts[2]}`] = val;
      } else if (slotIdx > 0) {
        newDamage[`${slotIdx - 1}_${parts[1]}_${parts[2]}`] = val;
      }
    }
    this._nextDamage = newDamage;

    this.rotation = 0;
    this.canHold = true;
    this.pieceShieldHP = 0; // Reset shield aura for new piece

    const shape = this.getShape();
    this.pieceCol = Math.floor((this.cols - shape[0].length) / 2);
    this.pieceRow = -2; // Spawn above visible area

    if (!this.isValidPosition(this.pieceRow, this.pieceCol, this.rotation)) {
      this.isGameOver = true;
      eventBus.emit(EVENTS.TETRIS_GAME_OVER, { reason: 'topped_out' });
      return false;
    }

    this.isLocking = false;
    this.lockTimer = 0;
    this.dropTimer = 0;
    this.updateGhost();
    return true;
  }

  getShape(piece, rot) {
    const p = piece || this.currentPiece;
    const r = rot !== undefined ? rot : this.rotation;
    return PIECE_SHAPES[p][r];
  }

  isValidPosition(row, col, rotation) {
    const shape = this.getShape(this.currentPiece, rotation);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          // Skip collision check if this specific block is destroyed
          // Note: If testing alternative rotations (AI), we only have damage for the current rotation,
          // but for basic movement/dropping, rotation === this.rotation, so keys match exactly.
          if (rotation === this.rotation && this._fallingDamage) {
            const key = `${r}_${c}`;
            if (this._fallingDamage[key] !== undefined && this._fallingDamage[key] <= 0) {
              continue;
            }
          }

          const newRow = row + r;
          const newCol = col + c;
          if (newRow >= this.rows || newCol < 0 || newCol >= this.cols) {
            return false;
          }
          if (newRow >= 0 && this.grid[newRow][newCol]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  moveLeft() {
    if (this.isGameOver || this.isPaused) return false;
    if (this.isValidPosition(this.pieceRow, this.pieceCol - 1, this.rotation)) {
      this.pieceCol--;
      if (this.isLocking) this.lockTimer = 0;
      this.updateGhost();
      return true;
    }
    return false;
  }

  moveRight() {
    if (this.isGameOver || this.isPaused) return false;
    if (this.isValidPosition(this.pieceRow, this.pieceCol + 1, this.rotation)) {
      this.pieceCol++;
      if (this.isLocking) this.lockTimer = 0;
      this.updateGhost();
      return true;
    }
    return false;
  }

  moveDown() {
    if (this.isGameOver || this.isPaused) return false;
    if (this.isValidPosition(this.pieceRow + 1, this.pieceCol, this.rotation)) {
      this.pieceRow++;
      this.score += 1;
      this.isLocking = false;
      this.lockTimer = 0;
      return true;
    } else {
      this.isLocking = true;
      return false;
    }
  }

  hardDrop() {
    if (this.isGameOver || this.isPaused) return 0;
    let rows = 0;
    while (this.isValidPosition(this.pieceRow + 1, this.pieceCol, this.rotation)) {
      this.pieceRow++;
      rows++;
    }
    this.score += rows * 2;
    this.lockPiece();
    return rows;
  }

  rotate(direction = 1) {
    if (this.isGameOver || this.isPaused || !this.currentPiece) return false;
    
    // Check if only 1 block is left (prevent wild orbiting around old center)
    let remainingBlocks = 0;
    const currentShape = this.getShape();
    for (let r = 0; r < currentShape.length; r++) {
      for (let c = 0; c < currentShape[r].length; c++) {
        if (currentShape[r][c]) {
          const hp = this._fallingDamage[`${r}_${c}`];
          if (hp === undefined || hp > 0) remainingBlocks++;
        }
      }
    }
    if (remainingBlocks <= 1) return false;

    const oldRotation = this.rotation;
    const newRotation = (this.rotation + direction + 4) % 4;
    const kickKey = `${oldRotation}>${newRotation}`;
    const kicks = this.currentPiece === 'I' ? WALL_KICKS.I[kickKey] : WALL_KICKS.normal[kickKey];
    if (!kicks) return false;

    for (const [dx, dy] of kicks) {
      if (this.isValidPosition(this.pieceRow - dy, this.pieceCol + dx, newRotation)) {
        this.rotation = newRotation;
        this.pieceCol += dx;
        this.pieceRow -= dy;

        // Rotate damage mapping keys
        const shape = this.getShape(); // The new shape
        const N = shape.length;
        const newFallingDamage = {};
        for (const [key, val] of Object.entries(this._fallingDamage)) {
          const [r, c] = key.split('_').map(Number);
          // Standard array rotation mapping:
          // Right (dir 1): r' = c, c' = N - 1 - r
          // Left (dir -1): r' = N - 1 - c, c' = r
          // 180 (dir 2): r' = N - 1 - r, c' = N - 1 - c
          let newR, newC;
          if (direction === 1) { newR = c; newC = N - 1 - r; }
          else if (direction === -1 || direction === 3) { newR = N - 1 - c; newC = r; }
          else if (direction === 2) { newR = N - 1 - r; newC = N - 1 - c; }
          else { newR = r; newC = c; }
          newFallingDamage[`${newR}_${newC}`] = val;
        }
        this._fallingDamage = newFallingDamage;

        if (this.isLocking) this.lockTimer = 0;
        this.updateGhost();
        return true;
      }
    }
    return false;
  }

  hold() {
    if (!this.canHold || this.isGameOver || this.isPaused) return false;
    this.canHold = false;  // Only 1 hold per piece
    this._holdDamage = {};  // Reset damage on held piece when swapping
    if (this.heldPiece) {
      const temp = this.heldPiece;
      this.heldPiece = this.currentPiece;
      this.currentPiece = temp;
      this.rotation = 0;
      this._fallingDamage = {};
      const shape = this.getShape();
      this.pieceCol = Math.floor((this.cols - shape[0].length) / 2);
      this.pieceRow = 0;
      this.isLocking = false;
      this.lockTimer = 0;
      this.dropTimer = 0;
      this.updateGhost();
    } else {
      this.heldPiece = this.currentPiece;
      this.spawnPiece();
    }
    return true;
  }

  lockPiece() {
    const shape = this.getShape();
    const lockedBlocks = [];
    const isIron = this.ironBodyActive;

    let lockedAboveBoard = false;
    let totalSolidBlocks = 0;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const row = this.pieceRow + r;
          const col = this.pieceCol + c;

          // Check falling damage — skip destroyed cells
          const dmgKey = `${r}_${c}`;
          const cellHp = (this._fallingDamage && this._fallingDamage[dmgKey] !== undefined)
            ? this._fallingDamage[dmgKey] : BLOCK_HP;
          if (cellHp <= 0) continue; // destroyed — don't place

          totalSolidBlocks++;
          
          if (row < 0) {
            lockedAboveBoard = true;
          } else if (row < this.rows && col >= 0 && col < this.cols) {
            this.grid[row][col] = {
              type: this.currentPiece,
              color: PIECE_COLORS[this.currentPiece],
              hp: Math.min(cellHp, BLOCK_HP),
              maxHp: BLOCK_HP,
              iron: false,
              shieldHp: this.pieceShieldHP > 0 ? this.pieceShieldHP : 0,
              id: `${Date.now()}_${row}_${col}`,
            };
            lockedBlocks.push({ row, col });
          }
        }
      }
    }

    if (lockedAboveBoard && totalSolidBlocks > 0) {
      this.isGameOver = true;
      eventBus.emit(EVENTS.TETRIS_GAME_OVER, { reason: 'lock_out' });
      return;
    }

    // Apply shield ONLY to the locked piece's blocks, not connected blocks
    if (this.pieceShieldHP > 0 && lockedBlocks.length > 0) {
      const shieldVal = this.pieceShieldHP;
      for (const { row, col } of lockedBlocks) {
        if (this.grid[row]?.[col]) {
          this.grid[row][col].shieldHp = shieldVal;
        }
      }
      this.pieceShieldHP = 0;
    }

    eventBus.emit(EVENTS.BLOCK_LOCKED, { blocks: lockedBlocks });

    const clearedRows = this.checkLineClears();
    if (clearedRows.length > 0) {
      this.clearLines(clearedRows);
      this.combo++;
    } else {
      this.combo = -1;
    }

    this.spawnPiece();
  }

  checkLineClears() {
    const full = [];
    for (let r = 0; r < this.rows; r++) {
      if (this.grid[r].every(cell => cell !== null)) {
        full.push(r);
      }
    }
    return full;
  }

  clearLines(rows) {
    const count = rows.length;
    for (const row of rows.sort((a, b) => a - b)) {
      this.grid.splice(row, 1);
      this.grid.unshift(Array.from({ length: this.cols }, () => null));
    }

    const scoreTable = { 1: 100, 2: 300, 3: 500, 4: 800 };
    this.score += (scoreTable[count] || 100) * this.level;
    this.linesCleared += count;
    this.abilityCharge += count;
    this.level = Math.floor(this.linesCleared / 10) + 1;
    this.dropInterval = Math.max(100, 1000 * Math.pow(0.85, this.level - 1));
    this.lastLineClearTime = Date.now();

    eventBus.emit(EVENTS.LINE_CLEARED, { rows, count });
    eventBus.emit(EVENTS.BOARD_UPDATED, { grid: this.grid });
  }

  updateGhost() {
    this.ghostRow = this.pieceRow;
    while (this.isValidPosition(this.ghostRow + 1, this.pieceCol, this.rotation)) {
      this.ghostRow++;
    }
  }

  // ─── Damage a locked block ─────────────────────────────
  damageBlock(row, col, damage) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return false;
    const cell = this.grid[row][col];
    if (!cell) return false;

    // Iron blocks cannot be destroyed
    if (cell.iron) return false;

    // Iron Body Active: reduce incoming damage globally
    if (this.ironBodyActive) {
      damage /= ABILITIES.ironBody.hpMultiplier;
    }

    // Shield protection (old global wall shield logic)
    if (this.shieldActive && row >= this.rows - this.shieldRows) {
      return false;
    }

    // Individual cell shield protection
    if (cell.shieldHp > 0) {
      cell.shieldHp -= damage;
      if (cell.shieldHp < 0) {
        damage = -cell.shieldHp;
        cell.shieldHp = 0;
      } else {
        return false; // fully absorbed
      }
    }

    cell.hp -= damage;
    if (cell.hp <= 0) {
      this.grid[row][col] = null;
      eventBus.emit(EVENTS.BLOCK_DESTROYED, { row, col, blockId: cell.id });
      return true; // destroyed
    }
    return false; // damaged but alive
  }

  // ─── Damage the falling piece ──────────────────────────
  // Returns true if a cell of the falling piece was hit
  damageFallingPiece(hitRow, hitCol, damage) {
    if (!this.currentPiece || this.isGameOver) return false;

    if (this.ironBodyActive) {
      damage /= ABILITIES.ironBody.hpMultiplier;
    }

    const shape = this.getShape();
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const cellRow = this.pieceRow + r;
          const cellCol = this.pieceCol + c;
          if (cellRow === hitRow && cellCol === hitCol) {
            // Shield aura absorbs damage first
            if (this.pieceShieldHP > 0) {
              this.pieceShieldHP -= damage;
              if (this.pieceShieldHP < 0) {
                damage = -this.pieceShieldHP;
                this.pieceShieldHP = 0;
              } else {
                return true; // Fully absorbed
              }
            }
            if (!this._fallingDamage) this._fallingDamage = {};
            const key = `${r}_${c}`;
            this._fallingDamage[key] = (this._fallingDamage[key] || BLOCK_HP) - damage;
            return true;
          }
        }
      }
    }
    return false;
  }

  // ─── Damage next piece in queue ─────────────────────────
  // slotIndex: 0-4, which piece in the queue
  damageNextPiece(slotIndex, localRow, localCol, damage) {
    if (slotIndex < 0 || slotIndex >= this.nextPieces.length) return false;
    const piece = this.nextPieces[slotIndex];
    if (!piece) return false;
    const shape = PIECE_SHAPES[piece][0];
    if (localRow >= 0 && localRow < shape.length && localCol >= 0 && localCol < shape[0].length && shape[localRow][localCol]) {
      if (!this._nextDamage) this._nextDamage = {};
      const key = `${slotIndex}_${localRow}_${localCol}`;
      this._nextDamage[key] = (this._nextDamage[key] || BLOCK_HP) - damage;
      return true;
    }
    return false;
  }

  // Get damage for a specific queue slot cell
  getNextPieceDamage(slotIndex) {
    const result = {};
    for (const [key, val] of Object.entries(this._nextDamage || {})) {
      const parts = key.split('_');
      if (parseInt(parts[0]) === slotIndex) {
        result[`${parts[1]}_${parts[2]}`] = val;
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  // ─── Damage held piece preview ─────────────────────────
  damageHeldPiece(localRow, localCol, damage) {
    if (!this.heldPiece) return false;
    const shape = PIECE_SHAPES[this.heldPiece][0];
    if (localRow >= 0 && localRow < shape.length && localCol >= 0 && localCol < shape[0].length && shape[localRow][localCol]) {
      if (!this._holdDamage) this._holdDamage = {};
      const key = `${localRow}_${localCol}`;
      this._holdDamage[key] = (this._holdDamage[key] || BLOCK_HP) - damage;
      return true;
    }
    return false;
  }

  // ─── Ability: Iron Body (Q) ────────────────────────────
  // All existing blocks become 3x harder to destroy for 6s
  activateIronBody() {
    if (this.cooldowns.Q <= 0) {
      this.cooldowns.Q = ABILITIES.ironBody.cooldown;
      this.ironBodyActive = true;
      this.ironBodyTimer = ABILITIES.ironBody.duration;
      eventBus.emit(EVENTS.ABILITY_USED, { ability: 'ironBody' });
      return true;
    }
    return false;
  }

  // ─── Ability: Shield Aura (E) ─────────────────────────
  // Gives the current falling piece a shield that absorbs damage
  activateShield() {
    if (this.cooldowns.E <= 0 && this.currentPiece) {
      this.cooldowns.E = ABILITIES.shield.cooldown;
      this.pieceShieldHP = ABILITIES.shield.shieldHP;
      eventBus.emit(EVENTS.ABILITY_USED, { ability: 'shield' });
      return true;
    }
    return false;
  }

  // ─── Ability: Repair (F) ──────────────────────────────
  // Heals all damaged blocks by a fixed amount
  activateRepair() {
    if (this.cooldowns.F <= 0) {
      this.cooldowns.F = ABILITIES.repair.cooldown;
      const heal = ABILITIES.repair.healAmount;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          if (cell && cell.hp < cell.maxHp) {
            cell.hp = Math.min(cell.hp + heal, cell.maxHp);
          }
        }
      }
      eventBus.emit(EVENTS.ABILITY_USED, { ability: 'repair' });
      return true;
    }
    return false;
  }

  // ─── Ability: Seismic Purge (G) ───────────────────────
  // Clears the bottom 3 rows instantly
  activateSeismicPurge() {
    if (this.cooldowns.G <= 0) {
      this.cooldowns.G = ABILITIES.seismicPurge.cooldown;
      const rowsToClear = ABILITIES.seismicPurge.rows;
      for (let i = 0; i < rowsToClear; i++) {
        this.grid.splice(this.rows - 1, 1);
        this.grid.unshift(Array.from({ length: this.cols }, () => null));
      }
      this.linesCleared += rowsToClear;
      eventBus.emit(EVENTS.LINE_CLEARED, { rows: [], count: rowsToClear, isPurge: true });
      eventBus.emit(EVENTS.ABILITY_USED, { ability: 'seismicPurge' });
      return true;
    }
    return false;
  }

  update(delta) {
    if (this.isGameOver || this.isPaused) return;

    // Cooldowns
    for (const key of Object.keys(this.cooldowns)) {
      if (this.cooldowns[key] > 0) this.cooldowns[key] -= delta;
    }

    // Iron Body timer
    if (this.ironBodyActive) {
      this.ironBodyTimer -= delta;
      if (this.ironBodyTimer <= 0) {
        this.ironBodyActive = false;
        this.ironBodyTimer = 0;
        // Reset all block HP back to normal
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            const cell = this.grid[r][c];
            if (cell) { cell.maxHp = BLOCK_HP; cell.hp = Math.min(cell.hp, BLOCK_HP); }
          }
        }
      }
    }

    this.dropTimer += delta;

    if (this.isLocking) {
      this.lockTimer += delta;
      if (this.lockTimer >= this.lockDelay) {
        this.lockPiece();
        return;
      }
    }

    if (this.dropTimer >= this.dropInterval) {
      this.dropTimer = 0;
      if (!this.moveDown()) {
        this.isLocking = true;
      }
    }
  }
}
