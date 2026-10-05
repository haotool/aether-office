"""Audits the animals as they sit at an AETHER desk: where the body goes through the furniture, and how smooth each clip is.

    blender --background --factory-startup --python tools/blender/audit_animals.py -- [--species fox,cat] [--samples 16] [--json out.json]

Penetration: every clip that seats the animal is sampled through its loop; every vertex of the animal (skin, ears, tail,
props) is tested against boxes standing for the desk's chair and slab, in the animal's own frame. The furniture comes
from packages/office-scene/src/desk-seating.json, the file the scene builds the desk from (desk frame x -> -x,
z - sitter.z -> y, y -> z). A vertex inside a box by more than TOLERANCE is clipping; the report gives the deepest and
how many vertices.

Smoothness: for every clip, the largest jump of any bone between two consecutive samples (an unexpected pop), and the
mismatch between the pose at the start and at the end of a looping clip (a visible hitch at the seam).
"""
import sys
import json
import argparse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import numpy as np
import build_animals as build
import animal_clips as clips_module
from animal_profiles import PROFILES

SEATING = json.loads((Path(__file__).resolve().parents[2] / 'packages/office-scene/src/desk-seating.json').read_text())
SITTER_Z = SEATING['sitter']['z']


def box_of(item):
    (sx, sy, sz), (ax, ay, az) = item['size'], item['at']
    return ((-(ax + sx / 2), az - SITTER_Z - sz / 2, ay - sy / 2), (-(ax - sx / 2), az - SITTER_Z + sz / 2, ay + sy / 2))


BOXES = {name: box_of(SEATING[key]) for name, key in (('chair_back', 'back'), ('seat', 'seat'), ('cushion', 'cushion'), ('desk_slab', 'slab'), ('desk_bar', 'bar'))}
_pedestal = SEATING['pedestal']
PEDESTAL = {'centre': (-_pedestal['at'][0], _pedestal['at'][2] - SITTER_Z), 'radius': _pedestal['radius'], 'top': _pedestal['height']}
TOLERANCE = .025  # a seated animal sinks into its cushion a little on purpose; more than this shows
# sit_down and stand_up pass through standing at the chair and no state plays them; they are not audited as seated
NOT_SEATED = {'idle', 'walk', 'turn', 'haunt', 'hop', 'sit_down', 'stand_up'}
WHERE = {}


def depth_in_box(points, lo, hi, name=None):
    lo, hi = np.array(lo), np.array(hi)
    inside = np.all((points > lo) & (points < hi), axis=1)
    if not inside.any():
        return 0.0, 0
    p = points[inside]
    d = np.minimum(p - lo, hi - p).min(axis=1)
    if name is not None and (d > TOLERANCE).any():
        deep = p[d > TOLERANCE]
        WHERE[name] = [round(float(v), 2) for v in (*deep.mean(axis=0), *deep.min(axis=0), *deep.max(axis=0))]
    return float(d.max()), int((d > TOLERANCE).sum())


def depth_in_pedestal(points):
    cx, cy = PEDESTAL['centre']
    r = np.hypot(points[:, 0] - cx, points[:, 1] - cy)
    inside = (r < PEDESTAL['radius']) & (points[:, 2] < PEDESTAL['top'])
    if not inside.any():
        return 0.0, 0
    d = PEDESTAL['radius'] - r[inside]
    return float(d.max()), int((d > TOLERANCE).sum())


def vertices(mesh):
    bpy.context.view_layer.update()
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    out = np.empty(len(data.vertices) * 3, dtype=np.float32)
    data.vertices.foreach_get('co', out)
    evaluated.to_mesh_clear()
    return out.reshape(-1, 3)


def pose_vector(rig):
    return np.concatenate([np.array([*pb.location, *pb.rotation_quaternion]) for pb in rig.pose.bones])


def audit(species, samples):
    mesh, rig, _ = build.assemble(species)
    table = clips_module.clips_for(species)
    report = {}
    for name, (frames, fn) in table.items():
        previous = first = None
        deepest, counts = {}, {}
        butt, hands = 9.0, 9.0
        worst_jump = 0.0
        for i in range(samples + 1):
            clips_module.pose_rig(rig, fn(i / samples))
            vec = pose_vector(rig)
            first = vec if first is None else first
            if previous is not None:
                worst_jump = max(worst_jump, float(np.abs(vec - previous).max()))
            previous = vec
            if name in NOT_SEATED:
                continue
            pts = vertices(mesh)
            seat = pts[(np.abs(pts[:, 0]) < .26) & (pts[:, 1] > -.2) & (pts[:, 1] < .28) & (pts[:, 2] < .7)]
            over = pts[(pts[:, 1] < -.42) & (pts[:, 2] > .7) & (pts[:, 2] < 1.0) & (np.abs(pts[:, 0]) < .5)]
            butt = min(butt, float(seat[:, 2].min()) if len(seat) else 9.0)
            hands = min(hands, float(over[:, 2].min()) if len(over) else 9.0)
            for box, (lo, hi) in BOXES.items():
                d, n = depth_in_box(pts, lo, hi, f'{name}:{box}')
                deepest[box] = max(deepest.get(box, 0.0), d)
                counts[box] = max(counts.get(box, 0), n)
            d, n = depth_in_pedestal(pts)
            deepest['pedestal'] = max(deepest.get('pedestal', 0.0), d)
            counts['pedestal'] = max(counts.get('pedestal', 0), n)
        report[name] = {
            'where': {k: v for k, v in WHERE.items() if k.startswith(name + ':')},
            'clip_frames': frames,
            'deepest_cm': {k: round(v * 100, 1) for k, v in deepest.items() if v > 0},
            'vertices_over_tolerance': {k: v for k, v in counts.items() if v},
            'lowest_seat_z': round(butt, 3),
            'lowest_over_desk_z': round(hands, 3),
            'largest_step': round(worst_jump, 3),
            'seam_mismatch': round(float(np.abs(previous - first).max()), 4),
        }
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--species', default=','.join(PROFILES))
    parser.add_argument('--samples', type=int, default=16)
    parser.add_argument('--json', default='')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    result = {}
    for species in options.species.split(','):
        result[species] = audit(species, options.samples)
        bad = {n: r for n, r in result[species].items() if r['vertices_over_tolerance']}
        print(f'AUDIT {species}: {len(bad)} clips clip the furniture', flush=True)
        for n, r in bad.items():
            print('  ', n, r['deepest_cm'], r['vertices_over_tolerance'], flush=True)
    if options.json:
        Path(options.json).write_text(json.dumps(result, indent=1))
