import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../assets/scripts/logic/levels';
import { parseLevel } from '../assets/scripts/logic/level-parser';
import { analyzeReachability } from '../assets/scripts/logic/solver';
import { Item } from '../assets/scripts/logic/types';

LEVELS.forEach((def, i) => {
    test(`level ${i + 1} "${def.name}" is completable with all 3 stars`, () => {
        const world = parseLevel(def);
        assert.ok(world.exit, 'level must have an exit');
        assert.equal(world.countItems(Item.Star), 3, 'level must have exactly 3 stars');
        assert.equal(world.grid.width, 11, 'levels are 11 tiles wide to fit the screen');

        const reach = analyzeReachability(world);
        assert.ok(reach.exitReached, 'exit must be reachable without touching spikes');
        world.items.forEach((item, key) => {
            if (item === Item.Star) assert.ok(reach.passed.has(key), `star at key ${key} must be reachable`);
        });
    });
});
