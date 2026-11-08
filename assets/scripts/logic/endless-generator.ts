import { Grid } from './grid';
import { Rng } from './rng';
import { DIR_VEC, Dir, Item, Point, Tile, dartTileFor, isSolidTile } from './types';
import { Bat, World } from './world';

export const ENDLESS_WIDTH = 11;
const MIN_X = 1;
const MAX_X = ENDLESS_WIDTH - 2;
/** Rows with no hazards at the start of a run. */
const SAFE_ROWS = 16;

interface Segment {
    dir: Dir;
    cells: Point[];
}

/**
 * Builds an endless vertical cave by carving a chain of slide moves.
 * Every move ends against a "locked" wall that is never carved later,
 * so the carved chain always stays a working route to the top.
 * Extra pockets, items and hazards are added around that route.
 */
export class EndlessGenerator {
    readonly world: World;
    private readonly rng: Rng;
    private readonly locked = new Set<number>();
    private readonly route = new Set<number>();
    /** Cells where the guaranteed route stops (start plus the end of every move). */
    readonly routeStops = new Set<number>();
    private cx: number;
    private cy: number;
    private lastDir: Dir | null = null;

    constructor(seed: number) {
        this.rng = new Rng(seed);
        this.world = new World(new Grid(ENDLESS_WIDTH, 0, Tile.Wall));
        this.cx = Math.floor(ENDLESS_WIDTH / 2);
        this.cy = 1;
        this.ensureRows(this.cy + 16);
        this.world.grid.set(this.cx, this.cy, Tile.Empty);
        this.route.add(this.key(this.cx, this.cy));
        this.routeStops.add(this.key(this.cx, this.cy));
        this.world.start = { x: this.cx, y: this.cy };
    }

    /** Highest row that is part of the carved route so far. */
    get routeTop(): number {
        return this.cy;
    }

    /** Carve until the route reaches at least row y. */
    generateUntil(y: number): void {
        let guard = 0;
        while (this.cy < y) {
            this.step();
            if (++guard > 100000) throw new Error('EndlessGenerator stuck');
        }
    }

    private key(x: number, y: number): number {
        return this.world.key(x, y);
    }

    private ensureRows(y: number): void {
        const grid = this.world.grid;
        if (grid.height <= y) grid.addRows(y - grid.height + 1, Tile.Wall);
    }

    /**
     * The route alternates Up and sideways moves. Nothing is ever carved above the
     * current row except the last Up stopper, so the next move always has room.
     */
    private step(): void {
        this.ensureRows(this.cy + 12);
        const seg = this.lastDir === Dir.Up
            ? this.tryHorizontal() ?? this.tryVertical(Dir.Up, 1, 5)
            : this.tryVertical(Dir.Up, 2, 5) ?? this.tryVertical(Dir.Up, 1, 1) ?? this.tryHorizontal();
        if (!seg) throw new Error(`EndlessGenerator has no legal move at (${this.cx}, ${this.cy})`);
        this.decorate(seg);
    }

    private tryVertical(dir: Dir, minLen: number, maxLen: number): Segment | null {
        const lengths: number[] = [];
        for (let l = minLen; l <= maxLen; l++) lengths.push(l);
        this.rng.shuffle(lengths);
        for (const len of lengths) {
            const seg = this.tryCarve(dir, len);
            if (seg) return seg;
        }
        return null;
    }

    private tryHorizontal(): Segment | null {
        const targets: number[] = [];
        for (let x = MIN_X; x <= MAX_X; x++) if (x !== this.cx) targets.push(x);
        this.rng.shuffle(targets);
        for (const tx of targets) {
            const dir = tx < this.cx ? Dir.Left : Dir.Right;
            const seg = this.tryCarve(dir, Math.abs(tx - this.cx));
            if (seg) return seg;
        }
        return null;
    }

    /** Carve a slide of exactly `len` cells from the current stop, if it stays legal. */
    private tryCarve(dir: Dir, len: number): Segment | null {
        const grid = this.world.grid;
        const v = DIR_VEC[dir];
        const cells: Point[] = [];
        for (let i = 1; i <= len; i++) {
            const x = this.cx + v.x * i;
            const y = this.cy + v.y * i;
            if (x < MIN_X || x > MAX_X || y < 1) return null;
            if (this.locked.has(this.key(x, y))) return null;
            const t = grid.get(x, y);
            if (t === Tile.Spike || isSolidTile(t) && t !== Tile.Wall) return null;
            cells.push({ x, y });
        }
        const sx = this.cx + v.x * (len + 1);
        const sy = this.cy + v.y * (len + 1);
        // The stopper must be solid now; it is then locked so it stays solid forever.
        if (!grid.isSolid(sx, sy)) return null;

        for (const c of cells) {
            grid.set(c.x, c.y, Tile.Empty);
            this.route.add(this.key(c.x, c.y));
        }
        if (grid.inBounds(sx, sy)) this.locked.add(this.key(sx, sy));
        const end = cells[cells.length - 1];
        this.cx = end.x;
        this.cy = end.y;
        this.routeStops.add(this.key(end.x, end.y));
        this.lastDir = dir;
        return { dir, cells };
    }

    /**
     * A bat must cross the route, never fly along it: the player has to slide through
     * the whole segment, so a bat patrolling it could not be dodged. The bat gets its
     * own two-cell flight pocket on one side of a middle cell, and the cells past both
     * ends of its flight line are locked so later carving cannot extend it into a stop.
     */
    private tryPlaceBat(seg: Segment, speed: number): void {
        const grid = this.world.grid;
        const horizontal = seg.dir === Dir.Left || seg.dir === Dir.Right;
        // Horizontal route: pocket goes below (rows above must stay free for the next moves).
        // Vertical route: pocket goes sideways, never at the top stop cell.
        const candidates = horizontal ? seg.cells.slice(1, -1) : seg.cells.slice(0, -1);
        if (candidates.length === 0) return;
        const c = this.rng.pick(candidates);
        const side = horizontal ? -1 : (this.rng.chance(0.5) ? 1 : -1);
        const step = horizontal ? { x: 0, y: side } : { x: side, y: 0 };
        const at = (k: number) => ({ x: c.x + step.x * k, y: c.y + step.y * k });

        const pocket = [at(1), at(2)];
        const free = (p: Point) => p.x >= MIN_X && p.x <= MAX_X && p.y >= 1
            && grid.get(p.x, p.y) === Tile.Wall && !this.locked.has(this.key(p.x, p.y)) && !this.route.has(this.key(p.x, p.y));
        if (!pocket.every(free)) return;
        const ends = [at(-1), at(3)];
        if (!ends.every((p) => grid.isSolid(p.x, p.y))) return;

        for (const p of pocket) grid.set(p.x, p.y, Tile.Empty);
        for (const p of ends) if (grid.inBounds(p.x, p.y)) this.locked.add(this.key(p.x, p.y));
        const start = pocket[1];
        this.world.bats.push(new Bat(start.x, start.y, !horizontal, speed));
    }

    private decorate(seg: Segment): void {
        const world = this.world;
        const rng = this.rng;
        const h = this.cy;

        for (const c of seg.cells) {
            if (world.itemAt(c.x, c.y) !== undefined) continue;
            let item = Item.Firefly;
            if (h > 24 && rng.chance(0.012)) item = rng.pick([Item.Shield, Item.Magnet, Item.Freeze]);
            else if (rng.chance(0.07)) item = Item.Coin;
            world.setItem(c.x, c.y, item);
        }
        if (h < SAFE_ROWS) return;

        // Side pocket: a dead-end cell next to the route, holding a spike or a coin.
        // Pockets go below sideways moves and beside (not at the top of) vertical ones,
        // so they never sit in the way of the next moves.
        const horizontal = seg.dir === Dir.Left || seg.dir === Dir.Right;
        const pocketCells = horizontal ? seg.cells : seg.cells.slice(0, -1);
        if (pocketCells.length > 0 && rng.chance(0.35)) {
            const c = rng.pick(pocketCells);
            const side = rng.chance(0.5) ? 1 : -1;
            const px = horizontal ? c.x : c.x + side;
            const py = horizontal ? c.y - 1 : c.y;
            const k = this.key(px, py);
            if (px >= MIN_X && px <= MAX_X && py >= 1 && world.grid.get(px, py) === Tile.Wall
                && !this.locked.has(k) && !this.route.has(k)) {
                if (rng.chance(0.55)) {
                    world.grid.set(px, py, Tile.Spike);
                } else {
                    world.grid.set(px, py, Tile.Empty);
                    world.setItem(px, py, Item.Coin);
                }
            }
        }

        const difficulty = Math.min(1, (h - SAFE_ROWS) / 300);
        const len = seg.cells.length;
        if (rng.chance(0.08 + 0.27 * difficulty)) this.tryPlaceBat(seg, 2.2 + difficulty * 1.2);

        if (!horizontal && len >= 3 && h > SAFE_ROWS + 20 && rng.chance(0.06 + 0.24 * difficulty)) {
            const c = seg.cells[rng.int(1, len - 2)];
            const side = rng.chance(0.5) ? 1 : -1;
            const tx = c.x + side;
            // Darts fly across the shaft, so the trap goes in the wall beside it.
            if (world.grid.get(tx, c.y) === Tile.Wall && !this.route.has(this.key(tx, c.y))) {
                world.grid.set(tx, c.y, dartTileFor(side > 0 ? Dir.Left : Dir.Right));
                this.locked.add(this.key(tx, c.y));
                world.addTrapAt(tx, c.y, rng.int(20, 28) / 10, rng.next() * 2);
            }
        }
    }
}
