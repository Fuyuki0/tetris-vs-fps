import Phaser from 'phaser';
import { COLORS, SCENES, GUNNER_MAX_HP } from '../config/constants.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.GAMEOVER });
  }

  init(data) {
    this.winner = data.winner || 'tetris';
    this.playerRole = data.playerRole || 'tetris';
    this.score = data.score || 0;
    this.lines = data.lines || 0;
    this.level = data.level || 1;
    this.gunnerHP = data.gunnerHP || 0;
    this.matchTime = data.matchTime || 0;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.BG_DARK);
    this.cameras.main.fadeIn(500);

    const playerWon = this.winner === this.playerRole;
    const accentColor = playerWon ? '#00ff88' : '#ff2d55';
    const resultText = playerWon ? 'VICTORY' : 'DEFEAT';
    const resultEmoji = playerWon ? '🏆' : '💀';

    // Background particles burst
    this.particles = [];
    for (let i = 0; i < 50; i++) {
      this.particles.push({
        x: width / 2,
        y: height / 2,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 2,
        life: 1,
        color: playerWon ? 0x00ff88 : 0xff2d55,
        size: 2 + Math.random() * 4,
      });
    }
    this.particleGraphics = this.add.graphics();

    // Result emoji
    const emojiText = this.add.text(width / 2, height * 0.2, resultEmoji, {
      fontSize: '72px',
    }).setOrigin(0.5).setScale(0);

    this.tweens.add({
      targets: emojiText,
      scale: 1,
      duration: 600,
      ease: 'Back.easeOut',
    });

    // Main result
    const titleText = this.add.text(width / 2, height * 0.35, resultText, {
      fontFamily: 'Orbitron', fontSize: '52px', fontStyle: 'bold',
      color: accentColor,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: titleText,
      alpha: 1,
      y: height * 0.33,
      duration: 800,
      delay: 300,
      ease: 'Power2',
    });

    // Winner announcement
    const winnerName = this.winner === 'tetris' ? 'Tetris Player' : 'Gunner Player';
    this.add.text(width / 2, height * 0.42, `${winnerName} wins!`, {
      fontFamily: 'Inter', fontSize: '18px', color: '#8899aa',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: this.children.list[this.children.list.length - 1],
      alpha: 1,
      duration: 600,
      delay: 600,
    });

    // Stats card
    const cardX = width / 2 - 200;
    const cardY = height * 0.5;
    const cardW = 400;
    const cardH = 160;

    const cardG = this.add.graphics();
    cardG.fillStyle(0x0d1220, 0.9);
    cardG.fillRoundedRect(cardX, cardY, cardW, cardH, 10);
    cardG.lineStyle(1, playerWon ? 0x00ff88 : 0xff2d55, 0.3);
    cardG.strokeRoundedRect(cardX, cardY, cardW, cardH, 10);

    const stats = [
      { label: 'Score', value: this.score.toLocaleString() },
      { label: 'Lines Cleared', value: this.lines.toString() },
      { label: 'Level', value: this.level.toString() },
      { label: 'Gunner HP', value: `${this.gunnerHP}/${GUNNER_MAX_HP}` },
      { label: 'Match Time', value: this.formatTime(this.matchTime) },
    ];

    stats.forEach((stat, i) => {
      const sy = cardY + 15 + i * 28;
      this.add.text(cardX + 25, sy, stat.label, {
        fontFamily: 'Inter', fontSize: '13px', color: '#667788',
      });
      this.add.text(cardX + cardW - 25, sy, stat.value, {
        fontFamily: 'Orbitron', fontSize: '13px', color: '#ffffff',
      }).setOrigin(1, 0);
    });

    // Buttons
    const btnY = cardY + cardH + 30;
    this.createButton(width / 2 - 110, btnY, 200, 44, '▶  PLAY AGAIN', 0x00d4ff, () => {
      this.scene.start(SCENES.MENU);
    });

    this.createButton(width / 2 + 110, btnY, 200, 44, '⟳  REMATCH', 0xffd700, () => {
      this.scene.start(SCENES.LOBBY, { role: this.playerRole });
    });
  }

  createButton(cx, y, w, h, label, color, onClick) {
    const x = cx - w / 2;
    const g = this.add.graphics();
    g.fillStyle(color, 0.15);
    g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(1.5, color, 0.5);
    g.strokeRoundedRect(x, y, w, h, 8);

    const colorStr = '#' + color.toString(16).padStart(6, '0');
    const text = this.add.text(cx, y + h / 2, label, {
      fontFamily: 'Orbitron', fontSize: '14px', fontStyle: 'bold', color: colorStr,
    }).setOrigin(0.5);

    const zone = this.add.zone(cx, y + h / 2, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      g.clear();
      g.fillStyle(color, 0.35);
      g.fillRoundedRect(x, y, w, h, 8);
      g.lineStyle(2, color, 0.9);
      g.strokeRoundedRect(x, y, w, h, 8);
      text.setColor('#ffffff');
    });
    zone.on('pointerout', () => {
      g.clear();
      g.fillStyle(color, 0.15);
      g.fillRoundedRect(x, y, w, h, 8);
      g.lineStyle(1.5, color, 0.5);
      g.strokeRoundedRect(x, y, w, h, 8);
      text.setColor(colorStr);
    });
    zone.on('pointerdown', onClick);
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  update() {
    this.particleGraphics.clear();
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life -= 0.008;
      if (p.life > 0) {
        this.particleGraphics.fillStyle(p.color, p.life * 0.6);
        this.particleGraphics.fillRect(p.x, p.y, p.size, p.size);
      }
    }
  }
}
