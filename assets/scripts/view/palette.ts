import { Color } from 'cc';

export function hex(h: string, alpha = 255): Color {
    const c = new Color();
    Color.fromHEX(c, h);
    c.a = alpha;
    return c;
}

export function withAlpha(c: Color, alpha: number): Color {
    return new Color(c.r, c.g, c.b, Math.max(0, Math.min(255, Math.round(alpha))));
}

/** Cave palette: deep blue stone, teal glow edges, warm lantern light. */
export const PALETTE = {
    background: hex('#0b0f1f'),
    backgroundDeep: hex('#070a16'),
    wall: hex('#1b2340'),
    wallInner: hex('#141a31'),
    wallEdge: hex('#36e0c8'),
    spike: hex('#ff4d6d'),
    exit: hex('#ffd166'),
    firefly: hex('#fff27a'),
    coin: hex('#ffb703'),
    coinDark: hex('#c77d00'),
    star: hex('#ffe066'),
    shield: hex('#4cc9f0'),
    magnet: hex('#f72585'),
    freeze: hex('#a0e7ff'),
    bat: hex('#9b5de5'),
    batEye: hex('#ffdd00'),
    dart: hex('#ff7b00'),
    trap: hex('#3a2f55'),
    darkness: hex('#05030a'),
    darknessEdge: hex('#7b2ff7'),
    text: hex('#f1f5ff'),
    textDim: hex('#8f9bc4'),
    panel: hex('#121834', 235),
    button: hex('#2a3566'),
    buttonAccent: hex('#e5484d'),
    buttonGood: hex('#2fbf9b'),
    eye: hex('#1a1020'),
};
