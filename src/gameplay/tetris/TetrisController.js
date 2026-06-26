// ─── Tetris Controller ────────────────────────────────────
// Handles keyboard input for the Tetris player with DAS (Delayed Auto Shift).

export default class TetrisController {
  constructor(scene, board) {
    this.scene = scene;
    this.board = board;
    this.enabled = true;

    // DAS (Delayed Auto Shift) settings
    this.dasDelay = 170;  // ms before auto-repeat starts
    this.dasRate = 50;    // ms between auto-repeat moves
    this.dasTimer = 0;
    this.dasDirection = 0; // -1 left, 0 none, 1 right
    this.dasActive = false;

    // Key state tracking
    this.keys = {
      left: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      down: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      space: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      up: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      z: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      x: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      c: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
    };

    // Bind key events
    this.keys.up.on('down', () => this._onRotateCW());
    this.keys.x.on('down', () => this._onRotateCW());
    this.keys.z.on('down', () => this._onRotateCCW());
    this.keys.space.on('down', () => this._onHardDrop());
    this.keys.c.on('down', () => this._onHold());

    // Soft drop rate
    this.softDropRate = 50; // ms
    this.softDropTimer = 0;
  }

  _onRotateCW() {
    if (!this.enabled) return;
    this.board.rotate(1);
  }

  _onRotateCCW() {
    if (!this.enabled) return;
    this.board.rotate(-1);
  }

  _onHardDrop() {
    if (!this.enabled) return;
    this.board.hardDrop();
  }

  _onHold() {
    if (!this.enabled) return;
    this.board.hold();
  }

  update(delta) {
    if (!this.enabled) return;

    // Horizontal movement with DAS
    const leftDown = this.keys.left.isDown;
    const rightDown = this.keys.right.isDown;

    if (leftDown && !rightDown) {
      if (this.dasDirection !== -1) {
        this.dasDirection = -1;
        this.dasTimer = 0;
        this.dasActive = false;
        this.board.moveLeft();
      } else {
        this.dasTimer += delta;
        if (!this.dasActive && this.dasTimer >= this.dasDelay) {
          this.dasActive = true;
          this.dasTimer = 0;
          this.board.moveLeft();
        } else if (this.dasActive && this.dasTimer >= this.dasRate) {
          this.dasTimer = 0;
          this.board.moveLeft();
        }
      }
    } else if (rightDown && !leftDown) {
      if (this.dasDirection !== 1) {
        this.dasDirection = 1;
        this.dasTimer = 0;
        this.dasActive = false;
        this.board.moveRight();
      } else {
        this.dasTimer += delta;
        if (!this.dasActive && this.dasTimer >= this.dasDelay) {
          this.dasActive = true;
          this.dasTimer = 0;
          this.board.moveRight();
        } else if (this.dasActive && this.dasTimer >= this.dasRate) {
          this.dasTimer = 0;
          this.board.moveRight();
        }
      }
    } else {
      this.dasDirection = 0;
      this.dasTimer = 0;
      this.dasActive = false;
    }

    // Soft drop
    if (this.keys.down.isDown) {
      this.softDropTimer += delta;
      if (this.softDropTimer >= this.softDropRate) {
        this.softDropTimer = 0;
        this.board.moveDown();
      }
    } else {
      this.softDropTimer = 0;
    }
  }

  destroy() {
    // Phaser handles cleanup
  }
}
