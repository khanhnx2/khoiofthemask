import {
    _decorator, Canvas, Component, Director, Graphics, Label, Node, ResolutionPolicy, UIOpacity, UITransform,
    director, sys, tween, view,
} from 'cc';
import { EDITOR } from 'cc/env';
import { EndlessGenerator } from './logic/endless-generator';
import { DeathCause, GameSession, SessionEvent } from './logic/game-session';
import { parseLevel } from './logic/level-parser';
import { LEVELS } from './logic/levels';
import { SKINS, SaveData } from './logic/save-data';
import { Dir, Item } from './logic/types';
import { PALETTE, hex, withAlpha } from './view/palette';
import { Sound } from './view/sound';
import { SwipeInput } from './view/swipe-input';
import {
    drawLantern, makeButton, makeLabel, makeNode, makeOverlay, setButtonClickHook, starText,
} from './view/ui-kit';
import { TILE, WorldView } from './view/world-view';

const { ccclass } = _decorator;

const DESIGN_W = 720;
const DESIGN_H = 1280;
const ENDLESS_DARKNESS_SPEED = 0.8;
/** Pause between the end of a run and the result panel, so the death or win effect can play. */
const RESULT_DELAY = 0.9;

const DEATH_TEXT: Record<DeathCause, string> = {
    spike: 'Khôi chạm phải gai!',
    bat: 'Khôi bị dơi tông trúng!',
    dart: 'Khôi trúng phải tên!',
    darkness: 'Bóng Tối đã nuốt chửng Khôi!',
};

interface Hud {
    left: Label;
    center: Label;
    right: Label;
    status: Label;
}

/**
 * Entry component. Builds every screen from code, so the scene only needs this
 * component (it is also attached automatically if the scene does not have it).
 */
@ccclass('GameRoot')
export class GameRoot extends Component {
    private save!: SaveData;
    private input!: SwipeInput;
    private sound!: Sound;
    private width = DESIGN_W;
    private height = DESIGN_H;
    private gameLayer!: Node;
    private hudLayer!: Node;
    private uiLayer!: Node;

    private session: GameSession | null = null;
    private worldView: WorldView | null = null;
    private hud: Hud | null = null;
    private levelIndex = 0;
    private paused = false;
    /** Seconds until the result panel; null while the run is still going. */
    private endTimer: number | null = null;
    private deathCause: DeathCause = 'spike';
    private hudCache = '';

    onLoad(): void {
        this.setupResolution();
        const t = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        t.setContentSize(this.width, this.height);

        this.save = new SaveData(sys.localStorage);
        this.drawBackground();
        this.gameLayer = makeNode('GameLayer', this.node, this.width, this.height);
        this.hudLayer = makeNode('HudLayer', this.node, this.width, this.height);
        this.uiLayer = makeNode('UiLayer', this.node, this.width, this.height);
        this.input = new SwipeInput((dir) => this.onSwipe(dir));
        this.sound = new Sound(makeNode('Audio', this.node), this.save.soundOn);
        setButtonClickHook(() => this.sound.play('sfx-click', 0.6));
        this.showMenu();
    }

    onDestroy(): void {
        this.input?.destroy();
    }

    update(dt: number): void {
        this.sound.tick(dt);
        const s = this.session;
        const v = this.worldView;
        if (!s || !v) return;
        if (!this.paused) {
            // Clamp the step so a hitch never teleports the player through a wall check.
            s.update(Math.min(dt, 1 / 20));
            for (const e of s.events) {
                v.handle(e);
                this.playEventSound(e);
                if (e.type === 'death') this.deathCause = e.cause;
            }
            s.events.length = 0;
            if (s.isOver && this.endTimer === null) {
                this.endTimer = RESULT_DELAY;
                this.input.enabled = false;
            }
            if (this.endTimer !== null && this.endTimer > 0) {
                this.endTimer -= dt;
                if (this.endTimer <= 0) this.finishRun();
            }
        }
        v.update(this.paused ? 0 : dt);
        this.refreshHud();
    }

    // ---------------------------------------------------------------- setup

    /** Portrait 720x1280. Tall phones see more cave; wide windows get side margins. */
    private setupResolution(): void {
        const frame = view.getFrameSize();
        const tallEnough = frame.height / frame.width >= DESIGN_H / DESIGN_W;
        view.setDesignResolutionSize(DESIGN_W, DESIGN_H, tallEnough ? ResolutionPolicy.FIXED_WIDTH : ResolutionPolicy.FIXED_HEIGHT);
        const size = view.getVisibleSize();
        this.width = size.width;
        this.height = size.height;
    }

    private drawBackground(): void {
        const g = makeNode('Background', this.node, this.width, this.height).addComponent(Graphics);
        const w = this.width;
        const h = this.height;
        g.fillColor = PALETTE.backgroundDeep;
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        // Soft vertical bands give the cave some depth behind the board.
        const bands = 6;
        for (let i = 0; i < bands; i++) {
            g.fillColor = withAlpha(PALETTE.background, 255 - i * 30);
            const bw = (11 * TILE) * (1 - i * 0.08);
            g.rect(-bw / 2, -h / 2, bw, h);
            g.fill();
        }
    }

    private get panelWidth(): number {
        return Math.min(this.width, DESIGN_W);
    }

    // ---------------------------------------------------------------- game flow

    private startLevel(index: number): void {
        const def = LEVELS[index];
        this.levelIndex = index;
        this.beginSession(new GameSession(parseLevel(def), { mode: 'level', darknessSpeed: def.darkness ?? 0 }));
        this.flashText(`Màn ${index + 1}: ${def.name}`, def.hint);
    }

    private startEndless(): void {
        const gen = new EndlessGenerator(Math.floor(Math.random() * 1e9));
        this.beginSession(new GameSession(gen.world, {
            mode: 'endless', darknessSpeed: ENDLESS_DARKNESS_SPEED, generator: gen,
        }));
        this.flashText('Chế độ Vô Tận', 'Leo càng cao càng tốt. Bóng Tối không bao giờ dừng!');
    }

    private beginSession(session: GameSession): void {
        this.endSession();
        this.session = session;
        this.worldView = new WorldView(this.gameLayer, session, this.save.skin, this.width, this.height);
        this.paused = false;
        this.endTimer = null;
        this.buildHud();
        this.input.enabled = true;
        this.sound.playMusic('music-game');
    }

    private playEventSound(e: SessionEvent): void {
        switch (e.type) {
            case 'slideStart': this.sound.play('sfx-slide', 0.5); break;
            case 'shieldBreak': this.sound.play('sfx-shield'); break;
            case 'death': this.sound.play('sfx-death'); break;
            case 'win': this.sound.play('sfx-win'); break;
            case 'collect':
                switch (e.item) {
                    case Item.Firefly: this.sound.play('sfx-firefly', 0.5); break;
                    case Item.Coin: this.sound.play('sfx-coin', 0.8); break;
                    case Item.Star: this.sound.play('sfx-star'); break;
                    default: this.sound.play('sfx-power'); break;
                }
                break;
            default: break;
        }
    }

    /** Small corner toggle used on the menu and pause screens. */
    private soundToggle(parent: Node, x: number, y: number): void {
        const label = this.sound.isEnabled ? '♪ BẬT' : '♪ TẮT';
        makeButton(parent, label, x, y, 150, 70, () => {
            const on = !this.sound.isEnabled;
            this.save.setSound(on);
            this.sound.setEnabled(on);
            if (this.session) { this.uiLayer.destroyAllChildren(); this.showPause(); } else this.showMenu();
        }, { textSize: 26, color: this.sound.isEnabled ? PALETTE.buttonGood : PALETTE.button });
    }

    private endSession(): void {
        this.worldView?.destroy();
        this.worldView = null;
        this.session = null;
        this.hud = null;
        this.hudCache = '';
        this.hudLayer.destroyAllChildren();
        this.uiLayer.destroyAllChildren();
        this.input.enabled = false;
    }

    private onSwipe(dir: Dir): void {
        if (this.session && !this.paused) this.session.move(dir);
    }

    private setPaused(paused: boolean): void {
        if (!this.session || this.session.isOver) return;
        this.paused = paused;
        this.input.enabled = !paused;
        this.uiLayer.destroyAllChildren();
        if (paused) this.showPause();
    }

    /** Save the results of the run and show the result panel. */
    private finishRun(): void {
        const s = this.session;
        if (!s) return;
        this.save.addCoins(s.coins);
        if (s.mode === 'endless') {
            const isBest = this.save.recordEndless(s.score, s.height);
            this.showEndlessResult(s, isBest);
        } else if (s.state === 'won') {
            this.save.recordLevel(this.levelIndex, s.stars, LEVELS.length);
            this.showLevelWin(s);
        } else {
            this.showLevelLose(s);
        }
    }

    // ---------------------------------------------------------------- HUD

    private buildHud(): void {
        const top = this.height / 2 - 56;
        const half = this.panelWidth / 2;
        const bar = makeNode('HudBar', this.hudLayer).addComponent(Graphics);
        bar.fillColor = withAlpha(PALETTE.backgroundDeep, 200);
        bar.rect(-this.width / 2, top - 44, this.width, 100);
        bar.fill();

        this.hud = {
            left: makeLabel(this.hudLayer, '', -half + 120, top, { size: 30, bold: true }),
            center: makeLabel(this.hudLayer, '', 0, top, { size: 40, bold: true, color: PALETTE.firefly }),
            right: makeLabel(this.hudLayer, '', half - 190, top, { size: 30, bold: true, color: PALETTE.coin }),
            status: makeLabel(this.hudLayer, '', 0, top - 76, { size: 26, bold: true, color: PALETTE.shield }),
        };
        makeButton(this.hudLayer, 'II', half - 56, top, 72, 72, () => this.setPaused(true), { textSize: 30 });
    }

    private refreshHud(): void {
        const s = this.session;
        const hud = this.hud;
        if (!s || !hud) return;
        const left = s.mode === 'endless' ? `${s.height} m` : starText(s.stars);
        const effects: string[] = [];
        if (s.shield) effects.push('KHIÊN');
        if (s.magnetTime > 0) effects.push(`NAM CHÂM ${Math.ceil(s.magnetTime)}s`);
        if (s.freezeTime > 0) effects.push(`BĂNG ${Math.ceil(s.freezeTime)}s`);
        const status = effects.join('  •  ');
        const key = `${left}|${s.score}|${s.coins}|${status}`;
        if (key === this.hudCache) return;
        this.hudCache = key;
        hud.left.string = left;
        hud.center.string = String(s.score);
        hud.right.string = `● ${this.save.coins + s.coins}`;
        hud.status.string = status;
    }

    /** Level title and tip that fade out after a few seconds. */
    private flashText(title: string, hint?: string): void {
        const node = makeNode('Flash', this.hudLayer);
        node.setPosition(0, -this.height / 2 + 240);
        const opacity = node.addComponent(UIOpacity);
        makeLabel(node, title, 0, 30, { size: 40, bold: true });
        if (hint) makeLabel(node, hint, 0, -26, { size: 26, color: PALETTE.textDim, width: this.panelWidth - 80 });
        tween(opacity).delay(2.6).to(0.6, { opacity: 0 }).call(() => node.destroy()).start();
    }

    // ---------------------------------------------------------------- screens

    private screen(name: string, dim = true): Node {
        this.uiLayer.destroyAllChildren();
        return makeOverlay(this.uiLayer, name, this.width, this.height, dim ? withAlpha(PALETTE.backgroundDeep, 225) : null);
    }

    private showMenu(): void {
        this.endSession();
        const root = this.screen('Menu');
        const h = this.height;
        const art = makeNode('Art', root).addComponent(Graphics);
        const skin = this.save.skin;
        drawLantern(art, 0, h / 2 - 330, 2.6, hex(skin.body), hex(skin.glow));

        makeLabel(root, 'KHÔI', 0, h / 2 - 520, { size: 120, bold: true, color: PALETTE.text });
        makeLabel(root, 'LƯỚT HANG ĐÈN LỒNG', 0, h / 2 - 610, { size: 34, bold: true, color: PALETTE.wallEdge });

        const y0 = -100;
        makeButton(root, 'CHƠI THEO MÀN', 0, y0, 440, 100, () => this.showLevelSelect(), { color: PALETTE.buttonAccent });
        makeButton(root, 'VÔ TẬN', 0, y0 - 130, 440, 100, () => this.startEndless(), { color: PALETTE.buttonGood });
        makeButton(root, 'ĐÈN LỒNG', 0, y0 - 260, 440, 100, () => this.showShop());
        this.soundToggle(root, this.panelWidth / 2 - 95, h / 2 - 60);
        this.sound.playMusic('music-menu');

        makeLabel(root, `● ${this.save.coins} xu     Kỷ lục vô tận: ${this.save.bestScore}`, 0, -h / 2 + 130,
            { size: 28, color: PALETTE.coin });
        makeLabel(root, 'Vuốt màn hình hoặc dùng phím mũi tên / WASD', 0, -h / 2 + 70,
            { size: 24, color: PALETTE.textDim });
    }

    private showLevelSelect(): void {
        const root = this.screen('LevelSelect');
        const h = this.height;
        makeLabel(root, 'CHỌN MÀN', 0, h / 2 - 140, { size: 60, bold: true });
        const total = LEVELS.reduce((n, _, i) => n + this.save.starsFor(i), 0);
        makeLabel(root, `${total} / ${LEVELS.length * 3} ★`, 0, h / 2 - 210, { size: 30, color: PALETTE.star });

        const cols = 2;
        const bw = 310;
        const bh = 150;
        const gap = 24;
        const startY = h / 2 - 340;
        LEVELS.forEach((def, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = (col - (cols - 1) / 2) * (bw + gap);
            const y = startY - row * (bh + gap);
            const locked = i > this.save.unlocked;
            const text = locked ? `${i + 1}\nĐÃ KHÓA` : `${i + 1}. ${def.name}\n${starText(this.save.starsFor(i))}`;
            makeButton(root, text, x, y, bw, bh, () => this.startLevel(i), {
                disabled: locked, textSize: 28, color: def.darkness ? hex('#3b2a66') : PALETTE.button,
            });
        });
        makeButton(root, 'QUAY LẠI', 0, -h / 2 + 110, 300, 90, () => this.showMenu());
    }

    private showShop(): void {
        const root = this.screen('Shop');
        const h = this.height;
        makeLabel(root, 'ĐÈN LỒNG', 0, h / 2 - 140, { size: 60, bold: true });
        makeLabel(root, `● ${this.save.coins} xu`, 0, h / 2 - 210, { size: 32, color: PALETTE.coin });

        const rowH = 150;
        const half = this.panelWidth / 2;
        SKINS.forEach((skin, i) => {
            const y = h / 2 - 340 - i * rowH;
            const icon = makeNode('Icon', root).addComponent(Graphics);
            drawLantern(icon, -half + 110, y, 1.1, hex(skin.body), hex(skin.glow));
            makeLabel(root, skin.name, -half + 290, y, { size: 34, bold: true });
            const owned = this.save.owns(skin.id);
            const equipped = this.save.skinId === skin.id;
            const label = equipped ? 'ĐANG DÙNG' : owned ? 'DÙNG' : `${skin.price} xu`;
            const affordable = owned || this.save.coins >= skin.price;
            makeButton(root, label, half - 140, y, 220, 84, () => {
                if (this.save.selectSkin(skin.id)) this.showShop();
            }, {
                disabled: equipped || !affordable,
                color: owned ? PALETTE.buttonGood : PALETTE.buttonAccent,
                textSize: 28,
            });
        });
        makeLabel(root, 'Nhặt xu trong hang để mua đèn mới.', 0, -h / 2 + 200, { size: 26, color: PALETTE.textDim });
        makeButton(root, 'QUAY LẠI', 0, -h / 2 + 110, 300, 90, () => this.showMenu());
    }

    private showPause(): void {
        const root = makeOverlay(this.uiLayer, 'Pause', this.width, this.height, withAlpha(PALETTE.backgroundDeep, 200));
        makeLabel(root, 'TẠM DỪNG', 0, 260, { size: 64, bold: true });
        makeButton(root, 'TIẾP TỤC', 0, 80, 400, 100, () => this.setPaused(false), { color: PALETTE.buttonGood });
        makeButton(root, 'CHƠI LẠI', 0, -50, 400, 100, () => this.restart());
        makeButton(root, 'MENU', 0, -180, 400, 100, () => this.showMenu());
        this.soundToggle(root, 0, -310);
    }

    private restart(): void {
        if (this.session?.mode === 'endless') this.startEndless();
        else this.startLevel(this.levelIndex);
    }

    private resultPanel(title: string, titleColor = PALETTE.text): Node {
        const root = makeOverlay(this.uiLayer, 'Result', this.width, this.height, withAlpha(PALETTE.backgroundDeep, 210));
        const panel = makeNode('Panel', root).addComponent(Graphics);
        const pw = this.panelWidth - 80;
        panel.fillColor = PALETTE.panel;
        panel.roundRect(-pw / 2, -420, pw, 840, 30);
        panel.fill();
        panel.lineWidth = 4;
        panel.strokeColor = withAlpha(PALETTE.wallEdge, 160);
        panel.roundRect(-pw / 2, -420, pw, 840, 30);
        panel.stroke();
        makeLabel(root, title, 0, 320, { size: 58, bold: true, color: titleColor });
        return root;
    }

    private showLevelWin(s: GameSession): void {
        const root = this.resultPanel('QUA MÀN!', PALETTE.exit);
        const last = this.levelIndex >= LEVELS.length - 1;
        makeLabel(root, starText(s.stars), 0, 200, { size: 96, color: PALETTE.star });
        makeLabel(root, `Điểm: ${s.score}`, 0, 80, { size: 36, bold: true });
        makeLabel(root, `Đom đóm: ${s.fireflies}     Xu: +${s.coins}`, 0, 25, { size: 28, color: PALETTE.textDim });
        if (last) {
            makeLabel(root, 'Bạn đã chinh phục Đỉnh Hang!', 0, -40, { size: 30, color: PALETTE.wallEdge });
            makeButton(root, 'CHƠI LẠI', 0, -150, 400, 100, () => this.startLevel(this.levelIndex));
        } else {
            makeButton(root, 'MÀN TIẾP', 0, -110, 400, 100, () => this.startLevel(this.levelIndex + 1),
                { color: PALETTE.buttonGood });
            makeButton(root, 'CHƠI LẠI', 0, -235, 400, 100, () => this.startLevel(this.levelIndex));
        }
        makeButton(root, 'MENU', 0, -340, 400, 90, () => this.showMenu());
    }

    private showLevelLose(s: GameSession): void {
        const root = this.resultPanel('THẤT BẠI', PALETTE.spike);
        makeLabel(root, DEATH_TEXT[this.deathCause], 0, 190, { size: 34, width: this.panelWidth - 160 });
        makeLabel(root, `Sao: ${starText(s.stars)}     Xu: +${s.coins}`, 0, 90, { size: 30, color: PALETTE.textDim });
        makeButton(root, 'THỬ LẠI', 0, -60, 400, 100, () => this.startLevel(this.levelIndex), { color: PALETTE.buttonAccent });
        makeButton(root, 'CHỌN MÀN', 0, -185, 400, 100, () => { this.endSession(); this.showLevelSelect(); });
        makeButton(root, 'MENU', 0, -310, 400, 90, () => this.showMenu());
    }

    private showEndlessResult(s: GameSession, isBest: boolean): void {
        const root = this.resultPanel('KẾT THÚC', PALETTE.darknessEdge);
        makeLabel(root, DEATH_TEXT[this.deathCause], 0, 230, { size: 30, width: this.panelWidth - 160 });
        makeLabel(root, `${s.score}`, 0, 130, { size: 96, bold: true, color: PALETTE.firefly });
        makeLabel(root, `Độ cao: ${s.height} m     Xu: +${s.coins}`, 0, 40, { size: 30, color: PALETTE.textDim });
        makeLabel(root, isBest ? 'KỶ LỤC MỚI!' : `Kỷ lục: ${this.save.bestScore}`, 0, -20,
            { size: 32, bold: true, color: isBest ? PALETTE.star : PALETTE.textDim });
        makeButton(root, 'CHƠI LẠI', 0, -140, 400, 100, () => this.startEndless(), { color: PALETTE.buttonGood });
        makeButton(root, 'MENU', 0, -265, 400, 100, () => this.showMenu());
    }
}

// Safety net: if the opened scene has no GameRoot (for example a fresh empty scene),
// attach one to its Canvas so the game still starts.
director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    if (EDITOR) return;
    const scene = director.getScene();
    if (!scene || scene.getComponentInChildren(GameRoot)) return;
    const canvas = scene.getComponentInChildren(Canvas);
    if (canvas) makeNode('GameRoot', canvas.node).addComponent(GameRoot);
});
