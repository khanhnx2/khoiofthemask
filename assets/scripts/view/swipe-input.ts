import { EventKeyboard, EventTouch, Input, KeyCode, Vec2, input } from 'cc';
import { Dir } from '../logic/types';

const SWIPE_THRESHOLD = 28;

/**
 * Turns swipes (touch or mouse drag) and arrow/WASD keys into directions.
 * A drag fires as soon as it passes the threshold, and keeps firing if the
 * finger changes direction without lifting, so quick zigzags feel responsive.
 */
export class SwipeInput {
    enabled = false;
    private readonly onDir: (dir: Dir) => void;
    private start: Vec2 | null = null;

    constructor(onDir: (dir: Dir) => void) {
        this.onDir = onDir;
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    destroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    private onTouchStart(e: EventTouch): void {
        this.start = e.getUILocation();
    }

    private onTouchMove(e: EventTouch): void {
        if (!this.start) return;
        const p = e.getUILocation();
        const dx = p.x - this.start.x;
        const dy = p.y - this.start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? Dir.Right : Dir.Left) : (dy > 0 ? Dir.Up : Dir.Down);
        this.start = p;
        if (this.enabled) this.onDir(dir);
    }

    private onTouchEnd(): void {
        this.start = null;
    }

    private onKey(e: EventKeyboard): void {
        if (!this.enabled) return;
        switch (e.keyCode) {
            case KeyCode.ARROW_UP: case KeyCode.KEY_W: this.onDir(Dir.Up); break;
            case KeyCode.ARROW_DOWN: case KeyCode.KEY_S: this.onDir(Dir.Down); break;
            case KeyCode.ARROW_LEFT: case KeyCode.KEY_A: this.onDir(Dir.Left); break;
            case KeyCode.ARROW_RIGHT: case KeyCode.KEY_D: this.onDir(Dir.Right); break;
        }
    }
}
