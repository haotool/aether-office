"""AETHER office animal skeleton. Metres; Z-up, facing -Y. The body bones keep their original joints so the seated
pose still meets the desk and chair; the face, tail and prop bones are additions."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import aokit as ao  # Upstream MIT geometry/rig helpers, attribution retained.
from mathutils import Vector

PROP_REST = {'cup': (0.0, 0.0, .7), 'phone': (.05, 0.0, .8), 'pad': (-.04, 0.0, .84)}
FACE_BONES = ['eye', 'joy', 'lid', 'brow']
MOUTH_BONES = ['smile', 'open', 'oh', 'flat']


TAIL_BONES = 5  # a tail bends along its length; five joints make a wave look like one


def tail_joints(path):
    """TAIL_BONES + 1 points along the tail's centreline, root to tip, one pair per tail bone."""
    points = [Vector(p) for p, _ in path]
    if len(points) < 3:
        root = points[0]
        return [root + Vector((0, .3 * i / TAIL_BONES, .03 * i / TAIL_BONES)) for i in range(TAIL_BONES + 1)]
    out = []
    for f in (i / TAIL_BONES for i in range(TAIL_BONES + 1)):
        scaled = f * (len(points) - 1)
        i = min(int(scaled), len(points) - 2)
        out.append(points[i].lerp(points[i + 1], scaled - i))
    return out


def skeleton(lay, tail):
    """The armature. `lay` is the face layout (animal_geometry.layout), `tail` the tail's centreline."""
    ex, ey, ez = lay['eye']
    mx, my, mz = lay['mouth']
    bones = [
        ('root', (0, 0, 0), (0, 0, .15), None, True),
        ('pelvis', (0, 0, .56), (0, 0, .7), 'root', True),
        ('chest', (0, 0, .7), (0, 0, .98), 'pelvis', True),
        ('neck', (0, 0, .98), (0, 0, 1.065), 'chest', True),
        ('head', (0, 0, 1.065), (0, 0, 1.29), 'neck', True),
    ]
    joints = tail_joints(tail)
    for i in range(TAIL_BONES):
        bones.append((f'tail_{i + 1}', tuple(joints[i]), tuple(joints[i + 1]), 'pelvis' if i == 0 else f'tail_{i}', True))
    for side, sign in [('L', 1), ('R', -1)]:
        bones += [
            (f'upper_arm_{side}', (sign * .19, 0, .94), (sign * .275, -.02, .735), 'chest', True),
            (f'forearm_{side}', (sign * .275, -.02, .735), (sign * .298, -.058, .565), f'upper_arm_{side}', True),
            (f'hand_{side}', (sign * .298, -.058, .565), (sign * .302, -.115, .49), f'forearm_{side}', True),
            (f'thigh_{side}', (sign * .095, 0, .56), (sign * .095, -.01, .31), 'pelvis', True),
            (f'shin_{side}', (sign * .095, -.01, .31), (sign * .095, 0, .075), f'thigh_{side}', True),
            (f'foot_{side}', (sign * .095, 0, .075), (sign * .095, -.13, .06), f'shin_{side}', True),
            (f'ear_{side}', (sign * .15, 0, 1.28), (sign * .16, 0, 1.44), 'head', True),
        ]
        for name in ('eye', 'joy', 'lid'):
            bones.append((f'{name}_{side}', (sign * ex, ey, ez - .015), (sign * ex, ey, ez + .015), 'head', True))
        bones.append((f'brow_{side}', (sign * ex, ey, ez + .09), (sign * ex, ey, ez + .115), 'head', True))
    for name in MOUTH_BONES:
        bones.append((name, (0, my, mz - .01), (0, my, mz + .01), 'head', True))
    for name, at in PROP_REST.items():
        bones.append((f'prop_{name}', at, (at[0], at[1], at[2] + .05), 'chest', True))
    rig = ao.armature('AetherRig', bones)
    for side, sign in [('L', 1), ('R', -1)]:
        ao.socket(rig, f'hand_socket_{side}', f'hand_{side}', (sign * .30, -.1, .5))
    ao.socket(rig, 'head_socket', 'head', (0, 0, 1.40))
    ao.socket(rig, 'chest_socket', 'chest', (0, -.155, .91))
    return rig
