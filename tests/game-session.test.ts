import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../assets/scripts/logic/game-session';
import { computeSlide } from '../assets/scripts/logic/grid';
import { parseLevel } from '../assets/scripts/logic/level-parser';
import { EndlessGenerator } from '../assets/scripts/logic/endless-generator';
import { Dir, Item } from '../assets/scripts/logic/types';

function session(rows: string[], darkness = 0) {
    return new GameSession(parseLevel({ name: 'test', rows }), { mode: 'level', darknessSpeed: darkness });
}

/** Advance the simulation in small steps. */
function run(s: GameSession, seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 60) s.update(1 / 60);
}

test('a slide stops right before the first solid cell', () => {
    const w = parseLevel({ name: 't', rows: ['#######', '#P   ##', '#######'] });
    const r = computeSlide(w.grid, w.start.x, w.start.y, Dir.Right);
    assert.deepEqual([r.x, r.y], [4, 1]);
    assert.equal(r.cells.length, 3);
    assert.equal(computeSlide(w.grid, w.start.x, w.start.y, Dir.Up).cells.length, 0);
});

test('sliding collects fireflies, coins and stars on the way', () => {
    const s = session(['#######', '#P.c*.#', '#######']);
    s.move(Dir.Right);
    run(s, 1);
    assert.equal(s.fireflies, 2);
    assert.equal(s.coins, 1);
    assert.equal(s.stars, 1);
    assert.equal(s.player.cellX, 5);
    assert.equal(s.player.sliding, false);
});

test('a swipe during a slide is buffered and runs when the slide ends', () => {
    const s = session(['#####', '#  ##', '#P ##', '#####']);
    s.move(Dir.Right);
    s.move(Dir.Up);
    run(s, 1);
    assert.deepEqual([s.player.cellX, s.player.cellY], [2, 2]);
});

test('touching a spike kills, a shield saves once', () => {
    const dead = session(['######', '#P ^ #', '######']);
    dead.move(Dir.Right);
    run(dead, 1);
    assert.equal(dead.state, 'dead');

    const saved = session(['######', '#PS^ #', '######']);
    saved.move(Dir.Right);
    run(saved, 1);
    assert.equal(saved.state, 'playing');
    assert.equal(saved.shield, false);
    assert.ok(saved.events.some((e) => e.type === 'shieldBreak'));
});

test('entering the exit wins the level', () => {
    const s = session(['#####', '#P E#', '#####']);
    s.move(Dir.Right);
    run(s, 1);
    assert.equal(s.state, 'won');
});

test('darkness only rises after the first move and kills an idle player', () => {
    const rows = ['###', '# #', '# #', '# #', '# #', '#P#', '###'];
    const s = session(rows, 2);
    const before = s.darknessY;
    run(s, 2);
    assert.equal(s.darknessY, before, 'no rise before the first move');
    s.move(Dir.Up);
    run(s, 6);
    assert.equal(s.state, 'dead');
});

test('freeze stops the darkness', () => {
    const s = session(['####', '#  #', '#F #', '#P #', '####'], 3);
    s.move(Dir.Up);
    run(s, 0.5);
    const y = s.darknessY;
    run(s, 2);
    assert.equal(s.darknessY, y);
    assert.equal(s.state, 'playing');
});

test('a bat crossing the player kills them', () => {
    const s = session(['#######', '#P  h #', '#######']);
    run(s, 3);
    assert.equal(s.state, 'dead');
});

test('a dart trap shoots across a corridor', () => {
    const s = session(['###D###', '#P    #', '#######']);
    s.move(Dir.Right);
    let sawDart = false;
    for (let t = 0; t < 3; t += 1 / 60) {
        s.update(1 / 60);
        if (s.world.darts.length > 0) sawDart = true;
    }
    assert.ok(sawDart);
});

test('the magnet pulls nearby fireflies', () => {
    const s = session(['#######', '#.....#', '#PM  ##', '#######']);
    s.move(Dir.Right);
    run(s, 0.5);
    assert.ok(s.magnetTime > 0);
    assert.ok(s.fireflies >= 3, `pulled ${s.fireflies}`);
});

test('endless sessions keep generating ahead of the player', () => {
    const gen = new EndlessGenerator(5);
    const s = new GameSession(gen.world, { mode: 'endless', darknessSpeed: 0.8, generator: gen });
    assert.ok(gen.routeTop >= s.player.cellY + 40);
    assert.equal(s.world.countItems(Item.Star), 0);
});
