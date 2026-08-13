#!/usr/bin/env python3
"""Собирает однофайловый taskflow.html: index.html + вшитый gsap.min.js."""
import pathlib
d = pathlib.Path(__file__).parent
src = (d/'index.html').read_text(encoding='utf-8')
gsap = (d/'gsap.min.js').read_text(encoding='utf-8')
m = '<script src="gsap.min.js"></script>'
if m not in src:
    raise SystemExit('в index.html нет тега подключения gsap.min.js')
out = src.replace(m, '<script>/* GSAP 3.15 · standard license */\n' + gsap + '\n</script>')
(d/'taskflow.html').write_text(out, encoding='utf-8')
print(f'taskflow.html собран, {len(out)//1024} КБ')
