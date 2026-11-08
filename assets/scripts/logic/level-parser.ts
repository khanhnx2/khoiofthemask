import { Grid } from './grid';
import { Item, Tile } from './types';
import { Bat, World } from './world';

export interface LevelDef {
    name: string;
    /** Map rows written top to bottom. See the legend in parseLevel. */
    rows: string[];
    /** Rows per second the darkness rises. 0 or missing = no darkness. */
    darkness?: number;
    /** Optional one-line tip shown when the level starts. */
    hint?: string;
}

const ITEM_CHARS: Record<string, Item> = {
    '.': Item.Firefly,
    c: Item.Coin,
    '*': Item.Star,
    S: Item.Shield,
    M: Item.Magnet,
    F: Item.Freeze,
};

const DART_CHARS: Record<string, Tile> = {
    U: Tile.DartUp,
    D: Tile.DartDown,
    L: Tile.DartLeft,
    R: Tile.DartRight,
};

/**
 * Legend:
 *  #  wall            (space) empty      P  start       E  exit
 *  .  firefly         c  coin            *  star        ^  spike
 *  S  shield          M  magnet          F  freeze
 *  h  bat (horizontal)   v  bat (vertical)
 *  U D L R  dart trap shooting up / down / left / right
 */
export function parseLevel(def: LevelDef): World {
    const height = def.rows.length;
    const width = Math.max(...def.rows.map((r) => r.length));
    const grid = new Grid(width, height, Tile.Wall);
    const world = new World(grid);
    let foundStart = false;
    const traps: Array<[number, number]> = [];

    def.rows.forEach((row, r) => {
        const y = height - 1 - r;
        for (let x = 0; x < width; x++) {
            const ch = x < row.length ? row[x] : '#';
            if (ch === '#') continue;
            grid.set(x, y, Tile.Empty);
            if (ch === ' ') continue;
            const item = ITEM_CHARS[ch];
            if (item !== undefined) {
                world.setItem(x, y, item);
                continue;
            }
            const dart = DART_CHARS[ch];
            if (dart !== undefined) {
                grid.set(x, y, dart);
                traps.push([x, y]);
                continue;
            }
            switch (ch) {
                case 'P':
                    world.start = { x, y };
                    foundStart = true;
                    break;
                case 'E':
                    grid.set(x, y, Tile.Exit);
                    world.exit = { x, y };
                    break;
                case '^':
                    grid.set(x, y, Tile.Spike);
                    break;
                case 'h':
                    world.bats.push(new Bat(x, y, true));
                    break;
                case 'v':
                    world.bats.push(new Bat(x, y, false));
                    break;
                default:
                    throw new Error(`Level "${def.name}": unknown char '${ch}' at row ${r}, col ${x}`);
            }
        }
    });

    if (!foundStart) throw new Error(`Level "${def.name}" has no start (P)`);
    // Stagger traps so they do not all fire on the same frame.
    traps.forEach(([x, y], i) => world.addTrapAt(x, y, 2.2, (i * 0.7) % 2.2));
    return world;
}
