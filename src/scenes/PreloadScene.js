import Phaser from 'phaser';
import { COLORS, SCENES } from '../config/constants.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.PRELOAD });
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.BG_DARK);

    // Title
    this.add.text(width / 2, height / 2 - 60, 'TETRIS VS FPS', {
      fontFamily: 'Orbitron',
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#00d4ff',
    }).setOrigin(0.5);

    // Loading bar background
    const barWidth = 400;
    const barHeight = 8;
    const barX = width / 2 - barWidth / 2;
    const barY = height / 2;

    const barBg = this.add.graphics();
    barBg.fillStyle(0x1a3a4a, 0.5);
    barBg.fillRoundedRect(barX, barY, barWidth, barHeight, 4);

    // Loading bar fill
    const barFill = this.add.graphics();

    // Loading text
    const loadText = this.add.text(width / 2, barY + 30, 'Initializing systems...', {
      fontFamily: 'Inter',
      fontSize: '14px',
      color: '#8899aa',
    }).setOrigin(0.5);

    // Simulate loading (since we use programmatic graphics, no real assets to load)
    let progress = 0;
    const messages = [
      'Initializing systems...',
      'Calibrating weapons...',
      'Building tetris grid...',
      'Loading perspectives...',
      'Preparing arena...',
      'Ready!',
    ];

    const timer = this.time.addEvent({
      delay: 200,
      repeat: 20,
      callback: () => {
        progress += 0.05;
        progress = Math.min(progress, 1);

        barFill.clear();
        barFill.fillStyle(0x00d4ff, 1);
        barFill.fillRoundedRect(barX, barY, barWidth * progress, barHeight, 4);

        // Glow
        barFill.fillStyle(0x00d4ff, 0.2);
        barFill.fillRoundedRect(barX, barY - 2, barWidth * progress, barHeight + 4, 4);

        const msgIndex = Math.min(Math.floor(progress * messages.length), messages.length - 1);
        loadText.setText(messages[msgIndex]);

        if (progress >= 1) {
          this.time.delayedCall(400, () => {
            this.scene.start(SCENES.MENU);
          });
        }
      },
    });
  }
}
