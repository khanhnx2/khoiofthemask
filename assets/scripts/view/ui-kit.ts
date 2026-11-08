import {
    BlockInputEvents, Color, Graphics, Label, Layers, Node, UITransform, Vec3, tween,
} from 'cc';
import { PALETTE } from './palette';

/** Small helpers to build the whole UI from code, so the project needs no prefabs or art files. */

export function makeNode(name: string, parent: Node, width = 0, height = 0): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.UI_2D;
    const t = node.addComponent(UITransform);
    t.setContentSize(width, height);
    parent.addChild(node);
    return node;
}

export interface LabelOptions {
    size?: number;
    color?: Color;
    bold?: boolean;
    width?: number;
}

export function makeLabel(parent: Node, text: string, x: number, y: number, opts: LabelOptions = {}): Label {
    const size = opts.size ?? 32;
    const node = makeNode('Label', parent, opts.width ?? 0, size * 1.3);
    node.setPosition(x, y);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = size;
    label.lineHeight = size * 1.25;
    label.color = opts.color ?? PALETTE.text;
    label.isBold = opts.bold ?? false;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    if (opts.width) {
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
    }
    return label;
}

export function fillRoundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, color: Color): void {
    g.fillColor = color;
    g.roundRect(x, y, w, h, r);
    g.fill();
}

let clickHook: (() => void) | null = null;

/** Lets the game play a click sound for every button without each screen wiring it. */
export function setButtonClickHook(fn: () => void): void {
    clickHook = fn;
}

export interface ButtonOptions {
    color?: Color;
    textSize?: number;
    textColor?: Color;
    disabled?: boolean;
}

/** A rounded button with a press animation. Returns the node so callers can position it. */
export function makeButton(
    parent: Node, text: string, x: number, y: number, w: number, h: number,
    onClick: () => void, opts: ButtonOptions = {},
): Node {
    const node = makeNode(`Button:${text}`, parent, w, h);
    node.setPosition(x, y);
    const g = node.addComponent(Graphics);
    const base = opts.color ?? PALETTE.button;
    const color = opts.disabled ? new Color(base.r * 0.5, base.g * 0.5, base.b * 0.5, 255) : base;
    fillRoundRect(g, -w / 2, -h / 2 - 6, w, h, 18, new Color(color.r * 0.6, color.g * 0.6, color.b * 0.6, 255));
    fillRoundRect(g, -w / 2, -h / 2, w, h, 18, color);
    makeLabel(node, text, 0, 0, {
        size: opts.textSize ?? 34,
        bold: true,
        color: opts.disabled ? PALETTE.textDim : opts.textColor ?? PALETTE.text,
    });

    const press = (s: number) => tween(node).to(0.06, { scale: new Vec3(s, s, 1) }).start();
    node.on(Node.EventType.TOUCH_START, () => press(0.94));
    node.on(Node.EventType.TOUCH_CANCEL, () => press(1));
    node.on(Node.EventType.TOUCH_END, () => {
        press(1);
        if (opts.disabled) return;
        clickHook?.();
        onClick();
    });
    return node;
}

/** Full-screen layer that swallows touches so screens underneath do not react. */
export function makeOverlay(parent: Node, name: string, width: number, height: number, dim: Color | null): Node {
    const node = makeNode(name, parent, width, height);
    node.addComponent(BlockInputEvents);
    if (dim) {
        const g = node.addComponent(Graphics);
        g.fillColor = dim;
        g.rect(-width / 2, -height / 2, width, height);
        g.fill();
    }
    return node;
}

export function starText(count: number, total = 3): string {
    let s = '';
    for (let i = 0; i < total; i++) s += i < count ? '★' : '☆';
    return s;
}

/** Simple lantern icon used on the menu and in the shop. */
export function drawLantern(g: Graphics, x: number, y: number, scale: number, body: Color, glow: Color): void {
    g.fillColor = new Color(glow.r, glow.g, glow.b, 60);
    g.circle(x, y, 60 * scale);
    g.fill();
    g.fillColor = PALETTE.eye;
    g.roundRect(x - 14 * scale, y + 20 * scale, 28 * scale, 10 * scale, 4 * scale);
    g.roundRect(x - 14 * scale, y - 30 * scale, 28 * scale, 10 * scale, 4 * scale);
    g.fill();
    g.fillColor = body;
    g.roundRect(x - 22 * scale, y - 24 * scale, 44 * scale, 48 * scale, 14 * scale);
    g.fill();
    g.fillColor = new Color(glow.r, glow.g, glow.b, 210);
    g.roundRect(x - 8 * scale, y - 20 * scale, 16 * scale, 40 * scale, 7 * scale);
    g.fill();
    g.fillColor = PALETTE.eye;
    g.roundRect(x - 14 * scale, y - 3 * scale, 7 * scale, 11 * scale, 3 * scale);
    g.roundRect(x + 7 * scale, y - 3 * scale, 7 * scale, 11 * scale, 3 * scale);
    g.fill();
}
