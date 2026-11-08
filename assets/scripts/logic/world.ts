import { Grid } from './grid';
import { DIR_VEC, Dir, Item, Point, dartTileDir } from './types';

/** A bat flies back and forth along one axis, turning around at solid cells. */
export class Bat {
    /** Cell the bat is leaving. */
    cx: number;
    cy: number;
    dx: number;
    dy: number;
    /** Progress from (cx, cy) toward the next cell, 0..1. */
    t = 0;
    readonly speed: number;

    constructor(x: number, y: number, horizontal: boolean, speed = 2.6) {
        this.cx = x;
        this.cy = y;
        this.dx = horizontal ? 1 : 0;
        this.dy = horizontal ? 0 : 1;
        this.speed = speed;
    }

    get x(): number { return this.cx + this.dx * this.t; }
    get y(): number { return this.cy + this.dy * this.t; }

    update(dt: number, grid: Grid): void {
        if (this.t === 0 && !this.chooseDirection(grid)) return; // boxed in: hover in place
        this.t += this.speed * dt;
        while (this.t >= 1) {
            this.t -= 1;
            this.cx += this.dx;
            this.cy += this.dy;
            if (!this.chooseDirection(grid)) {
                this.t = 0;
                return;
            }
        }
    }

    /** Keep the current heading if the next cell is open, otherwise turn around. */
    private chooseDirection(grid: Grid): boolean {
        if (!grid.isSolid(this.cx + this.dx, this.cy + this.dy)) return true;
        this.dx = -this.dx;
        this.dy = -this.dy;
        return !grid.isSolid(this.cx + this.dx, this.cy + this.dy);
    }
}

export class Dart {
    x: number;
    y: number;
    readonly dir: Dir;
    readonly speed = 7;
    alive = true;

    constructor(x: number, y: number, dir: Dir) {
        this.x = x;
        this.y = y;
        this.dir = dir;
    }

    update(dt: number, grid: Grid): void {
        const v = DIR_VEC[this.dir];
        this.x += v.x * this.speed * dt;
        this.y += v.y * this.speed * dt;
        // The dart dies once its tip enters a solid cell.
        const tipX = Math.round(this.x + v.x * 0.45);
        const tipY = Math.round(this.y + v.y * 0.45);
        if (grid.isSolid(tipX, tipY)) this.alive = false;
    }
}

/** A solid block that fires a dart into the open cell in front of it on a fixed rhythm. */
export class DartTrap {
    readonly x: number;
    readonly y: number;
    readonly dir: Dir;
    readonly period: number;
    timer: number;

    constructor(x: number, y: number, dir: Dir, period = 2.2, phase = 0) {
        this.x = x;
        this.y = y;
        this.dir = dir;
        this.period = period;
        this.timer = phase;
    }

    /** Returns a new dart when the trap fires this frame. */
    update(dt: number, grid: Grid): Dart | null {
        this.timer += dt;
        if (this.timer < this.period) return null;
        this.timer -= this.period;
        const v = DIR_VEC[this.dir];
        if (grid.isSolid(this.x + v.x, this.y + v.y)) return null;
        return new Dart(this.x + v.x * 0.6, this.y + v.y * 0.6, this.dir);
    }

    /** 0..1, how close the trap is to firing (used for the warning glow). */
    get charge(): number {
        return this.timer / this.period;
    }
}

export class World {
    readonly grid: Grid;
    readonly items = new Map<number, Item>();
    readonly bats: Bat[] = [];
    readonly traps: DartTrap[] = [];
    darts: Dart[] = [];
    start: Point = { x: 1, y: 1 };
    exit: Point | null = null;

    constructor(grid: Grid) {
        this.grid = grid;
    }

    key(x: number, y: number): number {
        return y * this.grid.width + x;
    }

    itemAt(x: number, y: number): Item | undefined {
        return this.items.get(this.key(x, y));
    }

    setItem(x: number, y: number, item: Item): void {
        this.items.set(this.key(x, y), item);
    }

    takeItem(x: number, y: number): Item | undefined {
        const k = this.key(x, y);
        const item = this.items.get(k);
        if (item !== undefined) this.items.delete(k);
        return item;
    }

    /** Register a dart trap for a dart tile that is already in the grid. */
    addTrapAt(x: number, y: number, period?: number, phase?: number): void {
        const dir = dartTileDir(this.grid.get(x, y));
        if (dir === null) throw new Error(`No dart tile at (${x}, ${y})`);
        this.traps.push(new DartTrap(x, y, dir, period, phase));
    }

    countItems(kind: Item): number {
        let n = 0;
        this.items.forEach((v) => { if (v === kind) n++; });
        return n;
    }
}
