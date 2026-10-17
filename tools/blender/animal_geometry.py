"""The office animals' bodies: one fused fur skin, dressed in a painted uniform, with loose parts on it
(eyes, mouths, ears, tail, boots, collar). Everything is built from code; there is nothing to hand-edit.

Expression overlays are swapped by moving them out of the head (see FACE_HIDE and animal_clips.py);
the base mouth line stays on the face while body animation crossfades.
"""
import math
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree
from animal_rig import ao, PROP_REST, TAIL_BONES
from animal_profiles import PROFILES, UNIFORM

HEAD_CENTRE = (0.0, -0.012, 1.17)
FACE_HIDE = 0.075  # metres a face part sinks into the head while it is not showing
FACE_PARTS = ['eye', 'joy', 'lid', 'smile', 'open', 'oh', 'flat']  # the bones that swap; see animal_rig.skeleton


def pbr(name, color, roughness=.7, fur=False):
    material = ao.material(name, color)
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = material.diffuse_color
    node.inputs['Roughness'].default_value = roughness
    if fur:
        noise = material.node_tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 220
        noise.inputs['Detail'].default_value = 3
        bump = material.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .22
        bump.inputs['Distance'].default_value = .01
        material.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
        material.node_tree.links.new(bump.outputs['Normal'], node.inputs['Normal'])
    return material


def materials(P):
    u = {**UNIFORM, **P.get('uniform', {})}
    ear_outer = P['dark'] if P.get('ear_color') == 'dark' else P['fur']
    return {
        'fur': pbr('Fur', P['fur'], .86, True), 'light': pbr('Cream', P['light'], .88, True),
        'dark': pbr('Dark', P['dark'], .86, True), 'ear': pbr('EarOuter', ear_outer, .86, True),
        'ear_in': pbr('EarInner', P['ear_inner'], .88, True), 'accent': pbr('Accent', P['accent'], .6),
        'cloth': pbr('Uniform', u['cloth'], .9, True), 'cloth_light': pbr('UniformLight', u['cloth_light'], .85, True),
        'pants': pbr('Trousers', u['pants'], .88, True), 'boots': pbr('Boots', u['boots'], .6),
        'sole': pbr('Sole', u['sole'], .5), 'trim': pbr('Trim', u['trim'], .38),
        'ink': pbr('Ink', '#1F2A31', .3), 'nose': pbr('Nose', P['nose_color'], .25),
        'pink': pbr('Pink', '#D98B8B', .6), 'white': pbr('White', '#FBFAF2', .22),
        'talisman': pbr('Talisman', '#EBD56B', .8), 'seal': pbr('Seal', '#B01E23', .6),
        'hat': pbr('Hat', '#1B1E26', .55), 'ghost': pbr('Ghost', '#E3EEFF', .35),
    }


def ellipsoids(P):
    """The head and muzzle as [(centre, radii)], the shapes the skin is fused from."""
    cx, cy, cz = HEAD_CENTRE
    head = ((cx, cy, cz), P['head'])
    muzzle = [((cx + o[0], cy - o[1], cz + o[2]), r) for o, r in P['muzzle']]
    return [head] + muzzle


def front_y(P, x, z):
    """The face's surface at (x, z): the most forward of the head and muzzle shapes there."""
    best = None
    for (mx, my, mz), (rx, ry, rz) in ellipsoids(P):
        t = 1 - ((x - mx) / rx) ** 2 - ((z - mz) / rz) ** 2
        if t > 0:
            y = my - ry * math.sqrt(t)
            best = y if best is None else min(best, y)
    return best if best is not None else HEAD_CENTRE[1]


def layout(P):
    """Every face landmark, from the profile: eyes, nose, mouth. Shared by the parts and the skeleton."""
    ex, ez = P['eye']
    eye_z = HEAD_CENTRE[2] + ez
    muzzle = ellipsoids(P)[-1]  # a long snout is a base and a tip; the nose and mouth sit on the tip
    (mx, my, mz), (rx, ry, rz) = muzzle
    nose = (0.0, my - ry * .93, mz + rz * .35)
    mouth_z = mz - rz * (.6 if len(ellipsoids(P)) > 2 else .45)
    return {
        'eye': (ex, front_y(P, ex, eye_z), eye_z), 'nose': nose,
        'mouth': (0.0, front_y(P, 0.0, mouth_z), mouth_z), 'mouth_half': min(rx * (.5 if len(ellipsoids(P)) > 2 else .75), .055),
    }


def mesh_part(name, mat, bone, build, bones=None):
    """A loose part: one material, weighted to `bone` (or by `bones(co)` -> {bone: weight})."""
    bm = bmesh.new()
    build(bm)
    ob = ao.mesh_object(name, bm, [mat])
    if bone.split('_')[0] in FACE_PARTS + ['brow'] or name.startswith(('eye', 'mouth', 'tongue', 'nose', 'tooth', 'fang', 'whisker')):
        ob.vertex_groups.new(name='FaceDetail').add(list(range(len(ob.data.vertices))), 1, 'REPLACE')
    for v in ob.data.vertices:
        for b, w in (bones(v.co) if bones else {bone: 1.0}).items():
            group = ob.vertex_groups.get(b) or ob.vertex_groups.new(name=b)
            group.add([v.index], w, 'REPLACE')
    return ob


def arc(bm, points, radius):
    """A continuous curved line without capsule seams."""
    sweep_tube(bm, [(point, radius) for point in points], segs=8)


def smooth_step(v, a, b):
    t = min(1.0, max(0.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def skin_shapes(P, bm):
    """Head, muzzle, cheeks, neck, torso, arms and legs, overlapping, ready to be fused into one skin."""
    b = P['bulk']
    E = lambda c, r, rot=(0, 0, 0): ao.ellipsoid(bm, c, r, rot, segs=36, rings=22)
    L = lambda a, c, ra, rb: ao.limb(bm, a, c, ra, rb, segs=28, rings=18)
    for c, r in ellipsoids(P):
        E(c, r)
    if P['cheeks']:
        o, r = P['cheeks']
        for s in (-1, 1):
            E((s * o[0], HEAD_CENTRE[1] - o[1], HEAD_CENTRE[2] + o[2]), r, (0, 0, s * .35))
    L((0, 0, .975), (0, -.01, 1.075), .108 * b, .12)
    E((0, .0, .84), (.205 * b, .155 * b, .215))
    E((0, .006, .64), (.205 * b, .158 * b, .2))
    L((0, .003, .72), (0, .003, .8), .19 * b, .2 * b)
    for s in (-1, 1):
        E((s * .195 * b, 0, .915), (.082, .08, .082))
        L((s * .2 * b, 0, .9), (s * .275, -.02, .735), .072, .066)
        L((s * .275, -.02, .735), (s * .298, -.058, .565), .066, .057)
        E((s * .305, -.095, .512), (.07, .076, .08))
        E((s * .278, -.125, .526), (.03, .036, .042), (0, 0, s * .4))  # a thumb
        L((s * .1 * b, 0, .585), (s * .1 * b, -.012, .335), .104 * b, .084)
        L((s * .1 * b, -.012, .335), (s * .1 * b, 0, .12), .084, .066)


def dark_patches(P):
    """Fields (negative inside) for the dark markings painted on the head."""
    cx, cy, cz = HEAD_CENTRE
    ex, ez = P['eye']
    kind = P.get('eye_patch')
    fields = []
    if kind == 'dark':
        for s in (-1, 1):
            c = (s * (ex + .005), cy - .19, cz + ez - .005)
            fields.append(lambda p, c=c, s=s: ao.blob(p, c, (.082, .07, .09)))
        if P is PROFILES['raccoon']:
            fields.append(lambda p: ao.blob(p, (0, cy - .2, cz + ez + .01), (.15, .08, .045)))
    elif kind == 'dark_one':
        c = (ex + .005, cy - .19, cz + ez)
        fields.append(lambda p: ao.blob(p, c, (.085, .08, .095)))
    if P.get('stripes'):
        for x in (-.04, 0.0, .04):
            fields.append(lambda p, x=x: ao.blob(p, (x, cy - .17, cz + .2), (.011, .09, .055)))
    return fields


def face_light(P):
    """The cream part of the face, or None when the whole face is one colour."""
    cx, cy, cz = HEAD_CENTRE
    kind = P['light_face']
    if kind == 'lower':
        return lambda p: ao.blob(p, (0, cy - .125, cz - .115), (.22, .175, .115))
    if kind == 'muzzle':
        (mx, my, mz), (rx, ry, rz) = ellipsoids(P)[1]
        return lambda p: ao.blob(p, (mx, my - .005, mz), (rx * 1.04, ry * 1.04, rz * 1.04))
    return None


WRIST = .59  # where a sleeve ends and the hand begins


def sleeve_edge(x, b, hem=.662):
    """Where the jacket stops: at its hem across the body (the waist, or the ankle for a robe), at the wrist along the arms."""
    return hem + (WRIST - hem) * smooth_step(abs(x), .2 * b + .01, .2 * b + .05)


def jacket_field(b, hem=.662):
    def field(p):
        top = .968 + .03 * smooth_step(abs(p.x), .09, .18)
        return max(sleeve_edge(p.x, b, hem) - p.z, p.z - top)
    return field


def pants_field(b):
    return lambda p: max(p.z - .662, abs(p.x) - (.2 * b + .03))


def hands_field(b):
    return lambda p: max(p.z - WRIST, (.2 * b + .03) - abs(p.x))


def body_skin(P, mats):
    bm = bmesh.new()
    skin_shapes(P, bm)
    skin = ao.mesh_object('skin', bm, [mats['fur']])
    ao.fuse(skin, voxel=.0085, smooth=8, quads=7000)
    patches = [(mats['dark'], f) for f in dark_patches(P)]
    light = face_light(P)
    if light:
        patches.append((mats['light'], light))
    reach = P['bulk'] * .2 + .03
    patches.append((mats['accent' if P.get('robe') else 'sole'], lambda p: max(abs(p.z - .664) - .012, abs(p.x) - reach)))  # the belt, painted on
    patches.append((mats['cloth'], jacket_field(P['bulk'], P.get('robe', .662))))
    if not P.get('robe'):
        patches.append((mats['pants'], pants_field(P['bulk'])))
    if P['hands'] != 'fur':
        patches.append((mats[P['hands']], hands_field(P['bulk'])))
    ao.paint(skin, mats['fur'], patches)
    return skin


def eye_parts(P, mats, lay):
    ex, ey, ez = lay['eye']
    size = P['eye_size']
    out = []
    for s in (-1, 1):
        side = 'L' if s > 0 else 'R'
        c = (s * ex, ey + size[1] * .35, ez)
        turn = (0, 0, -s * .12)
        out.append(mesh_part(f'eye_{side}', mats['ink'], f'eye_{side}',
                             lambda bm, c=c, turn=turn: ao.ellipsoid(bm, c, size, turn, segs=20, rings=14)))
        k = size[0] / .05
        glint = (c[0] - s * .012 * k, c[1] - size[1] * .72, c[2] + .026 * k)
        out.append(mesh_part(f'glint_{side}', mats['white'], f'eye_{side}',
                             lambda bm, g=glint, k=k: ao.ellipsoid(bm, g, (.012 * k, .008, .016 * k), segs=10, rings=6)))
        tiny = (c[0] + s * .014 * k, c[1] - size[1] * .6, c[2] - .022 * k)
        out.append(mesh_part(f'glint2_{side}', mats['white'], f'eye_{side}',
                             lambda bm, g=tiny, k=k: ao.ellipsoid(bm, g, (.006 * k, .005, .007 * k), segs=8, rings=5)))
        half = size[0] * .95
        for bone, height, rise in (('joy', .028, 1), ('lid', .02, -1)):
            pts = [(s * ex + t * half, ey - .004 + FACE_HIDE,
                    ez + rise * height * (1 - t * t) - (0 if rise > 0 else height * .2)) for t in (-1, -.67, -.33, 0, .33, .67, 1)]
            out.append(mesh_part(f'{bone}_{side}', mats['ink'], f'{bone}_{side}', lambda bm, pts=pts: arc(bm, pts, .0085)))
        brow_z = ez + size[2] + .03
        brow = (s * (ex + .004), front_y(P, s * (ex + .004), brow_z) + .004, brow_z)
        out.append(mesh_part(f'brow_{side}', mats['dark'], f'brow_{side}',
                             lambda bm, c=brow, s=s: ao.ellipsoid(bm, c, (.05, .013, .012), (0, 0, 0), segs=12, rings=8)))
    return out


def mouth_parts(P, mats, lay):
    mx, my, mz = lay['mouth']
    half = lay['mouth_half']
    (_, _, tip_z), (_, _, tip_h) = ellipsoids(P)[-1]
    opening_h = min(.035, (mz - tip_z + tip_h) * .6)
    smile = [(t * half, front_y(P, t * half, mz + .01 * t * t) - .003, mz + .01 * t * t) for t in (i / 4 for i in range(-4, 5))]
    out = [mesh_part('mouth_smile', mats['ink'], 'smile', lambda bm: arc(bm, smile, .005))]

    def open_mouth(bm, small):
        w, h = (half * .62, min(.026, opening_h)) if small else (half * .9, opening_h)
        verts = ao.ellipsoid(bm, (0, 0, mz - h * .45), (w, .006, h), segs=18, rings=12)
        for v in verts:
            v.co.y += front_y(P, v.co.x, v.co.z) + FACE_HIDE - .003

    def tongue(bm):
        verts = ao.ellipsoid(bm, (0, 0, mz - opening_h), (half * .55, .004, opening_h * .3), segs=12, rings=8)
        for v in verts:
            v.co.y += front_y(P, v.co.x, v.co.z) + FACE_HIDE - .007

    out.append(mesh_part('mouth_open', mats['ink'], 'open', lambda bm: open_mouth(bm, False)))
    out.append(mesh_part('tongue_open', mats['pink'], 'open', tongue))
    out.append(mesh_part('mouth_oh', mats['ink'], 'oh', lambda bm: open_mouth(bm, True)))
    assert all(v.co.y > front_y(P, v.co.x, v.co.z) for part in out[1:] for v in part.data.vertices), 'Hidden mouth crosses the face'
    return out


def nose_and_whiskers(P, mats, lay):
    nx, ny, nz = lay['nose']
    out = [mesh_part('nose', mats['nose'], 'head', lambda bm: ao.ellipsoid(bm, (nx, ny, nz), P['nose'], segs=20, rings=12))]
    mx, my, mz = lay['mouth']
    if P.get('teeth'):
        for s in (-1, 1):
            out.append(mesh_part('tooth', mats['white'], 'head',
                                 lambda bm, s=s: ao.box(bm, (s * .011, my - .008, mz - .03), (.02, .008, .03), bevel=.003)))
    if P['whiskers']:
        for s in (-1, 1):
            for i, lift in enumerate((.012, 0.0, -.012)):
                a = (s * .07, ny + .05, nz - .005 + lift)
                b = (s * (.2 + i * .01), ny + .075, nz + lift * 3 + .005)
                out.append(mesh_part('whisker', mats['white'], 'head',
                                     lambda bm, a=a, b=b: ao.limb(bm, a, b, .0028, .0012, segs=6, rings=4)))
    return out


def ear_parts(P, mats):
    if P['ear'] == 'none':
        return []
    cx, cy, cz = HEAD_CENTRE
    kind, length = P['ear'], P['ear_len']
    r0, r1 = P['ear_r']
    out = []
    for s in (-1, 1):
        side = 'L' if s > 0 else 'R'
        ax, ay, az = P['ear_at']
        base = Vector((s * ax, cy + ay, cz + az))
        if kind == 'floppy':
            turn = Euler((.08, -s * .32, 0), 'XYZ')
            local = lambda bm: ao.limb(bm, (0, 0, 0), (0, 0, -length), r0, r1, segs=24, rings=16)
            squash = (.45, 1.0, 1.0)
        elif kind == 'round':
            turn = Euler((0, 0, s * .5), 'XYZ')
            local = lambda bm: ao.ellipsoid(bm, (0, 0, 0), (r0, .042, r1), segs=28, rings=16)
            squash = (1.0, 1.0, 1.0)
        elif kind == 'long':
            turn = Euler((.12, s * .2, 0), 'XYZ')
            local = lambda bm: ao.ellipsoid(bm, (0, 0, length / 2), (r0, .03, length / 2), segs=28, rings=20)
            squash = (1.0, 1.0, 1.0)
        else:
            turn = Euler((.1, s * .24, 0), 'XYZ')
            tip = .16 if kind == 'tri' and P is PROFILES['fox'] else .34
            local = lambda bm: ao.outline(bm, [(-r0, 0), (r0, 0), (r0 * tip, length), (-r0 * tip, length)], .05, bevel=.017)
            squash = (1.0, 1.0, 1.0)
        matrix = Matrix.Translation(base) @ turn.to_matrix().to_4x4() @ Matrix.Diagonal(squash + (1.0,))

        def build(bm, local=local, matrix=matrix):
            before = set(bm.verts)
            local(bm)
            bmesh.ops.transform(bm, matrix=matrix, verts=[v for v in bm.verts if v not in before])

        ear = mesh_part(f'ear_{side}', mats['ear'], f'ear_{side}', build)
        if P['ear_inner'] != (P['dark'] if P.get('ear_color') == 'dark' else P['fur']):
            inverse = matrix.inverted()
            if kind == 'floppy':
                centre, radii = Vector((0, -.04, -length * .5)), (r0 * 1.5, .06, length * .42)
            elif kind == 'round':
                centre, radii = Vector((0, -.04, 0)), (r0 * .62, .05, r1 * .62)
            elif kind == 'long':
                centre, radii = Vector((0, -.03, length * .52)), (r0 * .62, .05, length * .4)
            else:
                centre, radii = Vector((0, -.05, length * .34)), (r0 * .46, .06, length * .3)
            ao.paint(ear, mats['ear'], [(mats['ear_in'], lambda p, i=inverse: ao.blob(i @ Vector(p), tuple(centre), radii))])
        out.append(ear)
    return out


def smooth_path(path, per=4):
    """A centreline through the same points as a smooth curve (Catmull-Rom), `per` samples a span, with the radius
    carried along: a tail drawn from a few corner points would show them as creases."""
    if len(path) < 3:
        return path
    pts = [Vector(p) for p, _ in path]
    rad = [r for _, r in path]
    at = lambda seq, i: seq[max(0, min(len(seq) - 1, i))]
    out = []
    for i in range(len(pts) - 1):
        for s in range(per):
            t = s / per
            p0, p1, p2, p3 = (at(pts, i + k) for k in (-1, 0, 1, 2))
            point = .5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)
            out.append((tuple(point), rad[i] + (rad[i + 1] - rad[i]) * t))
    out.append((tuple(pts[-1]), rad[-1]))
    return out


def sweep_tube(bm, path, segs=24):
    """One smooth tube along a centreline of (point, radius), closed with rounded ends, its rings turned by the least
    amount from one to the next (a chain of capsules shows a rib at every joint)."""
    pts = [Vector(p) for p, _ in path]
    rad = [r for _, r in path]
    tangents = []
    for i in range(len(pts)):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        tangents.append(d.normalized())
    rings = []
    caps = [math.radians(a) for a in (65, 40, 18)]
    def ring(centre, r, frame):
        return [bm.verts.new(centre + (frame @ Vector((math.cos(2 * math.pi * k / segs) * r, math.sin(2 * math.pi * k / segs) * r, 0)))) for k in range(segs)]
    quat = tangents[0].to_track_quat('Z', 'Y')
    frames = []
    for t in tangents:
        last = quat @ Vector((0, 0, 1))
        quat = last.rotation_difference(t) @ quat
        frames.append(quat.to_matrix())
    root_axis, tip_axis = -tangents[0], tangents[-1]
    for a in caps:
        rings.append(ring(pts[0] + root_axis * rad[0] * math.sin(a), rad[0] * math.cos(a), frames[0]))
    for c, r, f in zip(pts, rad, frames):
        rings.append(ring(c, r, f))
    for a in reversed(caps):
        rings.append(ring(pts[-1] + tip_axis * rad[-1] * math.sin(a), rad[-1] * math.cos(a), frames[-1]))
    for lo, hi in zip(rings, rings[1:]):
        for k in range(segs):
            bm.faces.new((lo[k], lo[(k + 1) % segs], hi[(k + 1) % segs], hi[k]))
    root = bm.verts.new(pts[0] + root_axis * rad[0])
    tip = bm.verts.new(pts[-1] + tip_axis * rad[-1])
    for k in range(segs):
        bm.faces.new((rings[0][(k + 1) % segs], rings[0][k], root))
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % segs], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def tail_path(P):
    """The tail's centreline as [(point, radius)], root to tip."""
    kind = P['tail']
    return smooth_path({
        'bush': [((0, .13, .6), .075), ((0, .33, .63), .125), ((0, .53, .72), .15), ((0, .69, .84), .11)],
        'puff': [((0, .16, .6), .085), ((0, .2, .61), .09)],
        'cat': [((0, .13, .6), .045), ((0, .34, .6), .042), ((0, .54, .7), .04), ((0, .62, .88), .04)],
        'curl': [((0, .13, .62), .06), ((0, .27, .73), .06), ((0, .29, .9), .055), ((0, .22, 1.0), .05)],
        'rings': [((0, .13, .6), .08), ((0, .33, .62), .105), ((0, .53, .62), .1), ((0, .7, .6), .085)],
        'otter': [((0, .13, .6), .1), ((0, .38, .55), .085), ((0, .62, .42), .055), ((0, .76, .33), .03)],
        'wisp': [((0, .03, .52), .2), ((0, .08, .36), .14), ((0, .16, .22), .085), ((0, .27, .1), .03)],
        'none': [((0, .13, .6), .02), ((0, .16, .6), .02)],
    }[kind])


def tail_part(P, mats):
    path = tail_path(P)
    kind = P['tail']
    length = [(Vector(b[0]) - Vector(a[0])).length for a, b in zip(path, path[1:])] or [.05]
    total = sum(length)

    def weights(co):
        """Blend the tail bones by how far along the tail this point is."""
        best, along, run = 1e9, 0.0, 0.0
        for (a, _), (b, _), seg in zip(path, path[1:], length):
            va, vb = Vector(a), Vector(b)
            t = max(0.0, min(1.0, (Vector(co) - va).dot(vb - va) / max(seg * seg, 1e-9)))
            d = (Vector(co) - (va + (vb - va) * t)).length
            if d < best:
                best, along = d, (run + t * seg) / total
            run += seg
        w = {f'tail_{i + 1}': max(0.0, 1 - abs(along - (i + .5) / TAIL_BONES) * TAIL_BONES) for i in range(TAIL_BONES)}
        total_w = sum(w.values()) or 1.0
        return {k: v / total_w for k, v in w.items() if v > 0}

    def build(bm):
        if kind == 'puff':
            ao.ellipsoid(bm, (0, .2, .6), (.1, .115, .1), segs=24, rings=16)
            return
        sweep_tube(bm, path)

    tail = mesh_part('tail', mats['fur'], 'tail_1', build, weights)
    patches = []
    if kind == 'bush':
        end = Vector(path[-1][0])
        patches.append((mats['light'], lambda p: (Vector(p) - end).length - .13))
    elif kind == 'rings':
        for z in (.34, .5, .66):
            patches.append((mats['dark'], lambda p, z=z: abs(p.y - z) - .045))
    elif kind == 'curl':
        patches.append((mats['light'], lambda p: .93 - p.z + .0))
    elif kind == 'cat':
        patches.append((mats['dark'], lambda p: .52 - p.y if p.y > .45 else 1))
    if patches:
        ao.paint(tail, mats['fur'], patches)
    return tail


def outfit_parts(P, mats):
    """Boots, collar, bow tie, cuffs, belt, pockets and badge: the uniform's loose details."""
    b = P['bulk']
    out = []
    for s in (-1, 1):
        side = 'L' if s > 0 else 'R'
        foot = f'foot_{side}'
        out.append(mesh_part(f'boot_{side}', mats['boots'], foot, lambda bm, s=s: ao.ellipsoid(
            bm, (s * .1 * b, -.05, .082), (.088, .15, .078), segs=28, rings=18)))
        out.append(mesh_part(f'sole_{side}', mats['sole'], foot, lambda bm, s=s: ao.box(
            bm, (s * .1 * b, -.05, .024), (.15, .255, .03), bevel=.013)))
        out.append(mesh_part(f'cuff_{side}', mats['cloth_light'], f'forearm_{side}', lambda bm, s=s: ao.torus(
            bm, (s * .2947, -.0526, .59), .061, .0115, rot=(0, 0, 0), n=24, m=8)))
    plain = P.get('plain')
    chest_front = lambda x, z: -.16 * b * math.sqrt(max(0.0, 1 - (x / (.215 * b)) ** 2 - ((z - .84) / .215) ** 2))

    def collar(bm):
        verts = ao.torus(bm, (0, -.006, .982), .112 * b, .022, n=32, m=10)
        bmesh.ops.scale(bm, vec=(1, .92, 1), space=Matrix.Translation((0, .006, -.982)), verts=verts)

    out.append(mesh_part('collar', mats['cloth_light'], 'neck', collar))

    if not plain:
        def bow(bm):
            y = chest_front(0, .955) - .012
            for s in (-1, 1):
                ao.ellipsoid(bm, (s * .042, y, .955), (.044, .016, .028), (0, 0, s * .25), segs=16, rings=10)
            ao.ellipsoid(bm, (0, y - .004, .955), (.017, .014, .019), segs=12, rings=8)

        out.append(mesh_part('bow_tie', mats['accent'], 'chest', bow))

        out.append(mesh_part('buckle', mats['trim'], 'pelvis', lambda bm: ao.box(
            bm, (0, .006 - .158 * b - .01, .663), (.04, .008, .03), bevel=.003)))
        for s in (-1, 1):
            out.append(mesh_part('pocket', mats['cloth_light'], 'chest', lambda bm, s=s: ao.box(
                bm, (s * .105 * b, chest_front(s * .105 * b, .8) + .002, .8), (.09, .014, .08), bevel=.006)))
        out.append(mesh_part('badge', mats['white'], 'chest', lambda bm: ao.box(
            bm, (-.108 * b, chest_front(-.108 * b, .905) + .0, .905), (.072, .012, .036), bevel=.005)))
        out.append(mesh_part('badge_ink', mats['ink'], 'chest', lambda bm: ao.box(
            bm, (-.108 * b, chest_front(-.108 * b, .905) - .008, .905), (.046, .006, .01), bevel=.002)))
        for z in (.74, .8, .86):
            out.append(mesh_part('button', mats['trim'], 'chest', lambda bm, z=z: ao.ellipsoid(
                bm, (.0, chest_front(0, z) - .003, z), (.011, .007, .011), segs=10, rings=6)))
    return out


def prop_parts(mats):
    """A mug, a phone and a clipboard. Each waits inside the torso (animal_rig.PROP_REST) until a clip carries it to a hand."""
    out = []
    cx, cy, cz = PROP_REST['cup']

    def cup(bm):
        ao.cylinder(bm, (cx, cy, cz - .045), (cx, cy, cz + .045), .043, .048, segs=28)

    out.append(mesh_part('cup', mats['white'], 'prop_cup', cup))
    out.append(mesh_part('cup_band', mats['accent'], 'prop_cup', lambda bm: ao.cylinder(
        bm, (cx, cy, cz - .008), (cx, cy, cz + .02), .0452, .0462, segs=28)))
    out.append(mesh_part('cup_handle', mats['white'], 'prop_cup', lambda bm: ao.torus(
        bm, (cx + .053, cy, cz), .024, .008, rot=(math.pi / 2, 0, 0), n=18, m=6)))
    out.append(mesh_part('cup_coffee', mats['dark'], 'prop_cup', lambda bm: ao.cylinder(
        bm, (cx, cy, cz + .04), (cx, cy, cz + .046), .04, .04, segs=24)))
    px, py, pz = PROP_REST['phone']
    out.append(mesh_part('phone', mats['ink'], 'prop_phone', lambda bm: ao.box(
        bm, (px, py, pz), (.07, .015, .135), bevel=.008)))
    out.append(mesh_part('phone_screen', mats['accent'], 'prop_phone', lambda bm: ao.box(
        bm, (px, py - .008, pz), (.058, .003, .118), bevel=.002)))
    qx, qy, qz = PROP_REST['pad']
    out.append(mesh_part('pad', mats['trim'], 'prop_pad', lambda bm: ao.box(
        bm, (qx, qy, qz), (.17, .014, .23), bevel=.006)))
    out.append(mesh_part('pad_paper', mats['white'], 'prop_pad', lambda bm: ao.box(
        bm, (qx, qy - .008, qz - .004), (.145, .004, .195), bevel=.001)))
    for i, w in enumerate((.1, .08, .105, .06)):
        out.append(mesh_part('pad_line', mats['ink'], 'prop_pad', lambda bm, i=i, w=w: ao.box(
            bm, (qx - .02 + (w - .1) / 2, qy - .0105, qz + .06 - i * .04), (w, .002, .008), bevel=.0008)))
        out.append(mesh_part('pad_tick', mats['accent'], 'prop_pad', lambda bm, i=i: ao.box(
            bm, (qx - .056, qy - .0105, qz + .06 - i * .04), (.014, .002, .014), bevel=.0006)))
    return out


def create(species):
    """(skin, loose parts): the fused body, and each separate piece with its own bone weights."""
    P = PROFILES[species]
    mats = materials(P)
    lay = layout(P)
    skin = body_skin(P, mats)
    if P.get('undead'):
        from animal_forms import undead_parts
        parts = undead_parts(P, mats, lay)
    else:
        mouths = mouth_parts(P, mats, lay)
        surface = BVHTree.FromPolygons([v.co for v in skin.data.vertices], [list(p.vertices) for p in skin.data.polygons])
        for part in mouths:
            for vertex in part.data.vertices:
                x, _, z = vertex.co
                hit, *_ = surface.ray_cast(Vector((x, -2, z)), Vector((0, 1, 0)))
                assert hit is not None, 'Mouth misses the face'
                vertex.co.y += hit.y - front_y(P, x, z)
        parts = eye_parts(P, mats, lay) + mouths + nose_and_whiskers(P, mats, lay)
    parts += ear_parts(P, mats) + ([tail_part(P, mats)] if P['tail'] != 'none' else [])
    parts += outfit_parts(P, mats) + prop_parts(mats)
    return skin, parts, lay
