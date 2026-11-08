import { DIR_VEC, Dir, Point, Tile, isSolidTile } from './types';

/**
 * Tile grid with a fixed width and a height that can grow upward (endless mode).
 * Row 0 is the bottom. Anything outside the grid counts as wall.
 */
export class Grid {
    readonly width: number;
    private rows: Uint8Array[] = [];

    constructor(width: number, height = 0, fill: Tile = Tile.Wall) {
        this.width = width;
        this.addRows(height, fill);
    }

    get height(): number {
        return this.rows.length;
    }

    addRows(count: number, fill: Tile = Tile.Wall): void {
        for (let i = 0; i < count; i++) {
            this.rows.push(new Uint8Array(this.width).fill(fill));
        }
    }

    inBounds(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.rows.length;
    }

    get(x: number, y: number): Tile {
        if (!this.inBounds(x, y)) return Tile.Wall;
        return this.rows[y][x] as Tile;
    }

    set(x: number, y: number, t: Tile): void {
        if (!this.inBounds(x, y)) throw new Error(`Grid.set out of bounds (${x}, ${y})`);
        this.rows[y][x] = t;
    }

    isSolid(x: number, y: number): boolean {
        return isSolidTile(this.get(x, y));
    }
}

export interface SlideResult {
    /** Where the slide stops. */
    x: number;
    y: number;
    /** Cells entered during the slide, in order (start excluded, end included). */
    cells: Point[];
}

/** The core movement rule: keep going in one direction until the next cell is solid. */
export function computeSlide(grid: Grid, x: number, y: number, dir: Dir): SlideResult {
    const v = DIR_VEC[dir];
    const cells: Point[] = [];
    let cx = x;
    let cy = y;
    while (!grid.isSolid(cx + v.x, cy + v.y)) {
        cx += v.x;
        cy += v.y;
        cells.push({ x: cx, y: cy });
    }
    return { x: cx, y: cy, cells };
}
