# -*- coding: utf-8 -*-
"""程序化生成游戏音频：音效与 BGM。

用法: python scripts/generate_audio.py
输出: public/audio/se/*.wav, public/audio/bgm/*.wav
之后用 ffmpeg 压缩为 mp3。
"""

import math
import os
import random
import struct
import wave

SR = 22050
OUT_SE = os.path.join('public', 'audio', 'se')
OUT_BGM = os.path.join('public', 'audio', 'bgm')


def write_wav(path, samples, sr=SR):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    peak = max(1e-6, max(abs(s) for s in samples))
    gain = 0.89 / peak
    data = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s * gain)) * 32767)
        data += struct.pack('<h', v)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(bytes(data))


def sine(t, f):
    return math.sin(2 * math.pi * f * t)


def square(t, f):
    return 1.0 if math.sin(2 * math.pi * f * t) >= 0 else -1.0


def saw(t, f):
    x = (f * t) % 1.0
    return 2 * x - 1


def triangle(t, f):
    return 2 * abs(2 * ((f * t) % 1.0) - 1) - 1


def decay_env(i, n, power=3.0):
    return (1.0 - i / n) ** power


def attack_decay(i, n, attack_ratio=0.02, power=3.0):
    a = max(1, int(n * attack_ratio))
    if i < a:
        return i / a
    return (1.0 - (i - a) / (n - a)) ** power


def tone(freq, dur, wave_fn=sine, env=decay_env, vib=None):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        f = freq
        if vib:
            f = freq * (1 + vib[0] * math.sin(2 * math.pi * vib[1] * t))
        out.append(wave_fn(t, f) * env(i, n))
    return out


def noise(dur, seed=1, env=decay_env, lowpass=True):
    n = int(SR * dur)
    rnd = random.Random(seed)
    out = []
    prev = 0.0
    for i in range(n):
        v = rnd.uniform(-1, 1)
        if lowpass:
            prev = prev * 0.72 + v * 0.28
            v = prev
        out.append(v * env(i, n))
    return out


def mix(*layers):
    length = max(len(x) for x in layers)
    out = [0.0] * length
    for layer in layers:
        for i, v in enumerate(layer):
            out[i] += v
    return out


def silence(dur):
    return [0.0] * int(SR * dur)


def seq(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


# ---------------- 音效 ----------------

def se_click():
    return mix(tone(1400, 0.05, sine, lambda i, n: decay_env(i, n, 6)),
               noise(0.03, 2, lambda i, n: decay_env(i, n, 8)))


def se_confirm():
    return seq(tone(880, 0.09, triangle, lambda i, n: attack_decay(i, n, 0.03, 3)),
               tone(1318.5, 0.16, triangle, lambda i, n: attack_decay(i, n, 0.03, 3)))


def se_cancel():
    return seq(tone(660, 0.09, triangle, lambda i, n: attack_decay(i, n, 0.03, 3)),
               tone(440, 0.16, triangle, lambda i, n: attack_decay(i, n, 0.03, 3)))


def se_alarm():
    part = seq(tone(880, 0.18, square, lambda i, n: attack_decay(i, n, 0.05, 2)),
               tone(660, 0.18, square, lambda i, n: attack_decay(i, n, 0.05, 2)))
    return seq(part, part, silence(0.05))


def se_shell():
    return mix(tone(70, 0.45, sine, lambda i, n: decay_env(i, n, 2.5)),
               noise(0.35, 7, lambda i, n: decay_env(i, n, 3.5)),
               tone(180, 0.2, saw, lambda i, n: decay_env(i, n, 4)))


def se_torpedo():
    n = int(SR * 0.7)
    out = []
    for i in range(n):
        t = i / SR
        f = 220 + 900 * (i / n)
        env = math.sin(math.pi * (i / n)) ** 1.5
        out.append(sine(t, f) * env * 0.6)
    return mix(out, noise(0.7, 11, lambda i, n: math.sin(math.pi * (i / n)) ** 2, True))


def se_explosion():
    return mix(tone(55, 0.8, sine, lambda i, n: decay_env(i, n, 2)),
               noise(0.75, 13, lambda i, n: decay_env(i, n, 2.2)),
               tone(120, 0.4, saw, lambda i, n: decay_env(i, n, 3)))


def se_plane():
    return mix(tone(120, 0.9, saw, lambda i, n: attack_decay(i, n, 0.15, 1.2), vib=(0.06, 22)),
               noise(0.9, 17, lambda i, n: attack_decay(i, n, 0.15, 1.5)))


def se_complete():
    notes = [523.25, 659.25, 783.99, 1046.5]
    out = []
    for f in notes:
        out.extend(tone(f, 0.13, triangle, lambda i, n: attack_decay(i, n, 0.04, 2.5)))
    return out


def se_levelup():
    notes = [659.25, 830.61, 987.77, 1318.5]
    out = []
    for idx, f in enumerate(notes):
        out.extend(tone(f, 0.16 + idx * 0.02, sine, lambda i, n: attack_decay(i, n, 0.03, 2)))
    return mix(out, seq(*[silence(0.16 + i * 0.02) for i in range(3)]))


def se_get():
    return mix(tone(1318.5, 0.5, sine, lambda i, n: decay_env(i, n, 4)),
               tone(1975.5, 0.4, sine, lambda i, n: decay_env(i, n, 5)),
               tone(2637, 0.3, sine, lambda i, n: decay_env(i, n, 6)))


def se_drop():
    return seq(tone(392, 0.1, triangle, lambda i, n: attack_decay(i, n, 0.03, 2.5)),
               tone(523.25, 0.1, triangle, lambda i, n: attack_decay(i, n, 0.03, 2.5)),
               tone(784, 0.32, triangle, lambda i, n: attack_decay(i, n, 0.03, 2.5)))


# ---------------- BGM ----------------

def note(name):
    table = {
        'C': 261.63, 'D': 293.66, 'E': 329.63, 'F': 349.23, 'G': 392.00,
        'A': 440.00, 'B': 493.88
    }
    return table[name]


def bgm_port():
    """母港：舒缓的三拍氛围，Am - F - C - G 循环。"""
    chords = [['A', 'C', 'E'], ['F', 'A', 'C'], ['C', 'E', 'G'], ['G', 'B', 'D']]
    out = [0.0] * int(SR * 32)
    bar = 8.0
    for ci, chord in enumerate(chords):
        start = int(SR * ci * bar)
        # 低音持续
        for i in range(int(SR * bar)):
            t = i / SR
            env = attack_decay(i, int(SR * bar), 0.08, 0.6) * 0.35
            out[start + i] += triangle(t, note(chord[0]) / 2) * env
        # 琶音
        for k, nm in enumerate(chord):
            f = note(nm)
            for rep in range(4):
                st = start + int(SR * (rep * 2.0 + k * 0.22))
                seg = tone(f, 0.9, sine, lambda i, n: attack_decay(i, n, 0.06, 3))
                for i, v in enumerate(seg):
                    if st + i < len(out):
                        out[st + i] += v * 0.22
    return out


def bgm_battle():
    """战斗：低音推进 + 上行紧张音型。"""
    out = [0.0] * int(SR * 32)
    bass_line = ['A', 'A', 'F', 'G']
    for ci, nm in enumerate(bass_line):
        start = int(SR * ci * 8.0)
        for i in range(int(SR * 8.0)):
            t = i / SR
            env = attack_decay(i, int(SR * 8.0), 0.04, 0.8) * 0.4
            out[start + i] += saw(t, note(nm) / 2) * env
        # 紧张的高音点缀
        for rep in range(8):
            st = start + int(SR * rep)
            seg = tone(note(nm) * 2, 0.5, square, lambda i, n: decay_env(i, n, 3))
            for i, v in enumerate(seg):
                if st + i < len(out):
                    out[st + i] += v * 0.12
    return out


def bgm_victory():
    """胜利：明亮的大调琶音收束。"""
    chords = [['C', 'E', 'G'], ['F', 'A', 'C'], ['G', 'B', 'D'], ['C', 'E', 'G']]
    out = [0.0] * int(SR * 16)
    for ci, chord in enumerate(chords):
        start = int(SR * ci * 4.0)
        for k, nm in enumerate(chord):
            f = note(nm)
            for rep in range(2):
                st = start + int(SR * (rep * 2.0 + k * 0.18))
                seg = tone(f, 1.2, triangle, lambda i, n: attack_decay(i, n, 0.05, 2))
                for i, v in enumerate(seg):
                    if st + i < len(out):
                        out[st + i] += v * 0.2
        for i in range(int(SR * 4.0)):
            t = i / SR
            env = attack_decay(i, int(SR * 4.0), 0.05, 0.7) * 0.3
            out[start + i] += triangle(t, note(chord[0]) / 2) * env
    return out


def main():
    se_map = {
        'click': se_click, 'confirm': se_confirm, 'cancel': se_cancel,
        'alarm': se_alarm, 'shell': se_shell, 'torpedo': se_torpedo,
        'explosion': se_explosion, 'plane': se_plane, 'complete': se_complete,
        'levelup': se_levelup, 'get': se_get, 'drop': se_drop
    }
    for name, fn in se_map.items():
        samples = fn()
        path = os.path.join(OUT_SE, name + '.wav')
        write_wav(path, samples)
        print('音效 %-10s %.2fs' % (name, len(samples) / SR))

    for name, fn in [('port', bgm_port), ('battle', bgm_battle), ('victory', bgm_victory)]:
        samples = fn()
        path = os.path.join(OUT_BGM, name + '.wav')
        write_wav(path, samples)
        print('BGM  %-10s %.1fs' % (name, len(samples) / SR))


if __name__ == '__main__':
    main()
