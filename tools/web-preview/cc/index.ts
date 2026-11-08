/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Browser preview shim: a tiny Canvas 2D implementation of the subset of the
 * Cocos Creator 'cc' API this game uses. It lets the real game scripts run in a
 * plain browser without the Cocos editor. It is NOT the Cocos engine; final
 * builds should always go through Cocos Creator.
 */

// ------------------------------------------------------------------ math & color

export class Vec2 {
    constructor(public x = 0, public y = 0) {}
}

export class Vec3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
}

export class Color {
    constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
    static fromHEX(out: Color, hex: string): Color {
        const h = hex.replace('#', '');
        out.r = parseInt(h.slice(0, 2), 16);
        out.g = parseInt(h.slice(2, 4), 16);
        out.b = parseInt(h.slice(4, 6), 16);
        out.a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
        return out;
    }
}

function css(c: Color, alphaMul = 1): string {
    return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${(c.a / 255) * alphaMul})`;
}

export class Size {
    constructor(public width = 0, public height = 0) {}
}

// ------------------------------------------------------------------ decorators & components

export const _decorator = {
    ccclass: (_name?: string) => (target: any, _ctx?: any) => target,
};

export const Layers = { Enum: { DEFAULT: 1 << 30, UI_2D: 1 << 25 } };

export class Component {
    node!: Node;
    enabled = true;
    onLoad?(): void;
    update?(dt: number): void;
    onDestroy?(): void;
    getComponent<T>(cls: new () => T): T | null { return this.node.getComponent(cls); }
}

export class UITransform extends Component {
    contentSize = new Size();
    setContentSize(w: number, h: number): void { this.contentSize = new Size(w, h); }
}

export class BlockInputEvents extends Component {}

export class UIOpacity extends Component {
    opacity = 255;
}

export class Canvas extends Component {}

type Cmd = (ctx: CanvasRenderingContext2D, alpha: number) => void;

export class Graphics extends Component {
    fillColor = new Color();
    strokeColor = new Color();
    lineWidth = 1;
    cmds: Cmd[] = [];
    private path: Cmd[] = [];

    clear(): void { this.cmds = []; this.path = []; }
    moveTo(x: number, y: number): void { this.path.push((c) => c.moveTo(x, y)); }
    lineTo(x: number, y: number): void { this.path.push((c) => c.lineTo(x, y)); }
    close(): void { this.path.push((c) => c.closePath()); }
    rect(x: number, y: number, w: number, h: number): void { this.path.push((c) => c.rect(x, y, w, h)); }
    roundRect(x: number, y: number, w: number, h: number, r: number): void {
        const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
        this.path.push((c) => { c.moveTo(x + rr, y); (c as any).roundRect(x, y, w, h, rr); });
    }
    circle(x: number, y: number, r: number): void {
        this.path.push((c) => { c.moveTo(x + r, y); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); });
    }
    ellipse(x: number, y: number, rx: number, ry: number): void {
        this.path.push((c) => { c.moveTo(x + rx, y); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); });
    }
    /** Cocos angles are y-up; with the flipped canvas transform an increasing angle is counterclockwise. */
    arc(x: number, y: number, r: number, start: number, end: number, counterclockwise: boolean): void {
        this.path.push((c) => c.arc(x, y, r, start, end, !counterclockwise));
    }
    fill(): void { this.flush(true); }
    stroke(): void { this.flush(false); }

    private flush(fill: boolean): void {
        const path = this.path;
        this.path = [];
        const color = fill ? this.fillColor : this.strokeColor;
        const width = this.lineWidth;
        this.cmds.push((c, alpha) => {
            c.beginPath();
            for (const p of path) p(c, alpha);
            if (fill) { c.fillStyle = css(color, alpha); c.fill(); }
            else { c.strokeStyle = css(color, alpha); c.lineWidth = width; c.lineCap = 'round'; c.stroke(); }
        });
    }
}

export class Label extends Component {
    static HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
    static VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
    static Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };
    string = '';
    fontSize = 40;
    lineHeight = 40;
    color = new Color();
    isBold = false;
    horizontalAlign = 1;
    verticalAlign = 1;
    overflow = 0;
}

// ------------------------------------------------------------------ nodes

type Handler = (...args: any[]) => void;

export class Node {
    static EventType = {
        TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move', TOUCH_END: 'touch-end', TOUCH_CANCEL: 'touch-cancel',
    };
    name: string;
    layer = Layers.Enum.DEFAULT;
    active = true;
    parent: Node | null = null;
    children: Node[] = [];
    components: Component[] = [];
    listeners = new Map<string, Handler[]>();
    destroyed = false;
    private pos = new Vec3();
    private scl = new Vec3(1, 1, 1);

    constructor(name = 'Node') { this.name = name; }

    get position(): Vec3 { return this.pos; }
    setPosition(x: number, y: number, z = 0): void { this.pos = new Vec3(x, y, z); }
    get scale(): Vec3 { return this.scl; }
    set scale(v: Vec3) { this.scl = new Vec3(v.x, v.y, v.z); }

    get inScene(): boolean {
        let n: Node | null = this;
        while (n) { if (n instanceof Scene) return true; n = n.parent; }
        return false;
    }

    addChild(child: Node): void {
        child.parent = this;
        this.children.push(child);
        if (this.inScene) child.walk((n) => n.components.forEach((c) => runtime.load(c)));
    }

    addComponent<T extends Component>(cls: new () => T): T {
        const c = new cls();
        c.node = this;
        this.components.push(c);
        if (this.inScene) runtime.load(c);
        return c;
    }

    getComponent<T>(cls: new () => T): T | null {
        return (this.components.find((c) => c instanceof (cls as any)) as any) ?? null;
    }

    getComponentInChildren<T>(cls: new () => T): T | null {
        let found: T | null = null;
        this.walk((n) => { if (!found) found = n.getComponent(cls); });
        return found;
    }

    on(type: string, fn: Handler): void {
        const list = this.listeners.get(type) ?? [];
        list.push(fn);
        this.listeners.set(type, list);
    }

    emit(type: string, ...args: any[]): void {
        (this.listeners.get(type) ?? []).forEach((fn) => fn(...args));
    }

    walk(fn: (n: Node) => void): void {
        fn(this);
        this.children.forEach((c) => c.walk(fn));
    }

    destroy(): void {
        if (this.destroyed) return;
        this.walk((n) => { n.destroyed = true; });
        runtime.pendingDestroy.push(this);
    }

    destroyAllChildren(): void {
        this.children.forEach((c) => c.destroy());
    }

    /** World position (Canvas-centered, y up) and accumulated scale. */
    worldTransform(): { x: number; y: number; s: number } {
        const chain: Node[] = [];
        let n: Node | null = this;
        while (n) { chain.unshift(n); n = n.parent; }
        let x = 0; let y = 0; let s = 1;
        for (const c of chain) { x += c.pos.x * s; y += c.pos.y * s; s *= c.scl.x; }
        return { x, y, s };
    }
}

export class Scene extends Node {}

// ------------------------------------------------------------------ tween

type Step = { kind: 'to'; dur: number; props: any } | { kind: 'delay'; dur: number } | { kind: 'call'; fn: () => void };

class Tween {
    private steps: Step[] = [];
    private index = 0;
    private t = 0;
    private from: any = null;
    constructor(private target: any) {}
    to(dur: number, props: any): this { this.steps.push({ kind: 'to', dur, props }); return this; }
    delay(dur: number): this { this.steps.push({ kind: 'delay', dur }); return this; }
    call(fn: () => void): this { this.steps.push({ kind: 'call', fn }); return this; }
    start(): this { runtime.tweens.push(this); return this; }

    /** Returns false when finished. */
    tick(dt: number): boolean {
        const target = this.target;
        if (target instanceof Node && target.destroyed) return false;
        if (target instanceof Component && target.node.destroyed) return false;
        while (this.index < this.steps.length) {
            const step = this.steps[this.index];
            if (step.kind === 'call') { step.fn(); this.index++; continue; }
            if (step.kind === 'to' && this.from === null) {
                this.from = {};
                for (const k of Object.keys(step.props)) {
                    const v = target[k];
                    this.from[k] = typeof v === 'object' ? { x: v.x, y: v.y, z: v.z } : v;
                }
            }
            this.t += dt;
            dt = 0;
            const k = step.dur > 0 ? Math.min(1, this.t / step.dur) : 1;
            if (step.kind === 'to') {
                for (const key of Object.keys(step.props)) {
                    const a = this.from[key];
                    const b = step.props[key];
                    target[key] = typeof b === 'object'
                        ? new Vec3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k)
                        : a + (b - a) * k;
                }
            }
            if (k < 1) return true;
            this.index++;
            this.t = 0;
            this.from = null;
        }
        return false;
    }
}

export function tween(target: any): Tween {
    return new Tween(target);
}

// ------------------------------------------------------------------ view & sys

export const ResolutionPolicy = { FIXED_WIDTH: 4, FIXED_HEIGHT: 3, SHOW_ALL: 2 };

export const view = {
    getFrameSize: () => new Size(window.innerWidth, window.innerHeight),
    getVisibleSize: () => new Size(runtime.visibleW, runtime.visibleH),
    setDesignResolutionSize(w: number, h: number, policy: number): void {
        const fw = window.innerWidth;
        const fh = window.innerHeight;
        runtime.scale = policy === ResolutionPolicy.FIXED_HEIGHT ? fh / h : fw / w;
        runtime.visibleW = fw / runtime.scale;
        runtime.visibleH = fh / runtime.scale;
    },
};

export const sys = { localStorage: window.localStorage };

// ------------------------------------------------------------------ input

export const Input = {
    EventType: {
        TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move', TOUCH_END: 'touch-end', TOUCH_CANCEL: 'touch-cancel',
        KEY_DOWN: 'keydown',
    },
};

export const KeyCode = {
    ARROW_LEFT: 37, ARROW_UP: 38, ARROW_RIGHT: 39, ARROW_DOWN: 40, KEY_A: 65, KEY_D: 68, KEY_S: 83, KEY_W: 87,
};

export class EventTouch {
    constructor(private loc: Vec2) {}
    getUILocation(): Vec2 { return new Vec2(this.loc.x, this.loc.y); }
}

export class EventKeyboard {
    constructor(public keyCode: number) {}
}

const globalListeners = new Map<string, Array<{ fn: Handler; target: any }>>();

export const input = {
    on(type: string, fn: Handler, target?: any): void {
        const list = globalListeners.get(type) ?? [];
        list.push({ fn, target });
        globalListeners.set(type, list);
    },
    off(type: string, fn: Handler, target?: any): void {
        const list = globalListeners.get(type) ?? [];
        globalListeners.set(type, list.filter((l) => l.fn !== fn || l.target !== target));
    },
};

function emitGlobal(type: string, event: any): void {
    (globalListeners.get(type) ?? []).slice().forEach((l) => l.fn.call(l.target, event));
}

// ------------------------------------------------------------------ director

export const Director = { EVENT_AFTER_SCENE_LAUNCH: 'after-scene-launch' };

const directorListeners = new Map<string, Handler[]>();

export const director = {
    on(type: string, fn: Handler): void {
        const list = directorListeners.get(type) ?? [];
        list.push(fn);
        directorListeners.set(type, list);
    },
    getScene: (): Scene | null => runtime.scene,
};

// ------------------------------------------------------------------ runtime loop

const runtime = {
    scene: null as Scene | null,
    canvasNode: null as Node | null,
    scale: 1,
    visibleW: 720,
    visibleH: 1280,
    tweens: [] as Tween[],
    pendingDestroy: [] as Node[],
    loaded: new WeakSet<Component>(),
    load(c: Component): void {
        if (this.loaded.has(c)) return;
        this.loaded.add(c);
        c.onLoad?.();
    },
};

/** Start the preview: build a scene with an empty Canvas, like a fresh Cocos 2D scene. */
export function bootPreview(canvasEl: HTMLCanvasElement): void {
    const ctx = canvasEl.getContext('2d')!;
    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        canvasEl.width = window.innerWidth * dpr;
        canvasEl.height = window.innerHeight * dpr;
        canvasEl.style.width = `${window.innerWidth}px`;
        canvasEl.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);

    const scene = new Scene('main');
    runtime.scene = scene;
    (window as any).__ccPreview = runtime; // handy for debugging in DevTools
    const canvasNode = new Node('Canvas');
    scene.addChild(canvasNode);
    canvasNode.addComponent(UITransform);
    canvasNode.addComponent(Canvas);
    runtime.canvasNode = canvasNode;
    (directorListeners.get(Director.EVENT_AFTER_SCENE_LAUNCH) ?? []).forEach((fn) => fn(scene));

    setupPointer(canvasEl);
    window.addEventListener('keydown', (e) => {
        if (e.keyCode >= 37 && e.keyCode <= 40) e.preventDefault();
        emitGlobal(Input.EventType.KEY_DOWN, new EventKeyboard(e.keyCode));
    });

    let last = performance.now();
    const frame = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        scene.walk((n) => {
            if (!n.active || n.destroyed) return;
            n.components.forEach((c) => { if (c.enabled && runtime.loaded.has(c)) c.update?.(dt); });
        });
        runtime.tweens = runtime.tweens.filter((t) => t.tick(dt));
        flushDestroy();
        render(ctx);
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

function flushDestroy(): void {
    const list = runtime.pendingDestroy;
    runtime.pendingDestroy = [];
    for (const node of list) {
        node.walk((n) => n.components.forEach((c) => c.onDestroy?.()));
        if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node);
        node.parent = null;
    }
}

function isVisible(n: Node): boolean {
    let p: Node | null = n;
    while (p) { if (!p.active || p.destroyed) return false; p = p.parent; }
    return true;
}

function render(ctx: CanvasRenderingContext2D): void {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070a16';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const s = runtime.scale * dpr;
    const base = { a: s, ox: ctx.canvas.width / 2, oy: ctx.canvas.height / 2 };
    const draw = (n: Node, x: number, y: number, sc: number, alpha: number) => {
        if (!n.active || n.destroyed) return;
        const nx = x + n.position.x * sc;
        const ny = y + n.position.y * sc;
        const ns = sc * n.scale.x;
        const op = n.getComponent(UIOpacity);
        const a = alpha * (op ? op.opacity / 255 : 1);
        const g = n.getComponent(Graphics);
        if (g && g.cmds.length) {
            ctx.setTransform(base.a * ns, 0, 0, -base.a * ns, base.ox + nx * base.a, base.oy - ny * base.a);
            for (const cmd of g.cmds) cmd(ctx, a);
        }
        const l = n.getComponent(Label);
        if (l && l.string) drawLabel(ctx, l, n, base, nx, ny, ns, a);
        n.children.forEach((c) => draw(c, nx, ny, ns, a));
    };
    if (runtime.scene) draw(runtime.scene, 0, 0, 1, 1);
}

function drawLabel(ctx: CanvasRenderingContext2D, l: Label, n: Node, base: any, x: number, y: number, s: number, alpha: number): void {
    ctx.setTransform(base.a * s, 0, 0, base.a * s, base.ox + x * base.a, base.oy - y * base.a);
    ctx.font = `${l.isBold ? 'bold ' : ''}${l.fontSize}px "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.fillStyle = css(l.color, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = n.getComponent(UITransform)?.contentSize.width ?? 0;
    let lines = l.string.split('\n');
    if (l.overflow === Label.Overflow.RESIZE_HEIGHT && width > 0) {
        lines = lines.flatMap((line) => wrap(ctx, line, width));
    }
    const top = -((lines.length - 1) * l.lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 0, top + i * l.lineHeight));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
    const out: string[] = [];
    let cur = '';
    for (const word of text.split(' ')) {
        const next = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(next).width > width && cur) { out.push(cur); cur = word; } else cur = next;
    }
    out.push(cur);
    return out;
}

// ------------------------------------------------------------------ pointer → touch

function setupPointer(el: HTMLCanvasElement): void {
    let captured: Node | null = null;
    const ui = (e: PointerEvent) => new Vec2(e.clientX / runtime.scale, (window.innerHeight - e.clientY) / runtime.scale);
    const hit = (p: Vec2): Node | null => {
        // Same origin as render(): the center of the current window.
        const cx = p.x - window.innerWidth / runtime.scale / 2;
        const cy = p.y - window.innerHeight / runtime.scale / 2;
        const ordered: Node[] = [];
        runtime.scene?.walk((n) => ordered.push(n));
        for (let i = ordered.length - 1; i >= 0; i--) {
            const n = ordered[i];
            const interactive = n.listeners.size > 0 || n.getComponent(BlockInputEvents);
            if (!interactive || !isVisible(n)) continue;
            const t = n.getComponent(UITransform);
            if (!t) continue;
            const w = n.worldTransform();
            const hw = (t.contentSize.width * w.s) / 2;
            const hh = (t.contentSize.height * w.s) / 2;
            if (Math.abs(cx - w.x) <= hw && Math.abs(cy - w.y) <= hh) return n;
        }
        return null;
    };
    el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        const p = ui(e);
        emitGlobal(Input.EventType.TOUCH_START, new EventTouch(p));
        captured = hit(p);
        captured?.emit(Node.EventType.TOUCH_START);
    });
    el.addEventListener('pointermove', (e) => {
        if (e.buttons === 0 && e.pointerType === 'mouse') return;
        emitGlobal(Input.EventType.TOUCH_MOVE, new EventTouch(ui(e)));
    });
    el.addEventListener('pointerup', (e) => {
        const p = ui(e);
        emitGlobal(Input.EventType.TOUCH_END, new EventTouch(p));
        if (captured) {
            const target = captured;
            captured = null;
            target.emit(hit(p) === target ? Node.EventType.TOUCH_END : Node.EventType.TOUCH_CANCEL);
        }
    });
    el.addEventListener('pointercancel', () => {
        emitGlobal(Input.EventType.TOUCH_CANCEL, null);
        captured?.emit(Node.EventType.TOUCH_CANCEL);
        captured = null;
    });
}

// ------------------------------------------------------------------ audio (Web Audio)

let audioCtx: AudioContext | null = null;

function ctxAudio(): AudioContext {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        // Browsers start audio suspended until the first user gesture.
        const resume = () => { void audioCtx?.resume(); };
        window.addEventListener('pointerdown', resume);
        window.addEventListener('keydown', resume);
    }
    return audioCtx;
}

export class AudioClip {
    constructor(public buffer: AudioBuffer) {}
}

export class AudioSource extends Component {
    clip: AudioClip | null = null;
    loop = false;
    volume = 1;
    private current: AudioBufferSourceNode | null = null;

    get playing(): boolean { return this.current !== null; }

    play(): void {
        this.stop();
        if (!this.clip) return;
        const ctx = ctxAudio();
        const src = ctx.createBufferSource();
        src.buffer = this.clip.buffer;
        src.loop = this.loop;
        const gain = ctx.createGain();
        gain.gain.value = this.volume;
        src.connect(gain).connect(ctx.destination);
        src.onended = () => { if (this.current === src) this.current = null; };
        src.start();
        this.current = src;
    }

    stop(): void {
        const cur = this.current;
        this.current = null;
        try { cur?.stop(); } catch { /* already stopped */ }
    }

    playOneShot(clip: AudioClip, volume = 1): void {
        const ctx = ctxAudio();
        const src = ctx.createBufferSource();
        src.buffer = clip.buffer;
        const gain = ctx.createGain();
        gain.gain.value = volume * this.volume;
        src.connect(gain).connect(ctx.destination);
        src.start();
    }

    onDestroy(): void { this.stop(); }
}

/** resources.load('audio/x', AudioClip, cb) → fetches res/audio/x.mp3 copied next to the preview page. */
export const resources = {
    load(path: string, _type: unknown, cb: (err: Error | null, asset: AudioClip | null) => void): void {
        fetch(`res/${path}.mp3`)
            .then((r) => { if (!r.ok) throw new Error(`${r.status} ${path}`); return r.arrayBuffer(); })
            .then((buf) => ctxAudio().decodeAudioData(buf))
            .then((decoded) => cb(null, new AudioClip(decoded)))
            .catch((e) => cb(e, null));
    },
};
