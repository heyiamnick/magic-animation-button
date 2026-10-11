#!/usr/bin/env python3
"""Verify the delivered media: duration, frame count, resolution, frame rate, streams and A/V alignment.
usage: verify_final.py final.mp4 soundtrack.wav [duration_s=75] [max_mb]"""
import sys, json, subprocess

def probe(path, extra=()):
    r = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', *extra, path], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)

video, wav = sys.argv[1], sys.argv[2]
DUR = float(sys.argv[3]) if len(sys.argv) > 3 else 75.0
MAX_MB = float(sys.argv[4]) if len(sys.argv) > 4 else None
NF = int(round(DUR * 60))
p = probe(video, ['-count_frames'])
ok = True
def check(name, cond, val):
    global ok
    ok &= bool(cond)
    print(f"  [{'OK' if cond else 'FAIL'}] {name}: {val}")

v = next(s for s in p['streams'] if s['codec_type'] == 'video')
a = next((s for s in p['streams'] if s['codec_type'] == 'audio'), None)
print(video)
check('video codec', v['codec_name'] == 'h264', f"{v['codec_name']} ({v.get('profile')})")
check('resolution', (v['width'], v['height']) == (1920, 1080), f"{v['width']}x{v['height']}")
check('frame rate', v['r_frame_rate'] == '60/1' and v['avg_frame_rate'] == '60/1', f"r={v['r_frame_rate']} avg={v['avg_frame_rate']}")
check('frame count', int(v['nb_read_frames']) == NF, v['nb_read_frames'])
check('video duration', abs(float(v['duration']) - DUR) < 1e-3, v['duration'])
check('pixel format', v['pix_fmt'] == 'yuv420p', v['pix_fmt'])
check('audio present', a is not None, a and f"{a['codec_name']} {a['sample_rate']} Hz {a['channels']} ch")
if a:
    check('audio sample rate', a['sample_rate'] == '48000', a['sample_rate'])
    check('audio codec AAC-LC stereo', a['codec_name'] == 'aac' and a.get('profile') == 'LC' and a['channels'] == 2, f"{a['codec_name']} {a.get('profile')} {a['channels']} ch {int(a.get('bit_rate', 0)) // 1000} kb/s")
    check('audio duration', abs(float(a['duration']) - DUR) < 0.03, a['duration'])
    check('A/V start aligned', abs(float(a.get('start_time', 0)) - float(v.get('start_time', 0))) < 1e-3, f"v={v.get('start_time')} a={a.get('start_time')}")
check('container duration', abs(float(p['format']['duration']) - DUR) < 0.03, p['format']['duration'])
size = int(p['format']['size'])
print(f"  size: {size / 1e6:.1f} MB ({size / 2**20:.1f} MiB), bitrate {int(p['format']['bit_rate']) / 1e6:.2f} Mb/s")
if MAX_MB: check(f'size under {MAX_MB} MiB (GitHub hard limit is 100 MiB per file)', size < MAX_MB * 2**20, f'{size / 2**20:.1f} MiB')
check('colour tags', v.get('color_space') == 'bt709' and v.get('color_primaries') == 'bt709' and v.get('color_transfer') == 'bt709', f"{v.get('color_space')}/{v.get('color_primaries')}/{v.get('color_transfer')}")
fmt = probe(video, ['-show_entries', 'format_tags'])
r = subprocess.run(['ffprobe', '-v', 'trace', '-i', video], capture_output=True, text=True).stderr
moov, mdat = r.find("type:'moov'"), r.find("type:'mdat'")
check('fast start (moov before mdat)', 0 <= moov < mdat, f'moov@{moov} mdat@{mdat}')
w = probe(wav)['streams'][0]
print(wav)
check('wav format', w['codec_name'] == 'pcm_s16le' and w['sample_rate'] == '48000' and w['channels'] == 2, f"{w['codec_name']} {w['sample_rate']} Hz {w['channels']} ch")
check('wav duration', abs(float(w['duration']) - DUR) < 1e-6, w['duration'])
print('ALL CHECKS PASSED' if ok else 'SOME CHECKS FAILED')
sys.exit(0 if ok else 1)
