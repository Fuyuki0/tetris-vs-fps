import Phaser from 'phaser';
import { COLORS, SCENES } from '../config/constants.js';

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.LOBBY });
  }

  init(data) {
    this.selectedRole = data.role || 'tetris';
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.BG_DARK);

    // Background pulse ring
    this.ring = this.add.graphics();
    this.ringPhase = 0;

    // Role icon
    const emoji = this.selectedRole === 'tetris' ? '🧱' : '🔫';
    this.add.text(width / 2, height * 0.3, emoji, {
      fontSize: '64px',
    }).setOrigin(0.5);

    // Title
    const roleName = this.selectedRole === 'tetris' ? 'TETRIS PLAYER' : 'GUNNER PLAYER';
    this.add.text(width / 2, height * 0.45, `Playing as ${roleName}`, {
      fontFamily: 'Orbitron', fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    // Waiting text with dots animation
    this.waitText = this.add.text(width / 2, height * 0.55, 'Preparing arena', {
      fontFamily: 'Inter', fontSize: '16px', color: '#8899aa',
    }).setOrigin(0.5);
    this.dotCount = 0;

    this.time.addEvent({
      delay: 500,
      repeat: -1,
      callback: () => {
        this.dotCount = (this.dotCount + 1) % 4;
        this.waitText.setText('Preparing arena' + '.'.repeat(this.dotCount));
      },
    });

    // Tip text
    const tips = [
      this.selectedRole === 'tetris'
        ? 'TIP: Clear 4 lines at once for massive damage!'
        : 'TIP: Aim for blocks about to complete a line!',
      this.selectedRole === 'tetris'
        ? 'TIP: Use Hold (C) to save a useful piece.'
        : 'TIP: Switch to the AK-47 for rapid fire.',
      'TIP: Combos deal extra damage each time!',
    ];
    const tipText = this.add.text(width / 2, height * 0.7, tips[0], {
      fontFamily: 'Inter', fontSize: '13px', color: '#556677', fontStyle: 'italic',
    }).setOrigin(0.5);

    let tipIdx = 0;
    this.time.addEvent({
      delay: 3000,
      repeat: -1,
      callback: () => {
        tipIdx = (tipIdx + 1) % tips.length;
        this.tweens.add({
          targets: tipText, alpha: 0, duration: 300,
          onComplete: () => {
            tipText.setText(tips[tipIdx]);
            this.tweens.add({ targets: tipText, alpha: 1, duration: 300 });
          },
        });
      },
    });

    // Cancel button
    const cancelBtn = this.add.text(width / 2, height * 0.85, '✕  CANCEL', {
      fontFamily: 'Orbitron', fontSize: '14px', color: '#ff2d55',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    cancelBtn.on('pointerover', () => cancelBtn.setColor('#ff6688'));
    cancelBtn.on('pointerout', () => cancelBtn.setColor('#ff2d55'));
    cancelBtn.on('pointerdown', () => this.scene.start(SCENES.MENU));

    // Auto-start gameplay after delay (simulating matchmaking)
    this.time.delayedCall(3000, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENES.GAMEPLAY, { role: this.selectedRole });
      });
    });
  }

  update() {
    // Animated ring
    this.ring.clear();
    this.ringPhase += 0.02;
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height * 0.3;

    for (let i = 0; i < 3; i++) {
      const phase = this.ringPhase + i * (Math.PI * 2 / 3);
      const radius = 50 + Math.sin(phase) * 10;
      const alpha = 0.15 + Math.sin(phase) * 0.1;
      const color = this.selectedRole === 'tetris' ? COLORS.ACCENT_BLUE : COLORS.ACCENT_PINK;
      this.ring.lineStyle(2, color, alpha);
      this.ring.strokeCircle(cx, cy, radius);
    }
  }
}
