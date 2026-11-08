/** Minimal storage contract; Cocos passes sys.localStorage, tests pass a Map-backed stub. */
export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface LanternSkin {
    id: string;
    name: string;
    price: number;
    /** Body and glow colors as hex strings (#rrggbb). */
    body: string;
    glow: string;
}

export const SKINS: readonly LanternSkin[] = [
    { id: 'red', name: 'Đèn Đỏ', price: 0, body: '#e5484d', glow: '#ffb38a' },
    { id: 'jade', name: 'Đèn Ngọc', price: 60, body: '#2fbf9b', glow: '#a6ffe4' },
    { id: 'violet', name: 'Đèn Tím', price: 150, body: '#8e5cf0', glow: '#d9c4ff' },
    { id: 'gold', name: 'Đèn Kim', price: 300, body: '#f2b705', glow: '#fff1a8' },
    { id: 'wisp', name: 'Ma Trơi', price: 600, body: '#4fb3ff', glow: '#e3f6ff' },
];

interface SaveShape {
    coins: number;
    bestScore: number;
    bestHeight: number;
    /** Best star count per level index. */
    levelStars: number[];
    /** Highest unlocked level index. */
    unlocked: number;
    ownedSkins: string[];
    skin: string;
    sound: boolean;
}

const KEY = 'khoi-lantern-save-v1';

function defaults(): SaveShape {
    return { coins: 0, bestScore: 0, bestHeight: 0, levelStars: [], unlocked: 0, ownedSkins: ['red'], skin: 'red', sound: true };
}

export class SaveData {
    private data: SaveShape;
    private readonly storage: KeyValueStorage | null;

    constructor(storage: KeyValueStorage | null) {
        this.storage = storage;
        this.data = defaults();
        try {
            const raw = storage?.getItem(KEY);
            if (raw) this.data = { ...defaults(), ...JSON.parse(raw) };
        } catch {
            this.data = defaults(); // corrupted save: start fresh rather than crash
        }
    }

    get coins(): number { return this.data.coins; }
    get bestScore(): number { return this.data.bestScore; }
    get bestHeight(): number { return this.data.bestHeight; }
    get unlocked(): number { return this.data.unlocked; }
    get skinId(): string { return this.data.skin; }
    get soundOn(): boolean { return this.data.sound; }

    setSound(on: boolean): void {
        this.data.sound = on;
        this.flush();
    }

    get skin(): LanternSkin {
        return SKINS.find((s) => s.id === this.data.skin) ?? SKINS[0];
    }

    starsFor(level: number): number {
        return this.data.levelStars[level] ?? 0;
    }

    owns(skinId: string): boolean {
        return this.data.ownedSkins.includes(skinId);
    }

    addCoins(n: number): void {
        this.data.coins += n;
        this.flush();
    }

    recordLevel(level: number, stars: number, levelCount: number): void {
        this.data.levelStars[level] = Math.max(this.starsFor(level), stars);
        this.data.unlocked = Math.min(levelCount - 1, Math.max(this.data.unlocked, level + 1));
        this.flush();
    }

    /** Returns true when the score is a new best. */
    recordEndless(score: number, height: number): boolean {
        const isBest = score > this.data.bestScore;
        this.data.bestScore = Math.max(this.data.bestScore, score);
        this.data.bestHeight = Math.max(this.data.bestHeight, height);
        this.flush();
        return isBest;
    }

    /** Buy (if needed) and equip a skin. Returns false when the player cannot afford it. */
    selectSkin(skinId: string): boolean {
        const skin = SKINS.find((s) => s.id === skinId);
        if (!skin) return false;
        if (!this.owns(skinId)) {
            if (this.data.coins < skin.price) return false;
            this.data.coins -= skin.price;
            this.data.ownedSkins.push(skinId);
        }
        this.data.skin = skinId;
        this.flush();
        return true;
    }

    private flush(): void {
        try {
            this.storage?.setItem(KEY, JSON.stringify(this.data));
        } catch {
            // Storage can be unavailable (private mode); progress then lasts for this session only.
        }
    }
}
