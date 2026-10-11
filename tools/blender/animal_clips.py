"""The office animals' clips: what each activity looks like. In-place, 24 fps, every clip loops.

Bone axes (see aokit.armature): a bone's local X is the model's +X, local Y runs along the bone. A positive X turn
tips an upright bone forward and swings a hanging one back. Z turns an arm or leg out to the side (negative on the
left, positive on the right); a bone given a world axis as a vector turns about that axis instead.
"""
import math
import bpy
from mathutils import Euler, Matrix, Vector
from animal_geometry import FACE_HIDE
from animal_rig import ao, PROP_REST

wave, ease, TAU = ao.wave, ao.ease, ao.TAU
FORWARD = (0, 1, 0)  # the world axis through the face, for rolling a brow


class Pose(ao.Pose):
    """aokit's pose, plus the props a hand is holding this moment."""

    def __init__(self):
        super().__init__()
        self.props = {}

    def prop(self, name, hand, offset=(0.0, -.045, .02), tilt=0.0):
        self.props[name] = (hand, Vector(offset), tilt)
        return self


def bump(t, a=0.0, b=1.0):
    """0 outside [a, b], rising and falling smoothly to 1 in the middle: a gesture inside a loop."""
    if t <= a or t >= b:
        return 0.0
    return math.sin(math.pi * (t - a) / (b - a)) ** 2


def hold(t, a, b, ramp=.12):
    """0 before a, 1 between a+ramp and b-ramp, 0 after b: a pose held for a while."""
    if t <= a or t >= b:
        return 0.0
    return min(1.0, (t - a) / ramp, (b - t) / ramp)


def sit(p, k=1.0):
    p.move('pelvis', y=-.14 * k, z=-.08 * k)  # world axes: .14 toward the desk, .08 down
    p.turn('chest', 'x', .16 * k)
    p.both('thigh', 'x', -math.pi / 2 * k)
    p.both('shin', 'x', math.pi / 2 * k)
    p.both('upper_arm', 'x', -.60 * k)
    p.both('forearm', 'x', -1.0 * k)
    for side in 'LR':
        settle(p, side, k)
    return p


SETTLE = (.3, .05, .15, .45)


def settle(p, side, k=1.0, undo=False):
    """Puts an arm at rest on the desk; with `undo` takes it out again, in the reverse order, so a gesture that is
    solved against the bare seated pose (see REACH) lands exactly where it was solved."""
    sign = 1 if side == 'L' else -1
    upper_z, upper_x, fore_z, hand_x = (v * k for v in SETTLE)
    steps = [(f'upper_arm_{side}', 'z', sign * upper_z), (f'upper_arm_{side}', 'x', upper_x),
             (f'forearm_{side}', 'z', sign * fore_z), (f'hand_{side}', 'x', hand_x)]
    for bone, axis, angle in (reversed(steps) if undo else steps):
        p.turn(bone, axis, -angle if undo else angle)
    return p


def breathe(p, t, n=1, amount=.006):
    p.move('chest', z=amount * wave(t, n))
    p.turn('chest', 'x', amount * 2 * wave(t, n, .1))
    return p


TAIL_LIFT = (-.03, .08)  # a seated animal's raised tail goes up through the chair back, a drooping one down into the seat


def tail(p, t, sway=.2, n=1, lift=0.0, phase=0.0):
    p.turn('tail_1', 'x', max(TAIL_LIFT[0], min(lift, TAIL_LIFT[1])))
    for i, k in enumerate((1.0, .85, .7, .6, .5)):  # each joint swings a little less and a little later than the one before
        p.turn(f'tail_{i + 1}', 'z', sway * k * wave(t, n, phase - .05 * i))
    return p


def ears(p, t, amount=.06, n=1, back=0.0, out=0.0):
    p.both('ear', 'x', back + amount * wave(t, n, .2))
    p.both('ear', 'z', -out, mirrored=True)
    return p


def face(p, eye=1.0, joy=0.0, lid=0.0, smile=1.0, open=0.0, oh=0.0, flat=0.0):
    """How much of each eye and mouth shape shows (0 hidden, 1 fully). The rest face is open eyes and a smile."""
    for side in 'LR':
        p.move(f'eye_{side}', y=FACE_HIDE * (1 - eye))
        p.move(f'joy_{side}', y=-FACE_HIDE * joy)
        p.move(f'lid_{side}', y=-FACE_HIDE * lid)
    p.move('smile', y=FACE_HIDE * (1 - smile))
    p.move('open', y=-FACE_HIDE * open)
    p.move('oh', y=-FACE_HIDE * oh)
    p.move('flat', y=-FACE_HIDE * flat)
    return p


def blink(p, t, times=(.3,), width=.035):
    """Eyes shut for a moment at each of `times` (0..1 through the loop)."""
    shut = max((max(0.0, 1 - abs(t - at) / width) for at in times), default=0.0)
    return face_eyes(p, shut)


def face_eyes(p, shut):
    for side in 'LR':
        p.move(f'eye_{side}', y=FACE_HIDE * shut)
        p.move(f'lid_{side}', y=-FACE_HIDE * shut)
    return p


def brows(p, tilt=0.0, lift=0.0):
    """tilt > 0 worried (inner ends up), < 0 stern; lift raises both."""
    p.turn('brow_L', FORWARD, tilt)
    p.turn('brow_R', FORWARD, -tilt)
    p.move('brow_L', z=lift)
    p.move('brow_R', z=lift)
    return p


def arms_forward(p, upper=-.6, fore=-1.0):
    p.both('upper_arm', 'x', upper)
    p.both('forearm', 'x', fore)
    return p


def lerp(a, b, k):
    return a + (b - a) * k


SIT_ARM = (-.6, 0.0, 0.0, -1.0)  # (raise, yaw, spread, elbow) of an arm resting on the desk

REACH = {
    'sip': ('R', (-.13, -.59, -.38, -.28)), 'phone': ('L', (-1.14, -.68, .63, -.53)),
    'chin': ('R', (-.45, -.35, -.49, -.16)), 'scratch': ('R', (-1.51, .69, -.68, -.4)),
    'pad': ('L', (-.04, .37, .09, 0.0)), 'ask': ('R', (-1.68, .47, -.18, -.34)),
    'wave': ('R', (-1.72, .68, -.64, -.4)), 'up': ('L', (-1.8, -.51, .59, -.21)),
    'head': ('L', (-1.37, -.62, .49, -.69)),
}


def reach(p, side, name, k=1.0):
    """Moves an arm from resting on the desk (k = 0) to the solved pose `name` (k = 1)."""
    solved, (raise_, yaw, spread, elbow) = REACH[name]
    if side != solved:
        yaw, spread = -yaw, -spread
    u = f'upper_arm_{side}'
    settle(p, side, k, undo=True)  # solved against the bare seated pose; `sit` has already settled the arm
    p.turn(u, 'y', lerp(0, yaw, k)).turn(u, 'z', lerp(0, spread, k)).turn(u, 'x', lerp(0, raise_, k))
    p.turn(f'forearm_{side}', 'x', lerp(0, elbow, k))
    return p


def head_turn(p, x=0.0, y=0.0, z=0.0):
    return p.turn('head', 'x', x).turn('head', 'y', y).turn('head', 'z', z)


def desk_typing(p, t, speed=5, amount=.09):
    p.turn('hand_L', 'x', amount * wave(t, speed)).turn('hand_R', 'x', -amount * wave(t, speed, .17))
    p.turn('forearm_L', 'x', .04 * wave(t, speed, .3)).turn('forearm_R', 'x', -.04 * wave(t, speed, .6))
    return p


def make_clips():
    def idle(t):
        p = Pose()
        breathe(p, t, 2).turn('head', 'y', .08 * wave(t, 1)).turn('head', 'z', .03 * wave(t, 1, .25))
        tail(p, t, .22, 2)
        ears(p, t, .05, 2)
        blink(p, t, (.25, .72))
        return p

    def walk(t):
        p = Pose().move('pelvis', z=.013 * (1 - math.cos(t * TAU * 2)))
        for side, phase in (('L', 0), ('R', .5)):
            s = wave(t, 1, phase)
            p.turn(f'thigh_{side}', 'x', .46 * s).turn(f'shin_{side}', 'x', -.45 * max(0, s))
            p.turn(f'upper_arm_{side}', 'x', -.3 * s).turn(f'forearm_{side}', 'x', -.08)
        tail(p, t, .3, 2)
        ears(p, t, .1, 2)
        return p

    def seated_idle(t):
        p = sit(Pose())
        breathe(p, t, 2).turn('head', 'y', .1 * wave(t, 1)).turn('head', 'x', .05 + .02 * wave(t, 2))
        tail(p, t, .2, 2)
        ears(p, t, .05, 2)
        blink(p, t, (.2, .55, .83))
        return p

    def typing(t):
        p = desk_typing(sit(Pose()), t)
        breathe(p, t, 3).turn('head', 'x', .14 + .02 * wave(t, 2)).turn('head', 'y', .05 * wave(t, 1))
        tail(p, t, .1, 2)
        ears(p, t, .03, 3)
        blink(p, t, (.35, .85))
        face(p, smile=0.0, flat=1.0)
        return brows(p, -.08)

    def reading(t):
        p = sit(Pose())
        breathe(p, t, 2).turn('head', 'x', .16).turn('head', 'y', .12 * wave(t, 2))
        arms_forward(p, -.55, -1.05)
        tail(p, t, .14, 1)
        ears(p, t, .04, 2)
        blink(p, t, (.15, .5, .9))
        return brows(p, .05)

    def thinking(t):
        k = hold(t, .08, .92)
        p = sit(Pose())
        breathe(p, t, 2)
        head_turn(p, -.06 * k, .1 * k + .08 * k * wave(t, 1), -.12 * k)
        reach(p, 'R', 'chin', k)
        tail(p, t, .24, 1, lift=.25 * k)
        ears(p, t, .05, 1, out=.1 * k)
        face(p, smile=1 - k, flat=k)
        blink(p, t, (.3, .75))
        return brows(p, .18 * k, .006 * k)

    def scratch_head(t):
        k = hold(t, .1, .9)
        p = sit(Pose())
        breathe(p, t, 2)
        head_turn(p, 0, 0, .1 * k)
        reach(p, 'R', 'scratch', k)
        p.turn('forearm_R', 'x', -.14 * k * wave(t, 6)).turn('hand_R', 'z', .3 * k * wave(t, 6, .2))
        face(p, smile=1 - k, flat=k)
        tail(p, t, .12, 2, lift=-.2 * k)
        ears(p, t, .04, 2, back=.2 * k)
        return brows(p, .3 * k, .004 * k)

    def reviewing(t):
        nod = bump(t, .45, .65)
        p = sit(Pose())
        breathe(p, t, 2)
        head_turn(p, .1 + .09 * nod, .06 * wave(t, 1), 0)
        reach(p, 'L', 'pad')
        p.turn('upper_arm_R', 'x', -.65).turn('forearm_R', 'x', -.95).turn('hand_R', 'x', -.07 * wave(t, 4))
        p.prop('pad', 'hand_L', (-.01, -.07, .075), tilt=.5)
        tail(p, t, .1, 2)
        ears(p, t, .03, 2)
        blink(p, t, (.2, .8))
        face(p, smile=.0, flat=1.0)
        return brows(p, -.12 + .12 * nod, .003)

    def testing(t):
        p = sit(Pose())
        breathe(p, t, 2).turn('head', 'x', .12).turn('head', 'y', .16 * wave(t, 2))
        arms_forward(p, -.6, -1.0)
        p.turn('forearm_R', 'x', -.12 * max(0, wave(t, 6))).turn('hand_R', 'x', -.12 * max(0, wave(t, 6)))
        p.turn('hand_L', 'x', .05 * wave(t, 3))
        tail(p, t, .16, 3)
        ears(p, t, .04, 3)
        blink(p, t, (.4,))
        return brows(p, -.05)

    def waiting_permission(t):
        k = hold(t, .05, .95, .1)
        p = sit(Pose())
        breathe(p, t, 2)
        head_turn(p, 0, -.18 * k, -.1 * k)
        reach(p, 'R', 'ask', k)
        p.turn('hand_R', 'z', .22 * k * wave(t, 3))
        face(p, smile=1.0)
        tail(p, t, .3, 2)
        ears(p, t, .08, 2, out=.15 * k)
        blink(p, t, (.3, .78))
        return brows(p, .3 * k, .007 * k)

    def waiting_peer(t):
        p = sit(Pose())
        breathe(p, t, 2)
        head_turn(p, 0, -.1 + .05 * wave(t, 1, .3), .16)
        reach(p, 'L', 'phone')
        p.prop('phone', 'hand_L', (.0, -.04, .05), tilt=.1)
        talk = max(0.0, wave(t, 5)) * hold(t, .1, .9)
        face(p, smile=1 - talk, open=talk * .7)
        p.turn('shin_R', 'x', .12 * max(0, wave(t, 3)))
        tail(p, t, .18, 3)
        ears(p, t, .05, 2, out=.05)
        blink(p, t, (.35, .8))
        return brows(p, .08)

    def error(t):
        shake = wave(t, 6)
        p = sit(Pose())
        breathe(p, t, 6, .008)
        head_turn(p, .18, .1 * shake, 0)
        reach(p, 'L', 'head').turn('upper_arm_L', 'x', 0.0)
        reach(p, 'R', 'head')
        p.move('pelvis', x=.004 * shake)
        face(p, smile=0.0, oh=1.0)
        tail(p, t, .05, 5, lift=-.25)
        ears(p, t, .02, 5, back=.55)
        return brows(p, .45, .006)

    def cheer(t):
        up = .5 + .5 * wave(t, 3)
        p = sit(Pose())
        breathe(p, t, 3, .01).move('pelvis', z=.012 * up)
        reach(p, 'L', 'up')
        reach(p, 'R', 'up')
        p.turn('forearm_L', 'x', .15 * wave(t, 3)).turn('forearm_R', 'x', .15 * wave(t, 3, .5))
        head_turn(p, -.1, 0, .08 * wave(t, 3))
        face(p, eye=0.0, joy=1.0, smile=0.0, open=1.0)
        tail(p, t, .55, 6, lift=.3)
        ears(p, t, .1, 3, out=.2)
        return brows(p, -.05, .008)

    def celebrate(t):
        # Seated, like cheer: standing up would put the legs through the hover seat.
        up = max(0.0, wave(t, 2))
        p = sit(Pose())
        breathe(p, t, 2, .01).move('pelvis', z=.06 * up)
        reach(p, 'L', 'up')
        reach(p, 'R', 'up')
        p.turn('forearm_L', 'x', .25 * wave(t, 2)).turn('forearm_R', 'x', .25 * wave(t, 2, .5))
        head_turn(p, -.12, 0, .1 * wave(t, 2))
        face(p, eye=0.0, joy=1.0, smile=0.0, open=1.0)
        tail(p, t, .6, 4, lift=.35)
        ears(p, t, .1, 2, out=.2)
        return brows(p, 0, .008)

    def sleeping(t):
        p = sit(Pose())
        p.turn('chest', 'x', .55).turn('neck', 'x', .4).turn('head', 'y', 1.15).turn('head', 'z', .1)
        p.move('pelvis', y=-.07)
        breathe(p, t, 1, .014)
        p.both('upper_arm', 'x', -.25).both('forearm', 'x', -.1)
        p.turn('head', 'x', .04 * wave(t, 1, .25))
        face(p, eye=0.0, lid=1.0)
        tail(p, t, .04, 1, lift=.04)
        ears(p, t, .02, 1, back=.7)
        return brows(p, .1, -.004)

    def stretch(t):
        k = hold(t, .1, .9, .2)
        p = sit(Pose())
        breathe(p, t, 2)
        reach(p, 'L', 'up', k)
        reach(p, 'R', 'up', k)
        p.turn('chest', 'x', .16 - .4 * k)
        head_turn(p, -.35 * k)
        yawn = hold(t, .3, .75, .12)
        face(p, eye=1 - yawn, lid=yawn, smile=1 - yawn, open=yawn)
        tail(p, t, .1, 1, lift=.4 * k)
        ears(p, t, .03, 1, back=.3 * k)
        return brows(p, .0, .004 * yawn)

    def sip(t):
        k = hold(t, .12, .88, .22)
        p = sit(Pose())
        breathe(p, t, 2)
        head_turn(p, .45 * k, 0, .05 * k)
        reach(p, 'R', 'sip', k)
        p.prop('cup', 'hand_R', (0, -.045, .06), tilt=.6 * k)
        face(p, eye=1 - k * .8, joy=k * .8, smile=1.0)
        tail(p, t, .2, 1, lift=.15 * k)
        ears(p, t, .04, 1)
        blink(p, t, (.1, .93))
        return brows(p, -.04 * k, .004 * k)

    def wave_hello(t):
        k = hold(t, .06, .94, .1)
        p = sit(Pose())
        breathe(p, t, 2)
        head_turn(p, -.05 * k, 0, -.1 * k)
        reach(p, 'R', 'wave', k)
        p.turn('forearm_R', 'x', -.4 * k * (1 - .6 * wave(t, 4)))
        face(p, eye=1 - k * .85, joy=k * .85, smile=1 - k * .3, open=k * .3)
        tail(p, t, .4, 4, lift=.2 * k)
        ears(p, t, .06, 2, out=.1 * k)
        return brows(p, 0, .008 * k)

    def shrug(t):
        k = hold(t, .1, .9, .15)
        p = sit(Pose())
        breathe(p, t, 2)
        p.both('upper_arm', 'x', -.45 * k - .6 * (1 - k)).both('upper_arm', 'z', -.45 * k, mirrored=True)
        p.both('forearm', 'x', -1.3 * k - 1.0 * (1 - k)).both('hand', 'z', -.3 * k, mirrored=True)
        p.turn('head', 'z', .17 * k).turn('head', 'y', .08 * k * wave(t, 1))
        p.move('chest', z=.02 * k)
        face(p, smile=1 - k, flat=k)
        tail(p, t, .1, 2, lift=-.2 * k)
        ears(p, t, .04, 2, back=.35 * k)
        return brows(p, .35 * k, .008 * k)

    def look_around(t):
        p = sit(Pose())
        breathe(p, t, 2).turn('head', 'y', .55 * wave(t, 1) * (1 + .3 * wave(t, 2))).turn('head', 'x', -.04)
        p.turn('chest', 'y', .15 * wave(t, 1, -.05))
        tail(p, t, .25, 1)
        ears(p, t, .1, 1, out=.12)
        blink(p, t, (.12, .6))
        return brows(p, .05, .004)

    def nod(t):
        p = sit(Pose())
        breathe(p, t, 2).turn('head', 'x', .05 + .22 * max(0, wave(t, 2)))
        p.turn('neck', 'x', .08 * max(0, wave(t, 2)))
        tail(p, t, .2, 2)
        ears(p, t, .05, 2)
        agree = max(0.0, wave(t, 2))
        face(p, eye=1 - agree * .9, joy=agree * .9)
        return brows(p, 0, .004)

    def haunt(t):
        p = Pose().move('root', z=.06 * wave(t, 1))  # the whole figure rises and sinks, so nothing deforms
        p.turn('chest', 'x', .05 * wave(t, 1, .25)).turn('chest', 'y', .08 * wave(t, 1, .1))
        head_turn(p, .05 * wave(t, 2), .1 * wave(t, 1), .06 * wave(t, 1, .3))
        p.both('upper_arm', 'x', -.7 + .1 * wave(t, 2)).both('upper_arm', 'z', -.35, mirrored=True)
        p.both('forearm', 'x', -.3 + .08 * wave(t, 2, .2))
        tail(p, t, .5, 1, lift=.1 * wave(t, 2))
        return p

    def hop(t):
        air = max(0.0, wave(t, 1))
        p = Pose().move('pelvis', z=.17 * air)
        p.turn('chest', 'x', .1 + .03 * wave(t, 2)).turn('neck', 'x', .1)
        head_turn(p, .12, .06 * wave(t, 1), .08 * wave(t, 1, .25))
        p.both('upper_arm', 'x', -1.5 + .04 * wave(t, 2)).both('forearm', 'x', -.04).both('hand', 'x', .35)
        p.both('thigh', 'x', -.08 * air).both('shin', 'x', .16 * air).both('foot', 'x', -.1 * air)
        p.both('thigh', 'z', .03, mirrored=True)
        return p

    return {
        'idle': (72, idle), 'walk': (24, walk),
        'turn': (36, lambda t: idle(t).turn('chest', 'z', .35 * math.sin(math.pi * t))),
        'sit_down': (30, lambda t: sit(Pose(), ease(t))), 'stand_up': (30, lambda t: sit(Pose(), 1 - ease(t))),
        'seated_idle': (96, seated_idle), 'typing': (48, typing),
        'reading': (72, reading), 'thinking': (96, thinking), 'scratch_head': (72, scratch_head),
        'reviewing': (72, reviewing), 'testing': (60, testing),
        'waiting_permission': (72, waiting_permission), 'waiting_peer': (72, waiting_peer),
        'error': (48, error), 'cheer': (48, cheer), 'celebrate': (48, celebrate),
        'sleeping': (96, sleeping), 'stretch': (96, stretch), 'sip': (96, sip),
        'wave': (48, wave_hello), 'shrug': (72, shrug), 'look_around': (96, look_around), 'nod': (48, nod),
        'haunt': (72, haunt), 'hop': (36, hop),
    }


FORM_CLIPS = {'ghost': ['haunt'], 'zombie': ['hop']}


def clips_for(species):
    table = make_clips()
    if species in FORM_CLIPS:
        return {name: table[name] for name in FORM_CLIPS[species]}
    return {name: v for name, v in table.items() if name not in {n for names in FORM_CLIPS.values() for n in names}}


def place_props(arm, pose):
    """Carries each prop the pose holds to its hand; props not held stay inside the torso."""
    if not pose.props:
        return
    bpy.context.view_layer.update()
    for name, (hand, offset, tilt) in pose.props.items():
        bone = arm.pose.bones[f'prop_{name}']
        rest = Matrix.Translation(Vector(PROP_REST[name]))
        wanted = Matrix.Translation(arm.pose.bones[hand].head + offset) @ Euler((tilt, 0, 0), 'XYZ').to_matrix().to_4x4()
        local = bone.bone.matrix_local
        carried = bone.parent.bone.matrix_local @ bone.parent.matrix.inverted()  # undoes what the chest does to the bone
        bone.matrix_basis = local.inverted() @ carried @ wanted @ rest.inverted() @ local


def pose_rig(arm, pose):
    ao.pose(arm, pose)
    place_props(arm, pose)


def key_clips(arm, clips):
    """Keys every clip as its own looping action, every bone on every frame, so a clip always sets the whole pose."""
    arm.animation_data_create()
    for name, (frames, fn) in clips.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        arm.animation_data.action = action
        for f in range(frames + 1):
            pose_rig(arm, fn(f / frames))
            for pb in arm.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=f + 1)
                pb.keyframe_insert('location', frame=f + 1)
        action.use_frame_range = True
        action.frame_start, action.frame_end = 1, frames + 1
        action.use_cyclic = True
    arm.animation_data.action = None
    ao.pose(arm, Pose())
