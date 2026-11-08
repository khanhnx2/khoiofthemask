import { Color, Graphics, Node } from 'cc';
import { GameSession, SessionEvent } from '../logic/game-session';
import { DIR_VEC, Dir, Item, Tile, dartTileDir } from '../logic/types';
import { LanternSkin } from '../logic/save-data';
import { PALETTE, hex, withAlpha } from './palette';
import { makeNode } from './ui-kit';

export const TILE = 64;
const CHUNK_ROWS = 16;
/** Where the player sits on screen in endless mode (0 = bottom, 1 = top). */
const PLAYER_SCREEN_RATIO = 0.38;
/** Screen height kept free at the top for the HUD bar. */
const HUD_RESERVE = 120;

interface Particle {
    x: number; y: number; vx: number; vy: number;
    life: number; max: number; size: number; color: Color;
}

/**
 * Draws a GameSession with Graphics only: cached static chunks for the cave,
 * and per-frame layers for items, creatures, the player, darkness and effects.
 */
export class WorldView {
    readonly root: Node;
    private readonly session: GameSession;
    private readonly screenW: number;
    private readonly screenH: number;
    private readonly originX: number;
    private readonly chunkLayer: Node;
    private readonly chunks = new Map<number, Node>();
    private readonly items: Graphics;
    private readonly actors: Graphics;
    private readonly fx: Graphics;
    private readonly dark: Graphics;
    private readonly bodyColor: Color;
    private readonly glowColor: Color;
    private particles: Particle[] = [];
    private camY: number;
    private time = 0;
    private squash = 0;
    private shake = 0;

    constructor(parent: Node, session: GameSession, skin: LanternSkin, screenW: number, screenH: number) {
        this.session = session;
        this.screenW = screenW;
        this.screenH = screenH;
        this.bodyColor = hex(skin.body);
        this.glowColor = hex(skin.glow);
        this.originX = -(session.world.grid.width * TILE) / 2;
        this.root = makeNode('World', parent);
        this.chunkLayer = makeNode('Chunks', this.root);
        this.items = makeNode('Items', this.root).addComponent(Graphics);
        this.actors = makeNode('Actors', this.root).addComponent(Graphics);
        this.fx = makeNode('Fx', this.root).addComponent(Graphics);
        this.dark = makeNode('Darkness', this.root).addComponent(Graphics);
        this.camY = session.player.y;
        this.placeCamera(1);
    }

    destroy(): void {
        this.root.destroy();
    }

    /** React to simulation events with effects. */
    handle(e: SessionEvent): void {
        switch (e.type) {
            case 'collect': this.burst(e.x, e.y, itemColor(e.item), e.item === Item.Firefly ? 5 : 12, 1); break;
            case 'slideEnd': this.squash = 0.14; break;
            case 'shieldBreak': this.burst(e.x, e.y, PALETTE.shield, 18, 1.4); this.shake = 0.2; break;
            case 'death': this.burst(e.x, e.y, this.bodyColor, 30, 2); this.shake = 0.35; break;
            default: break;
        }
    }

    update(dt: number): void {
        this.time += dt;
        this.squash = Math.max(0, this.squash - dt);
        this.shake = Math.max(0, this.shake - dt);
        this.placeCamera(dt);
        const [y0, y1] = this.visibleRows();
        this.syncChunks(y0, y1);
        this.drawItems(y0, y1);
        this.drawActors(y0, y1);
        this.drawParticles(dt);
        this.drawDarkness(y0);
    }

    // ---------------------------------------------------------------- camera

    private placeCamera(dt: number): void {
        const s = this.session;
        const mapH = s.world.grid.height * TILE;
        let rootY: number;
        const available = this.screenH - HUD_RESERVE;
        if (s.mode === 'level' && mapH <= available) {
            rootY = -this.screenH / 2 + (available - mapH) / 2;
        } else {
            // Ease toward the player; snap quickly so fast slides stay on screen.
            this.camY += (s.player.y - this.camY) * Math.min(1, dt * 8);
            const anchor = -this.screenH / 2 + this.screenH * PLAYER_SCREEN_RATIO;
            rootY = anchor - (this.camY * TILE + TILE / 2);
            if (s.mode === 'level') {
                rootY = Math.min(-this.screenH / 2, Math.max(this.screenH / 2 - HUD_RESERVE - mapH, rootY));
            } else {
                rootY = Math.min(-this.screenH / 2 + TILE, rootY);
            }
        }
        const k = this.shake > 0 ? this.shake * 40 : 0;
        this.root.setPosition((Math.random() - 0.5) * k, rootY + (Math.random() - 0.5) * k);
    }

    private visibleRows(): [number, number] {
        const bottom = -this.screenH / 2 - this.root.position.y;
        const y0 = Math.floor(bottom / TILE) - 1;
        return [y0, y0 + Math.ceil(this.screenH / TILE) + 2];
    }

    private cx(x: number): number { return this.originX + x * TILE + TILE / 2; }
    private cy(y: number): number { return y * TILE + TILE / 2; }

    // ---------------------------------------------------------------- static cave

    private syncChunks(y0: number, y1: number): void {
        const c0 = Math.max(0, Math.floor(y0 / CHUNK_ROWS) - 1);
        const c1 = Math.floor(y1 / CHUNK_ROWS) + 1;
        const maxChunk = Math.floor((this.session.world.grid.height - 1) / CHUNK_ROWS);
        for (let c = c0; c <= Math.min(c1, maxChunk); c++) {
            if (!this.chunks.has(c)) this.chunks.set(c, this.buildChunk(c));
        }
        this.chunks.forEach((node, c) => {
            if (c < c0 - 2 || c > c1 + 2) {
                node.destroy();
                this.chunks.delete(c);
            }
        });
    }

    private buildChunk(c: number): Node {
        const node = makeNode(`Chunk${c}`, this.chunkLayer);
        const g = node.addComponent(Graphics);
        const grid = this.session.world.grid;
        const yStart = c * CHUNK_ROWS;
        const yEnd = Math.min(grid.height, yStart + CHUNK_ROWS);
        for (let y = yStart; y < yEnd; y++) {
            for (let x = 0; x < grid.width; x++) this.drawTile(g, x, y, grid.get(x, y));
        }
        return node;
    }

    private drawTile(g: Graphics, x: number, y: number, t: Tile): void {
        const grid = this.session.world.grid;
        const left = this.originX + x * TILE;
        const bottom = y * TILE;
        if (t === Tile.Wall || dartTileDir(t) !== null) {
            g.fillColor = PALETTE.wall;
            g.rect(left, bottom, TILE, TILE);
            g.fill();
            g.fillColor = PALETTE.wallInner;
            g.rect(left + 10, bottom + 10, TILE - 20, TILE - 20);
            g.fill();
            // Glowing rim on every side that faces open space.
            g.lineWidth = 5;
            g.strokeColor = PALETTE.wallEdge;
            const open = (dx: number, dy: number) => grid.inBounds(x + dx, y + dy) && !grid.isSolid(x + dx, y + dy);
            if (open(0, 1)) this.line(g, left, bottom + TILE - 2.5, left + TILE, bottom + TILE - 2.5);
            if (open(0, -1)) this.line(g, left, bottom + 2.5, left + TILE, bottom + 2.5);
            if (open(-1, 0)) this.line(g, left + 2.5, bottom, left + 2.5, bottom + TILE);
            if (open(1, 0)) this.line(g, left + TILE - 2.5, bottom, left + TILE - 2.5, bottom + TILE);
            const dir = dartTileDir(t);
            if (dir !== null) this.drawTrapFace(g, x, y, dir);
            return;
        }
        if (t === Tile.Spike) this.drawSpike(g, x, y);
        if (t === Tile.Exit) this.drawExit(g, x, y);
    }

    private line(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
    }

    private drawTrapFace(g: Graphics, x: number, y: number, dir: Dir): void {
        const v = DIR_VEC[dir];
        const px = this.cx(x) + v.x * TILE * 0.3;
        const py = this.cy(y) + v.y * TILE * 0.3;
        g.fillColor = PALETTE.trap;
        g.circle(this.cx(x), this.cy(y), TILE * 0.3);
        g.fill();
        g.fillColor = PALETTE.dart;
        g.circle(px, py, 11);
        g.fill();
        g.fillColor = PALETTE.eye;
        g.circle(px, py, 6);
        g.fill();
    }

    private drawSpike(g: Graphics, x: number, y: number): void {
        const grid = this.session.world.grid;
        // Spikes grow out of the nearest wall: below first, then sides, then above.
        const bases: Dir[] = [Dir.Down, Dir.Left, Dir.Right, Dir.Up];
        const base = bases.find((d) => grid.isSolid(x + DIR_VEC[d].x, y + DIR_VEC[d].y)) ?? Dir.Down;
        const v = DIR_VEC[base];
        const cx = this.cx(x);
        const cy = this.cy(y);
        const half = TILE / 2;
        g.fillColor = PALETTE.spike;
        for (let i = 0; i < 3; i++) {
            const off = -half + (i + 0.5) * (TILE / 3);
            // Base edge sits on the wall side, tip points into the open cell.
            const bx = cx + v.x * half;
            const by = cy + v.y * half;
            const px = v.y !== 0 ? 1 : 0;
            const py = v.x !== 0 ? 1 : 0;
            const w = TILE / 6;
            g.moveTo(bx + px * (off - w), by + py * (off - w));
            g.lineTo(bx + px * (off + w), by + py * (off + w));
            g.lineTo(bx + px * off - v.x * TILE * 0.62, by + py * off - v.y * TILE * 0.62);
            g.close();
            g.fill();
        }
    }

    private drawExit(g: Graphics, x: number, y: number): void {
        const cx = this.cx(x);
        const cy = this.cy(y);
        g.fillColor = withAlpha(PALETTE.exit, 60);
        g.circle(cx, cy, TILE * 0.48);
        g.fill();
        g.lineWidth = 5;
        g.strokeColor = PALETTE.exit;
        g.circle(cx, cy, TILE * 0.36);
        g.stroke();
        g.fillColor = PALETTE.exit;
        g.circle(cx, cy, TILE * 0.14);
        g.fill();
    }

    // ---------------------------------------------------------------- per-frame layers

    private drawItems(y0: number, y1: number): void {
        const g = this.items;
        g.clear();
        const world = this.session.world;
        for (let y = Math.max(0, y0); y <= y1; y++) {
            for (let x = 0; x < world.grid.width; x++) {
                const item = world.itemAt(x, y);
                if (item !== undefined) this.drawItem(g, item, this.cx(x), this.cy(y), x + y);
            }
        }
    }

    private drawItem(g: Graphics, item: Item, x: number, y: number, seed: number): void {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + seed);
        switch (item) {
            case Item.Firefly:
                g.fillColor = withAlpha(PALETTE.firefly, 40 + 50 * pulse);
                g.circle(x, y, 11);
                g.fill();
                g.fillColor = PALETTE.firefly;
                g.circle(x, y, 5);
                g.fill();
                break;
            case Item.Coin: {
                const squeeze = 0.35 + 0.65 * Math.abs(Math.cos(this.time * 3 + seed));
                g.fillColor = PALETTE.coinDark;
                g.ellipse(x, y - 2, 15 * squeeze, 15);
                g.fill();
                g.fillColor = PALETTE.coin;
                g.ellipse(x, y, 14 * squeeze, 14);
                g.fill();
                break;
            }
            case Item.Star:
                g.fillColor = withAlpha(PALETTE.star, 50 + 60 * pulse);
                g.circle(x, y, 26);
                g.fill();
                this.starShape(g, x, y, 22, 9, this.time);
                g.fillColor = PALETTE.star;
                g.fill();
                break;
            case Item.Shield:
                this.powerBadge(g, x, y, PALETTE.shield, pulse);
                g.lineWidth = 4;
                g.strokeColor = PALETTE.text;
                g.moveTo(x - 9, y + 8);
                g.lineTo(x + 9, y + 8);
                g.lineTo(x + 9, y - 1);
                g.lineTo(x, y - 11);
                g.lineTo(x - 9, y - 1);
                g.close();
                g.stroke();
                break;
            case Item.Magnet:
                this.powerBadge(g, x, y, PALETTE.magnet, pulse);
                g.lineWidth = 6;
                g.strokeColor = PALETTE.text;
                g.arc(x, y + 1, 9, Math.PI, Math.PI * 2, true); // U shape opening upward
                g.stroke();
                this.line(g, x - 9, y + 1, x - 9, y + 10);
                this.line(g, x + 9, y + 1, x + 9, y + 10);
                break;
            case Item.Freeze:
                this.powerBadge(g, x, y, PALETTE.freeze, pulse);
                g.lineWidth = 3;
                g.strokeColor = PALETTE.background;
                for (let i = 0; i < 3; i++) {
                    const a = (i * Math.PI) / 3;
                    this.line(g, x - Math.cos(a) * 11, y - Math.sin(a) * 11, x + Math.cos(a) * 11, y + Math.sin(a) * 11);
                }
                break;
        }
    }

    private powerBadge(g: Graphics, x: number, y: number, color: Color, pulse: number): void {
        g.fillColor = withAlpha(color, 50 + 60 * pulse);
        g.circle(x, y, 27);
        g.fill();
        g.fillColor = color;
        g.roundRect(x - 19, y - 19, 38, 38, 10);
        g.fill();
    }

    private starShape(g: Graphics, x: number, y: number, outer: number, inner: number, spin: number): void {
        for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? outer : inner;
            const a = Math.PI / 2 + (i * Math.PI) / 5 + Math.sin(spin * 2) * 0.15;
            const px = x + Math.cos(a) * r;
            const py = y + Math.sin(a) * r;
            if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.close();
    }

    private drawActors(y0: number, y1: number): void {
        const g = this.actors;
        g.clear();
        const s = this.session;
        const w = s.world;
        const frozen = s.freezeTime > 0;

        if (w.exit) {
            const pulse = 0.5 + 0.5 * Math.sin(this.time * 3);
            g.fillColor = withAlpha(PALETTE.exit, 30 + 50 * pulse);
            g.circle(this.cx(w.exit.x), this.cy(w.exit.y), TILE * (0.55 + 0.1 * pulse));
            g.fill();
        }

        for (const trap of w.traps) {
            if (trap.y < y0 || trap.y > y1 || trap.charge < 0.7) continue;
            const v = DIR_VEC[trap.dir];
            const k = (trap.charge - 0.7) / 0.3;
            g.fillColor = withAlpha(PALETTE.dart, 80 + 150 * k);
            g.circle(this.cx(trap.x) + v.x * TILE * 0.3, this.cy(trap.y) + v.y * TILE * 0.3, 8 + 10 * k);
            g.fill();
        }

        for (const dart of w.darts) {
            const v = DIR_VEC[dart.dir];
            const x = this.cx(dart.x);
            const y = this.cy(dart.y);
            g.lineWidth = 7;
            g.strokeColor = PALETTE.dart;
            this.line(g, x - v.x * 18, y - v.y * 18, x + v.x * 18, y + v.y * 18);
            g.fillColor = PALETTE.text;
            g.circle(x + v.x * 18, y + v.y * 18, 4);
            g.fill();
        }

        for (const bat of w.bats) {
            if (bat.y < y0 || bat.y > y1) continue;
            this.drawBat(g, this.cx(bat.x), this.cy(bat.y), frozen);
        }

        if (s.state !== 'dead') this.drawPlayer(g);

        if (frozen) {
            g.lineWidth = 10;
            g.strokeColor = withAlpha(PALETTE.freeze, 120);
            const bottom = -this.screenH / 2 - this.root.position.y;
            g.rect(-this.screenW / 2 + 5, bottom + 5, this.screenW - 10, this.screenH - 10);
            g.stroke();
        }
    }

    private drawBat(g: Graphics, x: number, y: number, frozen: boolean): void {
        const flap = frozen ? 0 : Math.sin(this.time * 18) * 10;
        g.fillColor = frozen ? PALETTE.freeze : PALETTE.bat;
        g.moveTo(x - 6, y + 2);
        g.lineTo(x - 28, y + 10 + flap);
        g.lineTo(x - 20, y - 6);
        g.close();
        g.fill();
        g.moveTo(x + 6, y + 2);
        g.lineTo(x + 28, y + 10 + flap);
        g.lineTo(x + 20, y - 6);
        g.close();
        g.fill();
        g.circle(x, y, 13);
        g.fill();
        g.fillColor = PALETTE.batEye;
        g.circle(x - 5, y + 3, 3);
        g.circle(x + 5, y + 3, 3);
        g.fill();
    }

    private drawPlayer(g: Graphics): void {
        const s = this.session;
        const p = s.player;
        if (s.invulnTime > 0 && Math.floor(this.time * 16) % 2 === 0) return;
        const x = this.cx(p.x);
        const y = this.cy(p.y);
        const horizontal = p.dir === Dir.Left || p.dir === Dir.Right;
        // Stretch along the slide, squash briefly on impact.
        let sx = 1;
        let sy = 1;
        if (p.sliding) { sx = horizontal ? 1.25 : 0.82; sy = horizontal ? 0.82 : 1.25; }
        else if (this.squash > 0) {
            const k = this.squash / 0.14 * 0.25;
            sx = horizontal ? 1 - k : 1 + k;
            sy = horizontal ? 1 + k : 1 - k;
        }

        if (s.magnetTime > 0) {
            g.lineWidth = 3;
            g.strokeColor = withAlpha(PALETTE.magnet, 90 + 60 * Math.sin(this.time * 10));
            g.circle(x, y, TILE * 2.6);
            g.stroke();
        }

        const flicker = 0.85 + 0.15 * Math.sin(this.time * 9);
        g.fillColor = withAlpha(this.glowColor, 45 * flicker);
        g.circle(x, y, 52);
        g.fill();
        g.fillColor = withAlpha(this.glowColor, 70 * flicker);
        g.circle(x, y, 36);
        g.fill();

        const bw = 42 * sx;
        const bh = 46 * sy;
        g.fillColor = PALETTE.eye;
        g.roundRect(x - bw * 0.32, y + bh / 2 - 4, bw * 0.64, 10, 4); // top cap
        g.roundRect(x - bw * 0.32, y - bh / 2 - 6, bw * 0.64, 10, 4); // bottom cap
        g.fill();
        g.fillColor = this.bodyColor;
        g.roundRect(x - bw / 2, y - bh / 2, bw, bh, 14);
        g.fill();
        g.fillColor = withAlpha(this.glowColor, 200);
        g.roundRect(x - bw * 0.18, y - bh / 2 + 4, bw * 0.36, bh - 8, 8); // glowing rib
        g.fill();

        // Eyes look where Khôi is heading.
        const v = DIR_VEC[p.dir];
        const look = p.sliding ? 4 : 2;
        g.fillColor = PALETTE.eye;
        g.roundRect(x - 12 + v.x * look - 3, y + 2 + v.y * look - 5, 7, 11, 3);
        g.roundRect(x + 12 + v.x * look - 4, y + 2 + v.y * look - 5, 7, 11, 3);
        g.fill();

        if (s.shield) {
            g.lineWidth = 4;
            g.strokeColor = withAlpha(PALETTE.shield, 170 + 60 * Math.sin(this.time * 6));
            g.circle(x, y, 40);
            g.stroke();
        }
    }

    private burst(cellX: number, cellY: number, color: Color, count: number, power: number): void {
        const x = this.cx(cellX);
        const y = this.cy(cellY);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (80 + Math.random() * 220) * power;
            const max = 0.35 + Math.random() * 0.35;
            this.particles.push({
                x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max,
                size: 3 + Math.random() * 4 * power, color,
            });
        }
    }

    private drawParticles(dt: number): void {
        const g = this.fx;
        g.clear();
        for (const p of this.particles) {
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.92;
            p.vy *= 0.92;
            if (p.life <= 0) continue;
            g.fillColor = withAlpha(p.color, 255 * (p.life / p.max));
            g.circle(p.x, p.y, p.size);
            g.fill();
        }
        this.particles = this.particles.filter((p) => p.life > 0);
    }

    private drawDarkness(y0: number): void {
        const g = this.dark;
        g.clear();
        const s = this.session;
        if (!s.darknessEnabled) return;
        const top = this.cy(s.darknessY);
        const bottom = Math.min(top, y0 * TILE) - this.screenH;
        const left = this.originX - TILE;
        const right = -this.originX + TILE;
        const steps = 16;
        const wave = (i: number) => Math.sin(this.time * 3 + i * 0.9) * 8;

        g.fillColor = withAlpha(PALETTE.darknessEdge, 110);
        g.moveTo(left, bottom);
        for (let i = 0; i <= steps; i++) g.lineTo(left + ((right - left) * i) / steps, top + 14 + wave(i));
        g.lineTo(right, bottom);
        g.close();
        g.fill();

        g.fillColor = withAlpha(PALETTE.darkness, 245);
        g.moveTo(left, bottom);
        for (let i = 0; i <= steps; i++) g.lineTo(left + ((right - left) * i) / steps, top + wave(i + 3));
        g.lineTo(right, bottom);
        g.close();
        g.fill();
    }
}

function itemColor(item: Item): Color {
    switch (item) {
        case Item.Firefly: return PALETTE.firefly;
        case Item.Coin: return PALETTE.coin;
        case Item.Star: return PALETTE.star;
        case Item.Shield: return PALETTE.shield;
        case Item.Magnet: return PALETTE.magnet;
        default: return PALETTE.freeze;
    }
}

