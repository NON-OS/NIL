"""Draws the Nil wordmark from Geist and prints it as SVG path data.

The official NØNOS letters are Geist at weight 425, so Nil uses the same cut, the same cap
height and the same gap after the Ø mark. The letters become outlines here, which means the
wordmark never depends on a font being installed and is never retyped.

    pip install fonttools brotli
    python scripts/brand/nil-wordmark.py path/to/geist-latin-wght-normal.woff2
"""
import json
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

WORD = 'Nil'
WEIGHT = 425
# where the letters sit in the official logo's 1428 x 500 box
LEFT, BASELINE, CAP = 532, 349, 191

font = instantiateVariableFont(TTFont(sys.argv[1]), {'wght': WEIGHT})
glyf, hmtx, cmap = font['glyf'], font['hmtx'], font.getBestCmap()
scale = CAP / font['OS/2'].sCapHeight
names = [cmap[ord(ch)] for ch in WORD]
for name in names:
    glyf[name].recalcBounds(glyf)

pen = SVGPathPen(font.getGlyphSet(), ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
pen_x = LEFT / scale - glyf[names[0]].xMin  # the first letter's ink starts exactly at LEFT
for name in names:
    font.getGlyphSet()[name].draw(TransformPen(pen, (scale, 0, 0, -scale, pen_x * scale, BASELINE)))
    right = (pen_x + glyf[name].xMax) * scale
    pen_x += hmtx[name][0]

print(json.dumps({'width': round(right, 2), 'd': pen.getCommands()}))
