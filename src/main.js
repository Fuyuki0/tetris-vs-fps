import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config/constants.js';
import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import MenuScene from './scenes/MenuScene.js';
import LobbyScene from './scenes/LobbyScene.js';
import GameplayScene from './scenes/GameplayScene.js';
import GameOverScene from './scenes/GameOverScene.js';

// ─── Phaser 3 Game Configuration ──────────────────────────
const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    LobbyScene,
    GameplayScene,
    GameOverScene,
  ],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  input: {
    keyboard: true,
    mouse: true,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
  },
};

let game;

// ─── Initialize Game ─────────────────────────────────────────
document.fonts.ready.then(() => {
  game = new Phaser.Game(config);
  window.game = game;
});

// Handle window resize
window.addEventListener('resize', () => {
  if (game) {
    game.scale.resize(GAME_WIDTH, GAME_HEIGHT);
  }
});

export default game;
