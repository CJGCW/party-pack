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

    text(this, WIDTH / 2, 880, 'Pick a game (click here, or the VIP can start it from their phone)', 30, COLORS.muted);

    listen(this, 'room', (s: RoomState) => this.render(s));
    if (net.room) this.render(net.room);
    else this.urlText.setText('Connecting…');
  }

  private render(state: RoomState) {
    this.codeText.setText(state.code);
    this.urlText.setText(state.joinUrl.replace(/^https?:\/\//, ''));
    this.renderQr(`${state.joinUrl}/?code=${state.code}`);
    this.renderPlayers(state);
    this.renderGames(state.games, state.players.filter((p) => p.connected).length);
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
    const cardW = 520;
    const cardH = 120;
    const gap = 40;
    const startX = WIDTH / 2 - ((games.length - 1) * (cardW + gap)) / 2;

    this.gameCards = games.map((info, i) => {
      const ready = playerCount >= info.minPlayers && playerCount <= info.maxPlayers;
      const card = this.add.container(startX + i * (cardW + gap), 980);
      const bg = this.add.graphics();
      bg.fillStyle(ready ? 0xff5d73 : COLORS.panelLight, 1);
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
      card.add(bg);
      card.add(text(this, 0, -22, info.name, 46, COLORS.text, { fontStyle: '700' }));
      card.add(
        text(this, 0, 28, ready ? `${info.minPlayers}-${info.maxPlayers} players` : `Needs ${info.minPlayers}+ players`, 24, COLORS.text),
      );

      card.setSize(cardW, cardH).setInteractive({ useHandCursor: true });
      card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.06, duration: 120 }));
      card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 120 }));
      card.on('pointerdown', () => {
        socket.emit('room:startGame', { gameId: info.id }, (res) => {
          if (!res.ok) toast(this, res.error);
        });
      });
      return card;
    });
  }
}
