import Phaser from 'phaser';
import { COLORS, SCENES, PIECE_COLORS } from '../config/constants.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.MENU });
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.BG_DARK);

    // ─── Animated background particles ───
    this.bgParticles = [];
    for (let i = 0; i < 30; i++) {
      this.bgParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.3 + Math.random() * 0.7,
        size: 2 + Math.random() * 4,
        color: Object.values(PIECE_COLORS)[Math.floor(Math.random() * 7)],
        alpha: 0.1 + Math.random() * 0.3,
      });
    }
    this.particleGraphics = this.add.graphics();

    // ─── Profile Card (top-left) ───
    const profileG = this.add.graphics();
    profileG.fillStyle(0x0d1220, 0.9);
    profileG.fillRoundedRect(20, 15, 220, 60, 10);
    profileG.lineStyle(1, COLORS.ACCENT_BLUE, 0.4);
    profileG.strokeRoundedRect(20, 15, 220, 60, 10);

    // Avatar circle
    profileG.fillStyle(COLORS.ACCENT_BLUE, 0.3);
    profileG.fillCircle(55, 45, 18);
    profileG.lineStyle(2, COLORS.ACCENT_BLUE, 0.6);
    profileG.strokeCircle(55, 45, 18);
    this.add.text(48, 37, '👤', { fontSize: '16px' }).setOrigin(0.5);

    this.add.text(82, 30, 'PLAYER_01', {
      fontFamily: 'Orbitron', fontSize: '14px', color: '#ffffff',
    });
    this.add.text(82, 50, 'Level 1  •  0 Wins', {
      fontFamily: 'Inter', fontSize: '11px', color: '#8899aa',
    });

    // ─── Main Title ───
    const titleY = height * 0.18;
    const title = this.add.text(width / 2, titleY, 'TETRIS VS GUNNER', {
      fontFamily: 'Orbitron', fontSize: '48px', fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#001a33', strokeThickness: 4,
    }).setOrigin(0.5);

    // Title glow pulse
    this.tweens.add({
      targets: title,
      alpha: { from: 0.85, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Subtitle
    this.add.text(width / 2, titleY + 45, 'CHOOSE YOUR SIDE', {
      fontFamily: 'Inter', fontSize: '16px', color: '#8899aa',
      letterSpacing: 8,
    }).setOrigin(0.5);

    // ─── Left Sidebar Menu ───
    const sidebarX = 30;
    const sidebarY = 110;
    const menuItems = [
      { label: '⚙  SETTINGS', action: () => {} },
      { label: '📊  STATS', action: () => {} },
      { label: '❓  HOW TO PLAY', action: () => {} },
    ];

    menuItems.forEach((item, i) => {
      const y = sidebarY + i * 42;
      const bg = this.add.graphics();
      bg.fillStyle(0x0d1220, 0.6);
      bg.fillRoundedRect(sidebarX, y, 180, 34, 6);

      const text = this.add.text(sidebarX + 15, y + 8, item.label, {
        fontFamily: 'Inter', fontSize: '13px', color: '#6688aa',
      });

      const hitZone = this.add.zone(sidebarX + 90, y + 17, 180, 34).setInteractive({ useHandCursor: true });
      hitZone.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(0x0d1830, 0.9);
        bg.fillRoundedRect(sidebarX, y, 180, 34, 6);
        bg.lineStyle(1, COLORS.ACCENT_BLUE, 0.3);
        bg.strokeRoundedRect(sidebarX, y, 180, 34, 6);
        text.setColor('#00d4ff');
      });
      hitZone.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(0x0d1220, 0.6);
        bg.fillRoundedRect(sidebarX, y, 180, 34, 6);
        text.setColor('#6688aa');
      });
    });

    // ─── Role Selection Cards ───
    const cardY = height * 0.5;
    const cardGap = 40;
    const cardW = 320;
    const cardH = 340;

    // Tetris Card
    this.createRoleCard(
      width / 2 - cardW - cardGap / 2, cardY,
      cardW, cardH,
      '🧱', 'TETRIS PLAYER',
      'Stack blocks, clear lines, crush the enemy.\nSpecial abilities charge as you clear.',
      COLORS.ACCENT_BLUE,
      [
        { label: 'Role', value: 'Builder' },
        { label: 'Difficulty', value: '★★☆' },
        { label: 'Abilities', value: '4 Specials' },
      ],
      () => this.selectRole('tetris')
    );

    // Gunner Card
    this.createRoleCard(
      width / 2 + cardGap / 2, cardY,
      cardW, cardH,
      '🔫', 'GUNNER PLAYER',
      'Aim, shoot, destroy blocks.\nSwitch weapons and dominate the board.',
      COLORS.ACCENT_PINK,
      [
        { label: 'Role', value: 'Destroyer' },
        { label: 'Difficulty', value: '★★★' },
        { label: 'Weapons', value: '3 Types' },
      ],
      () => this.selectRole('gunner')
    );

    // ─── Bottom bar ───
    this.add.text(width / 2, height - 25, 'v0.1.0  •  Phase 1 Prototype', {
      fontFamily: 'Inter', fontSize: '11px', color: '#445566',
    }).setOrigin(0.5);
  }

  createRoleCard(x, y, w, h, emoji, title, desc, accentColor, stats, onClick) {
    const g = this.add.graphics();
    const centerX = x + w / 2;

    // Card background
    g.fillStyle(0x0d1220, 0.9);
    g.fillRoundedRect(x, y - h / 2, w, h, 12);
    g.lineStyle(1.5, accentColor, 0.3);
    g.strokeRoundedRect(x, y - h / 2, w, h, 12);

    // Emoji icon
    this.add.text(centerX, y - h / 2 + 50, emoji, {
      fontSize: '48px',
    }).setOrigin(0.5);

    // Title
    this.add.text(centerX, y - h / 2 + 105, title, {
      fontFamily: 'Orbitron', fontSize: '18px', fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Accent line
    g.fillStyle(accentColor, 0.6);
    g.fillRect(centerX - 30, y - h / 2 + 125, 60, 2);

    // Description
    this.add.text(centerX, y - h / 2 + 150, desc, {
      fontFamily: 'Inter', fontSize: '12px', color: '#8899aa',
      align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0);

    // Stats
    const statsY = y - h / 2 + 210;
    stats.forEach((stat, i) => {
      const sy = statsY + i * 24;
      this.add.text(x + 30, sy, stat.label, {
        fontFamily: 'Inter', fontSize: '11px', color: '#667788',
      });
      this.add.text(x + w - 30, sy, stat.value, {
        fontFamily: 'Orbitron', fontSize: '11px',
        color: Phaser.Display.Color.IntegerToRGB(accentColor).r > 100 ? '#' + accentColor.toString(16).padStart(6, '0') : '#00d4ff',
      }).setOrigin(1, 0);
    });

    // Play button
    const btnY = y + h / 2 - 55;
    const btnW = w - 60;
    const btnH = 42;
    const btnG = this.add.graphics();
    btnG.fillStyle(accentColor, 0.2);
    btnG.fillRoundedRect(x + 30, btnY, btnW, btnH, 8);
    btnG.lineStyle(1.5, accentColor, 0.6);
    btnG.strokeRoundedRect(x + 30, btnY, btnW, btnH, 8);

    const btnText = this.add.text(centerX, btnY + btnH / 2, '▶  PLAY', {
      fontFamily: 'Orbitron', fontSize: '15px', fontStyle: 'bold',
      color: '#' + accentColor.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    const hitZone = this.add.zone(centerX, btnY + btnH / 2, btnW, btnH).setInteractive({ useHandCursor: true });
    hitZone.on('pointerover', () => {
      btnG.clear();
      btnG.fillStyle(accentColor, 0.4);
      btnG.fillRoundedRect(x + 30, btnY, btnW, btnH, 8);
      btnG.lineStyle(2, accentColor, 0.9);
      btnG.strokeRoundedRect(x + 30, btnY, btnW, btnH, 8);
      btnText.setColor('#ffffff');
    });
    hitZone.on('pointerout', () => {
      btnG.clear();
      btnG.fillStyle(accentColor, 0.2);
      btnG.fillRoundedRect(x + 30, btnY, btnW, btnH, 8);
      btnG.lineStyle(1.5, accentColor, 0.6);
      btnG.strokeRoundedRect(x + 30, btnY, btnW, btnH, 8);
      btnText.setColor('#' + accentColor.toString(16).padStart(6, '0'));
    });
    hitZone.on('pointerdown', onClick);
  }

  selectRole(role) {
    this.scene.start(SCENES.LOBBY, { role });
  }

  update() {
    // Animate background particles
    this.particleGraphics.clear();
    const { height } = this.scale;
    for (const p of this.bgParticles) {
      p.y += p.speed;
      if (p.y > height + 10) {
        p.y = -10;
        p.x = Math.random() * this.scale.width;
      }
      this.particleGraphics.fillStyle(p.color, p.alpha);
      this.particleGraphics.fillRect(p.x, p.y, p.size, p.size);
    }
  }
}
