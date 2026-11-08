import test from 'node:test';
import assert from 'node:assert/strict';
import { EndlessGenerator } from '../assets/scripts/logic/endless-generator';
import { analyzeReachability } from '../assets/scripts/logic/solver';
import { Tile } from '../assets/scripts/logic/types';

test('endless caves always keep a safe route to the top', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const gen = new EndlessGenerator(seed);
        gen.generateUntil(800);
        const world = gen.world;
        const reach = analyzeReachability(world);
        let top = 0;
        reach.stops.forEach((k) => { top = Math.max(top, Math.floor(k / world.grid.width)); });
        assert.ok(top >= 800, `seed ${seed}: highest safe stop is ${top}, expected >= 800`);
    }
});

test('bats cross the route in short flights and never fly over a route stop', () => {
    for (let seed = 1; seed <= 25; seed++) {
        const gen = new EndlessGenerator(seed);
        gen.generateUntil(900);
        const w = gen.world;
        assert.ok(w.bats.length > 0, `seed ${seed}: expected some bats`);
        for (const bat of w.bats) {
            // Walk the bat's whole flight line along its axis.
            const flight: number[] = [];
            for (const sign of [1, -1]) {
                let x = bat.cx;
                let y = bat.cy;
                while (!w.grid.isSolid(x, y)) {
                    flight.push(w.key(x, y));
                    x += bat.dx * sign;
                    y += bat.dy * sign;
                }
            }
            const cells = new Set(flight);
            assert.ok(cells.size <= 3, `seed ${seed}: bat at (${bat.cx}, ${bat.cy}) flies over ${cells.size} cells`);
            // The player can always wait safely at every stop of the guaranteed route.
            cells.forEach((k) => assert.ok(!gen.routeStops.has(k), `seed ${seed}: bat flight covers a route stop`));
        }
    }
});

test('the start area has no hazards', () => {
    const gen = new EndlessGenerator(7);
    gen.generateUntil(200);
    const w = gen.world;
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < w.grid.width; x++) assert.notEqual(w.grid.get(x, y), Tile.Spike);
    }
    assert.ok(w.bats.every((b) => b.cy >= 16));
    assert.ok(w.traps.every((t) => t.y >= 16));
});

test('the same seed builds the same cave', () => {
    const a = new EndlessGenerator(99);
    const b = new EndlessGenerator(99);
    a.generateUntil(300);
    b.generateUntil(300);
    for (let y = 0; y < 300; y++) {
        for (let x = 0; x < 11; x++) assert.equal(a.world.grid.get(x, y), b.world.grid.get(x, y));
    }
});

test('hazards get denser higher up', () => {
    const gen = new EndlessGenerator(3);
    gen.generateUntil(1200);
    const low = gen.world.bats.filter((b) => b.cy < 200).length;
    const high = gen.world.bats.filter((b) => b.cy >= 1000 && b.cy < 1200).length;
    assert.ok(high > low, `expected more bats high up (low=${low}, high=${high})`);
});
