import Phaser from 'phaser';
import QRCode from 'qrcode';
import { MAX_PLAYERS, type GameInfo, type RoomState } from '../../../shared/protocol';
import { listen, net, socket } from '../net';
import { COLORS, WIDTH, addBackdrop, hex, panel, text, toast } from '../theme';

const SLOT_W = 440;
const SLOT_H = 92;

export class LobbyScene extends Phaser.Scene {
  static readonly KEY = 'Lobby';

  private codeText!: Phaser.GameObjects.Text;
  private urlText!: Phaser.GameObjects.Text;
  private qr: Phaser.GameObjects.Image | null = null;
  private qrFor = '';
  private slots: Phaser.GameObjects.Container[] = [];
  private gameCards: Phaser.GameObjects.Container[] = [];
  private knownPlayers = new Set<string>();
  private hintText!: Phaser.GameObjects.Text;

  constructor() {
    super(LobbyScene.KEY);
  }

  create() {
    this.qr = null;
    this.qrFor = '';
    this.slots = [];
    this.gameCards = [];
    this.knownPlayers = new Set();

    addBackdrop(this);

    const title = text(this, WIDTH / 2, 90, 'PARTY PACK', 96, COLORS.accent, {
      fontStyle: '700',
      stroke: '#ff5d73',
      strokeThickness: 10,
    });
    this.tweens.add({ targets: title, scale: 1.05, angle: 1.5, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Join instructions (left).
    panel(this, 80, 190, 700, 640);
    text(this, 430, 240, 'Grab your phone and go to', 32, COLORS.muted);
    this.urlText = text(this, 430, 295, '…', 44, COLORS.text);
    text(this, 430, 370, 'Room code', 32, COLORS.muted);
    this.codeText = text(this, 430, 445, '····', 120, COLORS.accent, { fontStyle: '700' }).setLetterSpacing(16);

    // Player slots (right).
    panel(this, 860, 190, 980, 640);
    text(this, 1350, 240, 'Players', 40, COLORS.text);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const x = 900 + (i % 2) * (SLOT_W + 20) + SLOT_W / 2;
      const y = 300 + Math.floor(i / 2) * (SLOT_H + 26) + SLOT_H / 2;
      this.slots.push(this.add.container(x, y));
    }

    this.hintText = text(this, WIDTH / 2, 880, '', 30, COLORS.muted);

    listen(this, 'room', (s: RoomState) => this.render(s));
    if (net.room) this.render(net.room);
    else this.urlText.setText('Connecting…');
  }

  private render(state: RoomState) {
    this.codeText.setText(state.code);
    this.urlText.setText(state.joinUrl.replace(/^https?:\/\//, ''));
    this.renderQr(`${state.joinUrl}/?code=${state.code}`);
    this.renderPlayers(state);
    const playerCount = state.players.filter((p) => p.connected).length;
    if (state.debugMode) {
      this.hintText.setText('DEBUG MODE: pick a game (click here, or the VIP can start it from their phone)');
      this.renderGames(state.games, playerCount);
    } else {
      this.hintText.setText('The VIP picks the games and rounds on their phone. Then spin the wheel!');
      this.renderWheelPanel(state, playerCount);
    }
  }

  /** Normal mode: what's on the wheel, how many rounds, and a button to spin. */
  private renderWheelPanel(state: RoomState, playerCount: number) {
    for (const c of this.gameCards) c.destroy();
    const cardW = 1240;
    const cardH = 150;
    const card = this.add.container(WIDTH / 2, 985);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panelLight, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
    card.add(bg);

    const labels = state.wheelEntries.filter((e) => state.settings.enabled.includes(e.id)).map((e) => e.label);
    const rounds = state.settings.rounds;
    card.add(
      text(this, -210, -28, `On the wheel: ${labels.join(',  ')}`, 28, COLORS.text, {
        wordWrap: { width: 760 },
        align: 'center',
      }),
    );
    card.add(text(this, -210, 38, `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`, 34, COLORS.accent, { fontStyle: '700' }));

    const ready = playerCount > 0;
    const button = this.add.container(cardW / 2 - 200, 0);
    const fill = this.add.graphics();
    fill.fillStyle(ready ? 0xff5d73 : 0x5f57a0, 1);
    fill.fillRoundedRect(-170, -50, 340, 100, 22);
    button.add([fill, text(this, 0, 0, ready ? 'SPIN!' : 'Need players', ready ? 52 : 32, COLORS.text, { fontStyle: '700' })]);
    if (ready) {
      button.setSize(340, 100).setInteractive({ useHandCursor: true });
      button.on('pointerover', () => this.tweens.add({ targets: button, scale: 1.06, duration: 120 }));
      button.on('pointerout', () => this.tweens.add({ targets: button, scale: 1, duration: 120 }));
      button.on('pointerdown', () =>
        socket.emit('room:startSession', (res) => {
          if (!res.ok) toast(this, res.error);
        }),
      );
    }
    card.add(button);
    this.gameCards = [card];
  }

  private renderQr(url: string) {
    if (this.qrFor === url) return;
    this.qrFor = url;
    QRCode.toDataURL(url, { margin: 1, width: 260, color: { dark: '#140f2e', light: '#ffffff' } }).then((dataUrl) => {
      const img = new Image();
      img.onload = () => {
        if (!this.scene.isActive()) return;
        const key = `qr-${url}`;
        if (!this.textures.exists(key)) this.textures.addImage(key, img);
        this.qr?.destroy();
        this.qr = this.add.image(430, 680, key).setDisplaySize(240, 240);
      };
      img.src = dataUrl;
    });
  }

  private renderPlayers(state: RoomState) {
    this.slots.forEach((slot, i) => {
      slot.removeAll(true);
      const p = state.players[i];
      const g = this.add.graphics();
      if (p) {
        g.fillStyle(hex(p.color), 1);
        g.fillRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 20);
        slot.add(g);
        slot.add(text(this, 0, 0, p.name, 44, '#140f2e', { fontStyle: '700' }));
        if (p.isVip) slot.add(text(this, SLOT_W / 2 - 60, -SLOT_H / 2 + 20, '★ VIP', 22, '#140f2e'));
        if (!p.connected) slot.setAlpha(0.4);
        else slot.setAlpha(1);

        // Pop new arrivals in.
        if (!this.knownPlayers.has(p.id)) {
          this.knownPlayers.add(p.id);
          slot.setScale(0.2);
          this.tweens.add({ targets: slot, scale: 1, duration: 450, ease: 'Back.easeOut' });
        }
      } else {
        g.lineStyle(4, COLORS.panelLight, 1);
        g.strokeRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 20);
        slot.add(g);
        slot.add(text(this, 0, 0, 'waiting…', 30, '#5f57a0'));
        slot.setAlpha(1).setScale(1);
      }
    });
    this.knownPlayers = new Set(state.players.map((p) => p.id));
  }

  private renderGames(games: GameInfo[], playerCount: number) {
    for (const c of this.gameCards) c.destroy();
    const buttonW = 220;
    const buttonH = 58;
    const buttonGap = 20;
    const cardH = 150;
    const gap = 40;
    const cardWidths = games.map((g) => Math.max(520, g.modes.length * (buttonW + buttonGap) + 40));
    const totalW = cardWidths.reduce((a, b) => a + b, 0) + gap * (games.length - 1);
    let x = WIDTH / 2 - totalW / 2;

    this.gameCards = games.map((info, i) => {
      const cardW = cardWidths[i];
      const ready = playerCount >= info.minPlayers && playerCount <= info.maxPlayers;
      const card = this.add.container(x + cardW / 2, 985);
      x += cardW + gap;

      const bg = this.add.graphics();
      bg.fillStyle(COLORS.panelLight, 1);
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
      card.add(bg);
      card.add(text(this, 0, -40, info.name, 44, COLORS.text, { fontStyle: '700' }));

      if (!ready) {
        card.add(text(this, 0, 30, `Needs ${info.minPlayers}-${info.maxPlayers} players`, 26, COLORS.muted));
        return card;
      }

      // One button per mode (e.g. Normal / Hard); clicking starts the game in that mode.
      const rowW = info.modes.length * buttonW + (info.modes.length - 1) * buttonGap;
      info.modes.forEach((mode, m) => {
        const button = this.add.container(-rowW / 2 + m * (buttonW + buttonGap) + buttonW / 2, 30);
        const fill = this.add.graphics();
        fill.fillStyle(m === 0 ? 0xff5d73 : 0x8b2fc9, 1);
        fill.fillRoundedRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 16);
        button.add([fill, text(this, 0, 0, mode.name, 30, COLORS.text, { fontStyle: '700' })]);
        button.setSize(buttonW, buttonH).setInteractive({ useHandCursor: true });
        button.on('pointerover', () => this.tweens.add({ targets: button, scale: 1.08, duration: 120 }));
        button.on('pointerout', () => this.tweens.add({ targets: button, scale: 1, duration: 120 }));
        button.on('pointerdown', () => {
          socket.emit('room:startGame', { gameId: info.id, modeId: mode.id }, (res) => {
            if (!res.ok) toast(this, res.error);
          });
        });
        card.add(button);
      });
      return card;
    });
  }
}
