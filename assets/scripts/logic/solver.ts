import { computeSlide } from './grid';
import { ALL_DIRS, Point, Tile } from './types';
import { World } from './world';

export interface Reachability {
    /** Cells where the player can come to rest. */
    stops: Set<number>;
    /** Every cell the player can pass through safely (stops included). */
    passed: Set<number>;
    /** True when some safe slide enters the exit. */
    exitReached: boolean;
}

/**
 * Breadth-first search over slide moves, ignoring moving enemies.
 * Slides that cross a spike are treated as fatal and skipped.
 * Used by tests to prove levels and endless chunks are completable.
 */
export function analyzeReachability(world: World, from: Point = world.start): Reachability {
    const grid = world.grid;
    const key = (x: number, y: number) => world.key(x, y);
    const stops = new Set<number>([key(from.x, from.y)]);
    const passed = new Set<number>([key(from.x, from.y)]);
    const queue: Point[] = [from];
    let exitReached = false;

    while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const dir of ALL_DIRS) {
            const slide = computeSlide(grid, cur.x, cur.y, dir);
            if (slide.cells.length === 0) continue;
            let safe = true;
            let hitExit = false;
            for (const c of slide.cells) {
                const t = grid.get(c.x, c.y);
                if (t === Tile.Spike) { safe = false; break; }
                if (t === Tile.Exit) { hitExit = true; break; }
            }
            if (!safe) continue;
            for (const c of slide.cells) {
                passed.add(key(c.x, c.y));
                if (grid.get(c.x, c.y) === Tile.Exit) break;
            }
            if (hitExit) { exitReached = true; continue; }
            const k = key(slide.x, slide.y);
            if (!stops.has(k)) {
                stops.add(k);
                queue.push({ x: slide.x, y: slide.y });
            }
        }
    }
    return { stops, passed, exitReached };
}
