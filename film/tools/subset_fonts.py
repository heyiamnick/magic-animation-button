#!/usr/bin/env python3
"""Subset Inter (Display Black + SemiBold) to the glyphs the film uses and emit build/fonts.js.
requires: pip install fonttools ; Inter OTFs (Debian/Ubuntu package fonts-inter)"""
import base64, os
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, '..', 'build')
SRC = '/usr/share/fonts/opentype/inter'
CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;/-–—′'·×+−=()%°→←↑↓#"
os.makedirs(BUILD, exist_ok=True)
out = {}
for key, name in [('display', 'InterDisplay-Black'), ('text', 'Inter-SemiBold')]:
    opts = subset.Options(); opts.flavor = 'woff'; opts.layout_features = ['kern', 'tnum', 'case']; opts.name_IDs = ['*']
    f = TTFont(os.path.join(SRC, name + '.otf'))
    s = subset.Subsetter(opts); s.populate(text=CHARS); s.subset(f)
    f.flavor = 'woff'
    path = os.path.join(BUILD, name + '.subset.woff'); f.save(path)
    out[key] = base64.b64encode(open(path, 'rb').read()).decode()
with open(os.path.join(BUILD, 'fonts.js'), 'w') as fh:
    fh.write('window.FONT_DATA={display:"%s",text:"%s"};\n' % (out['display'], out['text']))
print('wrote build/fonts.js')
