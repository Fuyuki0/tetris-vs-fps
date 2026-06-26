import Phaser from 'phaser';
import { COLORS, SCENES } from '../config/constants.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.BOOT });
  }

  create() {
    // Quick splash then go to preload
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(COLORS.BG_DARK);

    // Logo text
    const title = this.add.text(width / 2, height / 2 - 30, 'TETRIS VS GUNNER', {
      fontFamily: 'Orbitron',
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#00d4ff',
      stroke: '#001a33',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    const sub = this.add.text(width / 2, height / 2 + 30, 'Loading...', {
      fontFamily: 'Inter',
      fontSize: '16px',
      color: '#8899aa',
    }).setOrigin(0.5).setAlpha(0);

    // Fade in
    this.tweens.add({
      targets: [title, sub],
      alpha: 1,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        this.time.delayedCall(800, () => {
          this.scene.start(SCENES.PRELOAD);
        });
      },
    });
  }
}
