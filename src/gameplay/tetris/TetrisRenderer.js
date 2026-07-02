import { CELL_SIZE, PIECE_COLORS, PIECE_SHAPES, COLORS, TETRIS_ROWS, TETRIS_COLS, ARENA_X, ARENA_Y } from '../../config/constants.js';

// ─── Tetris Renderer ──────────────────────────────────────
// Draws the shared arena: grid, locked blocks, falling piece,
// ghost piece, shield, and iron block visuals.

export default class TetrisRenderer {
  constructor(scene, use3D = false) {
    this.scene = scene;
    this.boardX = ARENA_X;
    this.boardY = ARENA_Y;
    this.cellSize = CELL_SIZE;
    this.rows = TETRIS_ROWS;
    this.cols = TETRIS_COLS;
    this.use3D = use3D; // When true, Three.js handles main board; we only draw 2D previews

    this.bgGraphics = scene.add.graphics().setDepth(0);
    this.gridGraphics = scene.add.graphics().setDepth(1);
    this.blockGraphics = scene.add.graphics().setDepth(2);
    this.pieceGraphics = scene.add.graphics().setDepth(3);
    this.ghostGraphics = scene.add.graphics().setDepth(2);
    this.effectGraphics = scene.add.graphics().setDepth(5);

    if (!this.use3D) {
      this.drawBackground();
    } else {
      // Hide board background/grid — Three.js renders the board
      this.bgGraphics.setVisible(false);
      this.gridGraphics.setVisible(false);
    }
  }

  setVisible(visible) {
    this.bgGraphics.setVisible(visible);
    this.gridGraphics.setVisible(visible);
    this.blockGraphics.setVisible(visible);
    this.pieceGraphics.setVisible(visible);
    this.ghostGraphics.setVisible(visible);
    this.effectGraphics.setVisible(visible);
  }

  drawBackground() {
    const w = this.cols * this.cellSize;
    const h = this.rows * this.cellSize;

    // Outer glow
    this.bgGraphics.fillStyle(COLORS.ACCENT_BLUE, 0.04);
    this.bgGraphics.fillRoundedRect(this.boardX - 12, this.boardY - 12, w + 24, h + 24, 10);

    // Board background
    this.bgGraphics.fillStyle(0x060a14, 0.97);
    this.bgGraphics.fillRoundedRect(this.boardX - 3, this.boardY - 3, w + 6, h + 6, 4);

    // Board border
    this.bgGraphics.lineStyle(2, COLORS.ACCENT_BLUE, 0.35);
    this.bgGraphics.strokeRoundedRect(this.boardX - 3, this.boardY - 3, w + 6, h + 6, 4);

    // Grid lines
    this.gridGraphics.lineStyle(1, COLORS.GRID_LINE, 0.2);
    for (let r = 0; r <= this.rows; r++) {
      const y = this.boardY + r * this.cellSize;
      this.gridGraphics.lineBetween(this.boardX, y, this.boardX + w, y);
    }
    for (let c = 0; c <= this.cols; c++) {
      const x = this.boardX + c * this.cellSize;
      this.gridGraphics.lineBetween(x, this.boardY, x, this.boardY + h);
    }
  }

  drawBlock(graphics, col, row, color, alpha = 1, hp = 100, maxHp = 100, isIron = false) {
    const x = this.boardX + col * this.cellSize;
    const y = this.boardY + row * this.cellSize;
    const s = this.cellSize;
    const pad = 1;

    const hpRatio = hp / maxHp;

    if (isIron) {
      // Iron block: metallic silver with cross-hatch pattern
      graphics.fillStyle(0x8899aa, alpha * 0.9);
      graphics.fillRoundedRect(x + pad, y + pad, s - pad * 2, s - pad * 2, 2);

      // Metallic shine
      graphics.fillStyle(0xbbccdd, alpha * 0.3);
      graphics.fillRect(x + pad + 2, y + pad + 2, s - pad * 2 - 4, 3);
      graphics.fillRect(x + pad + 2, y + pad + 2, 3, s - pad * 2 - 4);

      // Cross-hatch to show it's iron
      graphics.lineStyle(1, 0xffffff, alpha * 0.15);
      for (let d = 0; d < s; d += 6) {
        graphics.lineBetween(x + pad + d, y + pad, x + pad, y + pad + d);
        graphics.lineBetween(x + s - pad - d, y + pad, x + s - pad, y + pad + d);
      }

      // Border
      graphics.lineStyle(1.5, 0xaabbcc, alpha * 0.7);
      graphics.strokeRoundedRect(x + pad, y + pad, s - pad * 2, s - pad * 2, 2);
      return;
    }

    // Normal block fill
    graphics.fillStyle(color, alpha * (0.5 + 0.5 * hpRatio));
    graphics.fillRoundedRect(x + pad, y + pad, s - pad * 2, s - pad * 2, 3);

    // Highlight (top-left shine)
    const brighter = Phaser.Display.Color.IntegerToColor(color);
    brighter.lighten(30);
    graphics.fillStyle(brighter.color, alpha * 0.3);
    graphics.fillRect(x + pad + 2, y + pad + 2, s - pad * 2 - 4, 3);
    graphics.fillRect(x + pad + 2, y + pad + 2, 3, s - pad * 2 - 4);

    // Border glow
    graphics.lineStyle(1, color, alpha * 0.7);
    graphics.strokeRoundedRect(x + pad, y + pad, s - pad * 2, s - pad * 2, 3);

    // Damage cracks
    if (hpRatio < 1 && hpRatio > 0) {
      graphics.lineStyle(1, 0xff2222, (1 - hpRatio) * 0.7);
      const cx = x + s / 2;
      const cy = y + s / 2;
      // Crack pattern based on hp
      if (hpRatio < 0.7) {
        graphics.lineBetween(cx - 6, cy - 4, cx + 2, cy + 3);
        graphics.lineBetween(cx + 2, cy + 3, cx - 3, cy + 7);
      }
      if (hpRatio < 0.4) {
        graphics.lineBetween(cx + 4, cy - 6, cx - 1, cy);
        graphics.lineBetween(cx - 1, cy, cx + 5, cy + 5);
      }
    }
  }

  render(board) {
    this.blockGraphics.clear();
    this.pieceGraphics.clear();
    this.ghostGraphics.clear();
    this.effectGraphics.clear();

    // In 3D mode, Three.js handles the board rendering
    // We only clear graphics and skip drawing
    if (this.use3D) {
      return;
    }

    // Draw locked blocks
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = board.grid[r][c];
        if (cell) {
          this.drawBlock(this.blockGraphics, c, r, cell.color, 1, cell.hp, cell.maxHp, cell.iron);

          if (cell.shieldHp > 0) {
            const ax = this.boardX + c * this.cellSize;
            const ay = this.boardY + r * this.cellSize;
            const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 200);
            this.effectGraphics.lineStyle(3, 0x00d4ff, pulse);
            this.effectGraphics.strokeRoundedRect(ax - 2, ay - 2, this.cellSize + 4, this.cellSize + 4, 4);
            this.effectGraphics.fillStyle(0x00ffff, pulse * 0.15);
            this.effectGraphics.fillRoundedRect(ax - 2, ay - 2, this.cellSize + 4, this.cellSize + 4, 4);
          }
        }
      }
    }

    if (board.currentPiece && !board.isGameOver) {
      const shape = board.getShape();
      const color = PIECE_COLORS[board.currentPiece];
      const dmg = board._fallingDamage || {};

      // Ghost piece (skip destroyed cells)
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const key = `${r}_${c}`;
            const cellHp = dmg[key] !== undefined ? dmg[key] : 100;
            if (cellHp <= 0) continue; // destroyed — skip
            this.drawBlock(this.ghostGraphics, board.pieceCol + c, board.ghostRow + r, color, 0.15, 100, 100, false);
          }
        }
      }

      // Current piece (skip destroyed, show damage)
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            const key = `${r}_${c}`;
            const cellHp = dmg[key] !== undefined ? dmg[key] : 100;
            if (cellHp <= 0) continue; // destroyed — skip
            const hpRatio = Math.max(0, cellHp) / 80; // BLOCK_HP=80
            this.drawBlock(this.pieceGraphics, board.pieceCol + c, board.pieceRow + r, color, 1, cellHp, 80, false);
          }
        }
      }

      // Shield aura visual (glowing border hugging the piece shape)
      if (board.pieceShieldHP > 0) {
        const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 200);
        this.effectGraphics.lineStyle(3, 0x00d4ff, pulse);

        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c]) {
              const ax = this.boardX + (board.pieceCol + c) * this.cellSize;
              const ay = this.boardY + (board.pieceRow + r) * this.cellSize;

              // Draw +1 cell out aura around this cell
              this.effectGraphics.strokeRoundedRect(ax - 3, ay - 3, this.cellSize + 6, this.cellSize + 6, 6);
              this.effectGraphics.fillStyle(0x00ffff, pulse * 0.1);
              this.effectGraphics.fillRoundedRect(ax - 3, ay - 3, this.cellSize + 6, this.cellSize + 6, 6);
            }
          }
        }
      }
    }

    // Iron Body visual: golden tint on all blocks
    if (board.ironBodyActive) {
      const pulse = 0.1 + 0.08 * Math.sin(Date.now() / 300);
      this.effectGraphics.fillStyle(0xffaa00, pulse);
      this.effectGraphics.fillRect(this.boardX, this.boardY, this.cols * this.cellSize, this.rows * this.cellSize);
    }
  }

  drawPreview(piece, cx, cy, cellSz = 18, damage = null) {
    if (!piece) return;
    const shape = PIECE_SHAPES[piece][0];
    const color = PIECE_COLORS[piece];
    const g = this.effectGraphics;
    const w = shape[0].length * cellSz;
    const h = shape.length * cellSz;
    const offX = cx - w / 2;
    const offY = cy - h / 2;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const bx = offX + c * cellSz;
          const by = offY + r * cellSz;

          let hp = 100;
          if (damage) {
            const key = `${r}_${c}`;
            if (damage[key] !== undefined) hp = Math.max(0, damage[key]);
          }

          const hpRatio = hp / 100;
          if (hp <= 0) continue; // destroyed cell

          g.fillStyle(color, 1.0);
          g.fillRoundedRect(bx, by, cellSz - 1, cellSz - 1, 2);
          g.lineStyle(1, 0xffffff, 0.4);
          g.strokeRoundedRect(bx, by, cellSz - 1, cellSz - 1, 2);

          // Damage cracks on preview
          if (hpRatio < 1 && hpRatio > 0) {
            g.lineStyle(1, 0xff2222, (1 - hpRatio) * 0.6);
            g.lineBetween(bx + 4, by + 3, bx + cellSz - 4, by + cellSz - 3);
          }
        }
      }
    }

    // Return bounding box for hit detection
    return { x: offX, y: offY, w, h, cellSz, shape };
  }

  drawShield(shieldRows) {
    const y = this.boardY + (this.rows - shieldRows) * this.cellSize;
    const h = shieldRows * this.cellSize;
    const w = this.cols * this.cellSize;

    // Shield fill
    this.effectGraphics.fillStyle(COLORS.ACCENT_BLUE, 0.08);
    this.effectGraphics.fillRect(this.boardX, y, w, h);

    // Animated border
    this.effectGraphics.lineStyle(2, COLORS.ACCENT_BLUE, 0.5);
    this.effectGraphics.strokeRect(this.boardX, y, w, h);

    // Shield label
    this.effectGraphics.fillStyle(COLORS.ACCENT_BLUE, 0.15);
    this.effectGraphics.fillRect(this.boardX, y - 1, w, 2);
  }

  destroy() {
    this.bgGraphics.destroy();
    this.gridGraphics.destroy();
    this.blockGraphics.destroy();
    this.pieceGraphics.destroy();
    this.ghostGraphics.destroy();
    this.effectGraphics.destroy();
  }
}
