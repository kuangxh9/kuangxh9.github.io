"""MIDI -> {notes:[[start_s, dur_s, midi, vel01]], bars:[start_s...], range:[lo,hi]}.
usage: python -I midi2json.py in.mid out.json [max_seconds]"""
import sys, json
import mido
src, dst = sys.argv[1], sys.argv[2]
limit = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
mf = mido.MidiFile(src)
tpb = mf.ticks_per_beat
# absolute-tick events across all tracks
events = []
for ti, tr in enumerate(mf.tracks):
    t = 0
    for msg in tr:
        t += msg.time
        events.append((t, ti, msg))
events.sort(key=lambda e: e[0])
tempos = [(0, 500000)]; sigs = [(0, 4, 4)]
for t, ti, msg in events:
    if msg.type == 'set_tempo': tempos.append((t, msg.tempo))
    if msg.type == 'time_signature': sigs.append((t, msg.numerator, msg.denominator))
# a file's own values at tick 0 replace the defaults
if any(t == 0 for t, *_ in tempos[1:]): tempos = tempos[1:]
if any(t == 0 for t, *_ in sigs[1:]): sigs = sigs[1:]
tempos.sort(key=lambda x: x[0]); sigs.sort(key=lambda x: x[0])
# tick -> seconds through the tempo map
def secs(tick):
    s = 0.0; last_t, last_tempo = 0, tempos[0][1]
    for t, tempo in tempos[1:]:
        if t >= tick: break
        s += (t - last_t) * last_tempo / 1e6 / tpb
        last_t, last_tempo = t, tempo
    return s + (tick - last_t) * last_tempo / 1e6 / tpb
on = {}; notes = []
for t, ti, msg in events:
    if msg.type == 'note_on' and msg.velocity > 0:
        on.setdefault((ti, msg.channel, msg.note), []).append((t, msg.velocity))
    elif msg.type in ('note_off', 'note_on'):
        k = (ti, msg.channel, msg.note)
        if on.get(k):
            t0, v = on[k].pop(0)
            a, b = secs(t0), secs(t)
            if a <= limit: notes.append([round(a, 3), round(max(0.05, b - a), 3), msg.note, round(v / 127, 2)])
notes.sort()
end_tick = max(t for t, _, _ in events)
# bar lines from the time signatures
bars = []; tick = 0; si = 0
while tick <= end_tick:
    while si + 1 < len(sigs) and sigs[si + 1][0] <= tick: si += 1
    _, num, den = sigs[si]
    s = secs(tick)
    if s > limit: break
    bars.append(round(s, 3))
    tick += int(tpb * 4 * num / den)
pitches = [n[2] for n in notes]
out = {'notes': notes, 'bars': bars, 'range': [min(pitches), max(pitches)]}
json.dump(out, open(dst, 'w'), separators=(',', ':'))
print(src.split('/')[-1], 'notes', len(notes), 'bars', len(bars), 'range', out['range'], 'dur', round(max(n[0] + n[1] for n in notes), 1), 's',
      'sigs', [(s[1], s[2]) for s in sigs][:4], 'tempo', round(60e6 / tempos[-1][1], 1) if tempos else None)
