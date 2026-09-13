# -*- coding: utf-8 -*-
"""审计：ENEMY_FLEETS 中在现役代码里零引用的编成键（V0.304 交付评审引入）

引用判定两层：
  ① 结构引用 —— MAPS / HISTORY_BATTLES 对象值里的 enemy / waves 键；
  ② 代码引用 —— scripts/*.js 与 public/js/**/*.js 的文本匹配，
     但必须剔除两类假阳性：a) ENEMY_FLEETS / enemies 的**键定义行**本身（`F04: {` 会被当成引用）；
     b) 注释（交付报告曾因把定义行当引用而漏报：实测 14 个、初稿误记 9 个）。

用法: python scripts/audit_unused_fleets.py   → 输出"零引用(N): 键, 键, ..."
"""
import os, re, sys, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def strip_code(txt):
    txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)          # 块注释
    txt = re.sub(r'^\s*//.*$', '', txt, flags=re.M)          # 行注释
    return txt

def strip_fleet_key_defs(txt):
    """把 `F04: {` 这类键**定义行**改写为 __DEF__，防止定义被误计为引用"""
    return re.sub(r'(^|\n)(\s*)(F\d+[a-z]?)\s*:\s*\{', r'\1\2__DEF__', txt)

refs = set()
def add_hits(txt):
    for m in re.finditer(r'\bF\d+[a-z]?\b', txt):
        refs.add(m.group(0))

# ① 结构引用：maps.js / history.js（去掉键定义行后扫描）
for rel in [os.path.join('public', 'js', 'data', 'maps.js'),
            os.path.join('public', 'js', 'data', 'history.js')]:
    txt = io.open(os.path.join(ROOT, rel), encoding='utf-8-sig', errors='replace').read()
    add_hits(strip_code(strip_fleet_key_defs(txt)))

# ② 代码引用：scripts/*.js + public/js/**/*.js
for base in ['scripts', os.path.join('public', 'js')]:
    for dp, _, fns in os.walk(os.path.join(ROOT, base)):
        for fn in fns:
            if not fn.endswith('.js'):
                continue
            p = os.path.join(dp, fn)
            txt = io.open(p, encoding='utf-8-sig', errors='replace').read()
            if fn == 'maps.js':
                txt = strip_fleet_key_defs(txt)
            add_hits(strip_code(txt))

# 与 ENEMY_FLEETS 实际键集做差
maps_txt = io.open(os.path.join(ROOT, 'public', 'js', 'data', 'maps.js'), encoding='utf-8-sig', errors='replace').read()
all_keys = sorted(set(re.findall(r'^\s{2}(F\d+[a-z]?)\s*:\s*\{', maps_txt, flags=re.M)))
unused = [k for k in all_keys if k not in refs]
print('ENEMY_FLEETS 总数: %d' % len(all_keys))
print('零引用(%d): %s' % (len(unused), ', '.join(unused) if unused else '无'))
sys.exit(0)
