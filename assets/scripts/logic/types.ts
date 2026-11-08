// Core types shared by the game logic. This folder never imports 'cc' so it can be unit-tested in Node.

export interface Point {
    x: number;
    y: number;
}

export enum Dir {
    Up = 0,
    Down = 1,
    Left = 2,
    Right = 3,
}

export const DIR_VEC: Readonly<Record<Dir, Readonly<Point>>> = {
    [Dir.Up]: { x: 0, y: 1 },
    [Dir.Down]: { x: 0, y: -1 },
    [Dir.Left]: { x: -1, y: 0 },
    [Dir.Right]: { x: 1, y: 0 },
};

export const ALL_DIRS: readonly Dir[] = [Dir.Up, Dir.Down, Dir.Left, Dir.Right];

/** Static map cells. Dart traps are solid blocks that shoot darts. */
export enum Tile {
    Empty = 0,
    Wall = 1,
    Spike = 2,
    Exit = 3,
    DartUp = 4,
    DartDown = 5,
    DartLeft = 6,
    DartRight = 7,
}

export function isSolidTile(t: Tile): boolean {
    return t === Tile.Wall || t >= Tile.DartUp;
}

export function dartTileDir(t: Tile): Dir | null {
    switch (t) {
        case Tile.DartUp: return Dir.Up;
        case Tile.DartDown: return Dir.Down;
        case Tile.DartLeft: return Dir.Left;
        case Tile.DartRight: return Dir.Right;
        default: return null;
    }
}

export function dartTileFor(dir: Dir): Tile {
    switch (dir) {
        case Dir.Up: return Tile.DartUp;
        case Dir.Down: return Tile.DartDown;
        case Dir.Left: return Tile.DartLeft;
        default: return Tile.DartRight;
    }
}

/** Collectibles that sit on open cells. */
export enum Item {
    Firefly = 1, // small dot, the main score item
    Coin = 2,    // persistent currency for the lantern shop
    Star = 3,    // level rating (3 per level)
    Shield = 4,  // absorbs one hit
    Magnet = 5,  // pulls nearby fireflies and coins
    Freeze = 6,  // stops enemies, darts and darkness
}

export const POWER_UP_DURATION = {
    magnet: 10,
    freeze: 5,
};
