import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyValueStorage, SaveData } from '../assets/scripts/logic/save-data';

function memoryStorage(): KeyValueStorage {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

test('progress survives a reload', () => {
    const store = memoryStorage();
    const a = new SaveData(store);
    a.addCoins(80);
    a.recordLevel(0, 2, 8);
    a.recordEndless(120, 40);

    const b = new SaveData(store);
    assert.equal(b.coins, 80);
    assert.equal(b.starsFor(0), 2);
    assert.equal(b.unlocked, 1);
    assert.equal(b.bestScore, 120);
});

test('stars keep the best result and unlocking stops at the last level', () => {
    const s = new SaveData(memoryStorage());
    s.recordLevel(7, 3, 8);
    s.recordLevel(7, 1, 8);
    assert.equal(s.starsFor(7), 3);
    assert.equal(s.unlocked, 7);
});

test('buying a skin costs coins once', () => {
    const s = new SaveData(memoryStorage());
    assert.equal(s.selectSkin('jade'), false, 'cannot afford yet');
    s.addCoins(100);
    assert.equal(s.selectSkin('jade'), true);
    assert.equal(s.coins, 40);
    assert.equal(s.skinId, 'jade');
    s.selectSkin('red');
    assert.equal(s.selectSkin('jade'), true);
    assert.equal(s.coins, 40, 'owned skins are free to re-equip');
});

test('a corrupted save falls back to defaults', () => {
    const store = memoryStorage();
    store.setItem('khoi-lantern-save-v1', '{not json');
    const s = new SaveData(store);
    assert.equal(s.coins, 0);
    assert.equal(s.skinId, 'red');
});
