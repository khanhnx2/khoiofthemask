"""
Generates the game's original chiptune music and sound effects.

Usage:  python tools/audio/generate-audio.py
Needs:  numpy, and ffmpeg on PATH (WAV is converted to MP3, which every platform plays).
Output: assets/resources/audio/*.mp3  (loaded at runtime with resources.load('audio/<name>'))
"""
import os
import shutil
import subprocess
import tempfile
import wave

import numpy as np

SR = 22050
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'assets', 'resources', 'audio')

NOTE_INDEX = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}


def freq(note: str) -> float:
    name, octave = note[:-1], int(note[-1])
    midi = 12 * (octave + 1) + NOTE_INDEX[name]
    return 440.0 * 2 ** ((midi - 69) / 12)


# ------------------------------------------------------------------ oscillators

def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def square(f, t, duty=0.5):
    phase = (np.cumsum(np.broadcast_to(f, t.shape)) / SR) % 1.0
    return np.where(phase < duty, 1.0, -1.0)


def triangle(f, t):
    phase = (np.cumsum(np.broadcast_to(f, t.shape)) / SR) % 1.0
    return 4 * np.abs(phase - 0.5) - 1


def sine(f, t):
    return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape)) / SR)


def noise(n, seed=0):
    return np.random.default_rng(seed).uniform(-1, 1, n)


def envelope(n, attack=0.005, release=0.04):
    env = np.ones(n)
    a = min(n, int(attack * SR))
    r = min(n - a, int(release * SR))
    if a:
        env[:a] = np.linspace(0, 1, a)
    if r:
        env[n - r:] = np.linspace(1, 0, r)
    return env


def place(track, start_sec, sound):
    i = int(start_sec * SR)
    end = min(len(track), i + len(sound))
    track[i:end] += sound[: end - i]


# ------------------------------------------------------------------ music

def render_voice(track, notes, step, wave_fn, volume, release=0.05, **kw):
    """notes: one token per grid step: a note name, '-' to hold, '.' for silence."""
    i = 0
    while i < len(notes):
        tok = notes[i]
        if tok in ('-', '.'):
            i += 1
            continue
        length = 1
        while i + length < len(notes) and notes[i + length] == '-':
            length += 1
        dur = length * step * 0.95
        t = t_axis(dur)
        f = freq(tok)
        # A little vibrato on long notes makes the lead sing.
        vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * (t > 0.18)
        sound = wave_fn(f * vib, t, **kw) * envelope(len(t), release=release) * volume
        place(track, i * step, sound)
        i += length


def drums(track, bars, beat, kick_vol=0.55, snare_vol=0.22, hat_vol=0.07, seed=1):
    for bar in range(bars):
        for b in range(4):
            start = (bar * 4 + b) * beat
            if b in (0, 2):
                t = t_axis(0.18)
                place(track, start, sine(150 * np.exp(-t * 18) + 45, t) * np.exp(-t * 22) * kick_vol)
            else:
                n = int(0.12 * SR)
                place(track, start, noise(n, seed + bar * 4 + b) * np.exp(-np.arange(n) / SR * 30) * snare_vol)
            for half in (0, 0.5):
                n = int(0.03 * SR)
                place(track, start + half * beat, noise(n, 99 + bar * 8 + b * 2) * np.linspace(1, 0, n) * hat_vol)


def bars_to_steps(bars):
    out = []
    for bar in bars:
        out.extend(bar.split())
    return out


CHORDS = {
    'Am': ['A', 'C', 'E'], 'F': ['F', 'A', 'C'], 'G': ['G', 'B', 'D'],
    'E': ['E', 'G#', 'B'], 'Em': ['E', 'G', 'B'], 'C': ['C', 'E', 'G'],
}


def bass_line(chords, octave):
    steps = []
    for ch in chords:
        root = CHORDS[ch][0] + str(octave)
        fifth = CHORDS[ch][2] + str(octave if CHORDS[ch][2] > CHORDS[ch][0] else octave + 1)
        steps += [root, '-', root, '.', fifth, '-', root, '.']
    return steps


def arp_line(chords, octave, per_bar=16):
    steps = []
    for ch in chords:
        tones = [n + str(octave) for n in CHORDS[ch]] + [CHORDS[ch][0] + str(octave + 1)]
        pattern = [0, 1, 2, 3, 2, 1] * 3
        steps += [tones[pattern[k]] for k in range(per_bar)]
    return steps


def song_game():
    """'Hang Sâu' – driving 128 BPM loop in A minor pentatonic."""
    bpm = 128
    beat = 60 / bpm
    eighth = beat / 2
    lead = bars_to_steps([
        'A4 . C5 D5 E5 - D5 C5', 'D5 - C5 A4 G4 - A4 .', 'C5 . D5 E5 G5 - E5 D5', 'E5 - D5 C5 D5 - - .',
        'A4 . C5 D5 E5 - G5 A5', 'G5 - E5 D5 E5 - D5 C5', 'D5 . C5 A4 G4 - E4 G4', 'A4 - - - . . . .',
        'A5 . G5 E5 D5 - E5 G5', 'A5 - G5 E5 D5 - C5 .', 'C5 . D5 E5 G5 - A5 G5', 'E5 - - D5 E5 - - .',
        'A5 . G5 A5 C6 - A5 G5', 'E5 - G5 E5 D5 - C5 D5', 'E5 . D5 C5 A4 - G4 E4', 'A4 - - - - - . .',
    ])
    chords = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'Am', 'Am', 'F', 'G', 'Am', 'C', 'G', 'Am']
    bars = len(chords)
    track = np.zeros(int(bars * 4 * beat * SR))
    render_voice(track, lead, eighth, square, 0.16, duty=0.25)
    render_voice(track, bass_line(chords, 2), eighth, triangle, 0.42)
    render_voice(track, arp_line(chords, 4), eighth / 2, square, 0.05, release=0.02, duty=0.125)
    drums(track, bars, beat)
    return track


def song_menu():
    """'Đèn Lồng Ngủ' – calm 90 BPM loop for the menus."""
    bpm = 90
    beat = 60 / bpm
    eighth = beat / 2
    phrase = [
        'E5 - - - D5 - C5 -', 'D5 - - - - - . .', 'C5 - - - A4 - G4 -', 'A4 - - - - - . .',
        'E5 - - - G5 - A5 -', 'G5 - - - E5 - - -', 'D5 - - - C5 - D5 -', 'E5 - - - - - . .',
    ]
    ending = phrase[:7] + ['A4 - - - - - . .']
    lead = bars_to_steps(phrase + ending)
    chords = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Em', 'Am', 'F', 'C', 'G', 'Am', 'F', 'Em', 'Am']
    bars = len(chords)
    track = np.zeros(int(bars * 4 * beat * SR))
    render_voice(track, lead, eighth, triangle, 0.32, release=0.2)
    render_voice(track, lead, eighth, square, 0.035, release=0.2, duty=0.5)  # soft shimmer doubling
    render_voice(track, arp_line(chords, 4, per_bar=8), eighth, triangle, 0.12, release=0.1)
    render_voice(track, [s if s in ('-', '.') else s for s in bass_line(chords, 2)], eighth, sine, 0.35, release=0.1)
    return track


# ------------------------------------------------------------------ sound effects

def sweep(f0, f1, dur, fn=square, vol=0.5, **kw):
    t = t_axis(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    return fn(f, t, **kw) * envelope(len(t), release=dur * 0.5) * vol


def seq(notes, dur, fn=square, vol=0.4, **kw):
    out = []
    for n in notes:
        t = t_axis(dur)
        out.append(fn(freq(n), t, **kw) * envelope(len(t), release=dur * 0.4) * vol)
    return np.concatenate(out)


def sfx():
    t = t_axis(0.16)
    slide = noise(len(t), 7) * np.sin(np.pi * t / t[-1]) * 0.22
    # Crude low-pass so the whoosh sounds airy instead of hissy.
    slide = np.convolve(slide, np.ones(6) / 6, mode='same')
    death_t = t_axis(0.7)
    death = sweep(620, 70, 0.7, square, 0.45, duty=0.5) + noise(len(death_t), 3) * np.exp(-death_t * 6) * 0.25
    return {
        'sfx-slide': slide,
        'sfx-firefly': sweep(1300, 1900, 0.06, sine, 0.35),
        'sfx-coin': seq(['B5', 'E6'], 0.07, square, 0.3, duty=0.5),
        'sfx-star': seq(['C6', 'E6', 'G6', 'C7'], 0.07, square, 0.28, duty=0.25),
        'sfx-power': sweep(300, 1400, 0.32, square, 0.3, duty=0.25),
        'sfx-shield': sweep(1400, 380, 0.3, triangle, 0.5),
        'sfx-death': death,
        'sfx-win': seq(['A5', 'C6', 'E6', 'A6', 'E6', 'A6'], 0.09, square, 0.3, duty=0.25),
        'sfx-click': seq(['E6'], 0.035, square, 0.25, duty=0.5),
    }


# ------------------------------------------------------------------ output

def write_mp3(name, samples, tmp):
    peak = np.max(np.abs(samples)) or 1.0
    data = np.tanh(samples / peak * 1.2) * 0.85  # gentle limiter
    pcm = (data * 32767).astype(np.int16)
    wav_path = os.path.join(tmp, name + '.wav')
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    mp3_path = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-codec:a', 'libmp3lame', '-b:a', '96k', mp3_path],
                   check=True)
    print(f'{name}.mp3  {len(samples) / SR:5.1f}s  {os.path.getsize(mp3_path) // 1024} KB')


def main():
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg not found on PATH')
    os.makedirs(OUT, exist_ok=True)
    tracks = {'music-game': song_game(), 'music-menu': song_menu(), **sfx()}
    with tempfile.TemporaryDirectory() as tmp:
        for name, samples in tracks.items():
            write_mp3(name, samples, tmp)


if __name__ == '__main__':
    main()
