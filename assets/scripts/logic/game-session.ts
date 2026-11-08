import { EndlessGenerator } from './endless-generator';
import { computeSlide } from './grid';
import { DIR_VEC, Dir, Item, POWER_UP_DURATION, Point, Tile } from './types';
import { World } from './world';

export type GameMode = 'level' | 'endless';
export type GameState = 'ready' | 'playing' | 'won' | 'dead';
export type DeathCause = 'spike' | 'bat' | 'dart' | 'darkness';

export type SessionEvent =
    | { type: 'collect'; item: Item; x: number; y: number }
    | { type: 'slideStart'; dir: Dir }
    | { type: 'slideEnd'; dir: Dir; x: number; y: number }
    | { type: 'shieldBreak'; x: number; y: number }
    | { type: 'death'; cause: DeathCause; x: number; y: number }
    | { type: 'win' };

/** Tiles per second while sliding. */
export const SLIDE_SPEED = 24;
const HIT_RADIUS = 0.62;
const MAGNET_RADIUS = 2.6;
const INVULN_TIME = 1.5;

export interface SessionOptions {
    mode: GameMode;
    /** Darkness rise speed in rows per second; 0 disables it. */
    darknessSpeed: number;
    generator?: EndlessGenerator;
}

export class Player {
    x: number;
    y: number;
    sliding = false;
    dir: Dir = Dir.Up;
    private fromX = 0;
    private fromY = 0;
    path: Point[] = [];
    /** Distance travelled along the current path in tiles. */
    progress = 0;
    /** Path cells already processed (items, spikes, exit). */
    entered = 0;

    constructor(p: Point) {
        this.x = p.x;
        this.y = p.y;
    }

    get cellX(): number { return Math.round(this.x); }
    get cellY(): number { return Math.round(this.y); }

    begin(dir: Dir, path: Point[]): void {
        this.dir = dir;
        this.fromX = this.cellX;
        this.fromY = this.cellY;
        this.path = path;
        this.progress = 0;
        this.entered = 0;
        this.sliding = true;
    }

    syncPosition(): void {
        const v = DIR_VEC[this.dir];
        this.x = this.fromX + v.x * this.progress;
        this.y = this.fromY + v.y * this.progress;
    }
}

/**
 * One run of the game (a level attempt or an endless run).
 * Pure simulation: the Cocos view reads its state each frame and drains `events`.
 */
export class GameSession {
    readonly world: World;
    readonly mode: GameMode;
    readonly player: Player;
    readonly generator: EndlessGenerator | null;
    state: GameState = 'ready';
    events: SessionEvent[] = [];

    fireflies = 0;
    coins = 0;
    stars = 0;
    readonly startY: number;
    maxY: number;
    time = 0;

    shield = false;
    invulnTime = 0;
    magnetTime = 0;
    freezeTime = 0;

    readonly darknessEnabled: boolean;
    private readonly baseDarknessSpeed: number;
    darknessY: number;

    private pendingDir: Dir | null = null;

    constructor(world: World, opts: SessionOptions) {
        this.world = world;
        this.mode = opts.mode;
        this.generator = opts.generator ?? null;
        this.player = new Player(world.start);
        this.startY = world.start.y;
        this.maxY = world.start.y;
        this.darknessEnabled = opts.darknessSpeed > 0;
        this.baseDarknessSpeed = opts.darknessSpeed;
        this.darknessY = world.start.y - 5;
        if (this.generator) this.generator.generateUntil(this.player.cellY + 40);
    }

    get score(): number {
        if (this.mode === 'endless') return this.fireflies + (this.maxY - this.startY) * 2;
        return this.fireflies + this.stars * 50;
    }

    get height(): number {
        return this.maxY - this.startY;
    }

    get isOver(): boolean {
        return this.state === 'won' || this.state === 'dead';
    }

    /** Queue a move. A swipe made while sliding is buffered and runs when the slide ends. */
    move(dir: Dir): void {
        if (this.isOver) return;
        if (this.player.sliding) {
            this.pendingDir = dir;
            return;
        }
        this.startSlide(dir);
    }

    update(dt: number): void {
        if (this.isOver) return;
        this.time += dt;
        this.invulnTime = Math.max(0, this.invulnTime - dt);
        this.magnetTime = Math.max(0, this.magnetTime - dt);
        this.freezeTime = Math.max(0, this.freezeTime - dt);

        if (this.generator) this.generator.generateUntil(this.player.cellY + 40);

        this.updatePlayer(dt);
        if (this.isOver) return;

        if (this.freezeTime <= 0) {
            this.updateHazards(dt);
            if (this.isOver) return;
            if (this.state === 'playing') this.updateDarkness(dt);
            if (this.isOver) return;
        }

        if (this.magnetTime > 0) this.pullItems();
        this.checkStandingOnSpike();
        this.maxY = Math.max(this.maxY, this.player.cellY);
    }

    private startSlide(dir: Dir): void {
        const p = this.player;
        const slide = computeSlide(this.world.grid, p.cellX, p.cellY, dir);
        if (slide.cells.length === 0) return;
        if (this.state === 'ready') this.state = 'playing';
        p.begin(dir, slide.cells);
        this.events.push({ type: 'slideStart', dir });
    }

    private updatePlayer(dt: number): void {
        const p = this.player;
        if (!p.sliding) return;
        p.progress = Math.min(p.path.length, p.progress + SLIDE_SPEED * dt);
        // A cell counts as entered once the player is more than halfway into it.
        while (p.entered < p.path.length && p.progress >= p.entered + 0.5) {
            const c = p.path[p.entered++];
            this.enterCell(c.x, c.y);
            if (this.isOver) {
                p.progress = p.entered;
                p.syncPosition();
                return;
            }
        }
        p.syncPosition();
        if (p.progress >= p.path.length) {
            p.sliding = false;
            this.events.push({ type: 'slideEnd', dir: p.dir, x: p.cellX, y: p.cellY });
            const next = this.pendingDir;
            this.pendingDir = null;
            if (next !== null) this.startSlide(next);
        }
    }

    private enterCell(x: number, y: number): void {
        this.collectAt(x, y);
        const t = this.world.grid.get(x, y);
        if (t === Tile.Spike) this.hit('spike');
        else if (t === Tile.Exit && this.mode === 'level') {
            this.state = 'won';
            this.events.push({ type: 'win' });
        }
    }

    private collectAt(x: number, y: number): void {
        const item = this.world.takeItem(x, y);
        if (item === undefined) return;
        switch (item) {
            case Item.Firefly: this.fireflies++; break;
            case Item.Coin: this.coins++; break;
            case Item.Star: this.stars++; break;
            case Item.Shield: this.shield = true; break;
            case Item.Magnet: this.magnetTime = POWER_UP_DURATION.magnet; break;
            case Item.Freeze: this.freezeTime = POWER_UP_DURATION.freeze; break;
        }
        this.events.push({ type: 'collect', item, x, y });
    }

    private pullItems(): void {
        const p = this.player;
        const r = Math.ceil(MAGNET_RADIUS);
        for (let y = p.cellY - r; y <= p.cellY + r; y++) {
            for (let x = p.cellX - r; x <= p.cellX + r; x++) {
                const item = this.world.itemAt(x, y);
                if (item !== Item.Firefly && item !== Item.Coin) continue;
                if (Math.hypot(x - p.x, y - p.y) <= MAGNET_RADIUS) this.collectAt(x, y);
            }
        }
    }

    private updateHazards(dt: number): void {
        const w = this.world;
        const p = this.player;
        // Only simulate hazards near the player; endless maps can be very tall.
        const near = (y: number) => Math.abs(y - p.y) < 30;
        for (const bat of w.bats) {
            if (!near(bat.y)) continue;
            bat.update(dt, w.grid);
            if (this.touches(bat.x, bat.y)) { this.hit('bat'); if (this.isOver) return; }
        }
        for (const trap of w.traps) {
            if (!near(trap.y)) continue;
            const dart = trap.update(dt, w.grid);
            if (dart) w.darts.push(dart);
        }
        for (const dart of w.darts) {
            dart.update(dt, w.grid);
            if (dart.alive && this.touches(dart.x, dart.y)) {
                dart.alive = false;
                this.hit('dart');
                if (this.isOver) return;
            }
        }
        w.darts = w.darts.filter((d) => d.alive && near(d.y));
    }

    private updateDarkness(dt: number): void {
        if (!this.darknessEnabled) return;
        const p = this.player;
        let speed = this.baseDarknessSpeed;
        if (this.mode === 'endless') speed = Math.min(2.4, speed + this.height * 0.004);
        this.darknessY += speed * dt;
        // Never let the player escape too far: the darkness catches up.
        const maxGap = this.mode === 'endless' ? 13 : 16;
        if (p.y - this.darknessY > maxGap) this.darknessY = p.y - maxGap;
        if (this.darknessY >= p.y - 0.35) this.hit('darkness');
    }

    private checkStandingOnSpike(): void {
        const p = this.player;
        if (p.sliding || this.invulnTime > 0) return;
        if (this.world.grid.get(p.cellX, p.cellY) === Tile.Spike) this.hit('spike');
    }

    private touches(x: number, y: number): boolean {
        const p = this.player;
        return Math.abs(x - p.x) < HIT_RADIUS && Math.abs(y - p.y) < HIT_RADIUS;
    }

    private hit(cause: DeathCause): void {
        if (this.invulnTime > 0 && cause !== 'darkness') return;
        const p = this.player;
        if (this.shield) {
            this.shield = false;
            this.invulnTime = INVULN_TIME;
            if (cause === 'darkness') this.darknessY = p.y - 5;
            this.events.push({ type: 'shieldBreak', x: p.x, y: p.y });
            return;
        }
        if (cause === 'darkness' && this.invulnTime > 0) return;
        this.state = 'dead';
        this.events.push({ type: 'death', cause, x: p.x, y: p.y });
    }
}
