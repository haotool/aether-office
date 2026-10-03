"""AETHER in-place humanoid animation contract. Metres; Z-up, facing -Y."""
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'blender' / 'scripts'))
import aokit as ao  # Upstream MIT geometry/rig helpers, attribution retained.


def skeleton():
    bones = [
        ('root', (0, 0, 0), (0, 0, .15), None, True),
        ('pelvis', (0, 0, .56), (0, 0, .7), 'root', True),
        ('chest', (0, 0, .7), (0, 0, .98), 'pelvis', True),
        ('neck', (0, 0, .98), (0, 0, 1.065), 'chest', True),
        ('head', (0, 0, 1.065), (0, 0, 1.29), 'neck', True),
        ('tail', (0, .09, .59), (0, .43, .62), 'pelvis', True),
    ]
    for side, sign in [('L', 1), ('R', -1)]:
        bones += [
            (f'upper_arm_{side}', (sign * .19, 0, .94), (sign * .265, -.015, .77), 'chest', True),
            (f'forearm_{side}', (sign * .265, -.015, .77), (sign * .29, -.045, .62), f'upper_arm_{side}', True),
            (f'hand_{side}', (sign * .29, -.045, .62), (sign * .29, -.10, .57), f'forearm_{side}', True),
            (f'thigh_{side}', (sign * .095, 0, .56), (sign * .095, -.01, .31), 'pelvis', True),
            (f'shin_{side}', (sign * .095, -.01, .31), (sign * .095, 0, .075), f'thigh_{side}', True),
            (f'foot_{side}', (sign * .095, 0, .075), (sign * .095, -.13, .06), f'shin_{side}', True),
            (f'ear_{side}', (sign * .14, 0, 1.28), (sign * .16, 0, 1.44), 'head', True),
        ]
    rig = ao.armature('AetherRig', bones)
    for side, sign in [('L', 1), ('R', -1)]:
        ao.socket(rig, f'hand_socket_{side}', f'hand_{side}', (sign * .29, -.1, .58))
    ao.socket(rig, 'head_socket', 'head', (0, 0, 1.40))
    ao.socket(rig, 'chest_socket', 'chest', (0, -.155, .91))
    return rig


def seated(p, amount=1):
    p.move('pelvis', y=-.14 * amount, z=-.10 * amount)
    p.turn('chest','x',.16 * amount)
    p.both('thigh', 'x', -math.pi / 2 * amount)
    p.both('shin', 'x', math.pi / 2 * amount)
    p.both('upper_arm', 'x', -.60 * amount)
    p.both('forearm', 'x', -1.0 * amount)
    return p


def make_clips():
    def idle(t):
        return ao.Pose().move('chest', z=.005 * ao.wave(t, 1)).turn('head', 'z', .025 * ao.wave(t, 1)).turn('tail', 'z', .07 * ao.wave(t, 1))
    def walk(t):
        p = ao.Pose().move('pelvis', z=.013 * (1 - math.cos(t * math.tau * 2)))
        for side, phase in [('L', 0), ('R', .5)]:
            s = ao.wave(t, 1, phase)
            p.turn(f'thigh_{side}', 'x', .46 * s).turn(f'shin_{side}', 'x', -.45 * max(0, s))
            p.turn(f'upper_arm_{side}', 'x', -.3 * s).turn(f'forearm_{side}', 'x', -.08)
        return p
    def typing(t):
        p = seated(idle(t))
        p.turn('head', 'x', .12)
        p.turn('hand_L', 'x', .08 * ao.wave(t, 5)).turn('hand_R', 'x', -.08 * ao.wave(t, 5))
        return p
    def reading(t):
        return seated(idle(t)).turn('head', 'x', .10).turn('head', 'z', .045 * ao.wave(t, 1))
    def testing(t):
        return seated(idle(t)).turn('head', 'z', .065 * ao.wave(t, 1)).turn('forearm_R', 'x', -.1 * ao.wave(t, 2))
    def waiting(t):
        return seated(idle(t)).turn('head', 'x', -.10).turn('upper_arm_R', 'x', -.45).turn('forearm_R', 'x', -.6)
    def celebrate(t):
        p = idle(t).both('upper_arm', 'y', 2.3, mirrored=True).both('forearm', 'x', -.55)
        return p.move('pelvis', z=.05 * max(0, ao.wave(t, 2)))
    return {
        'idle': (72, idle), 'walk': (24, walk),
        'turn': (36, lambda t: idle(t).turn('chest', 'z', .35 * math.sin(math.pi * t))),
        'sit_down': (30, lambda t: seated(ao.Pose(), ao.ease(t))),
        'seated_idle': (72, lambda t: seated(idle(t))), 'typing': (48, typing),
        'reading': (72, reading), 'testing': (60, testing), 'reviewing': (72, reading),
        'waiting_permission': (72, waiting),
        'waiting_peer': (72, lambda t: seated(idle(t)).turn('head', 'z', .14 * ao.wave(t, 1))),
        'celebrate': (48, celebrate),
        'error': (72, lambda t: seated(idle(t)).turn('head', 'x', .30)),
        'stand_up': (30, lambda t: seated(ao.Pose(), 1 - ao.ease(t))),
    }
