"""The two figures that are not animals: a jiangshi (the hopping corpse of Chinese stories, for a session whose process
is a zombie) and a lonely ghost (for one whose parent has gone). Both are built on the animals' skeleton, so the same
pipeline weights, bakes, exports and animates them; the scene tells them apart by file name."""
import math
from animal_geometry import HEAD_CENTRE, front_y, materials, mesh_part, smooth_path, ao, ellipsoids
import bmesh

GHOST_TAIL = smooth_path([((0, .03, .52), .2), ((0, .08, .36), .14), ((0, .16, .22), .085), ((0, .27, .1), .03)])


def undead_parts(P, mats, lay):
    """A jiangshi's face and hat: a talisman where the eyes were, fangs, an official's hat. All on the head bone."""
    cx, cy, cz = HEAD_CENTRE
    out = []
    out.append(mesh_part('hat', mats['hat'], 'head', lambda bm: ao.cylinder(
        bm, (0, cy + .01, cz + .15), (0, cy + .01, cz + .36), .235, .165, segs=32)))
    out.append(mesh_part('hat_band', mats['seal'], 'head', lambda bm: ao.torus(
        bm, (0, cy + .01, cz + .165), .232, .018, n=36, m=8)))
    out.append(mesh_part('hat_button', mats['seal'], 'head', lambda bm: ao.ellipsoid(
        bm, (0, cy + .01, cz + .385), (.035, .035, .035), segs=14, rings=10)))
    face_y = front_y(P, 0, cz + .02) - .012
    out.append(mesh_part('talisman', mats['talisman'], 'head', lambda bm: ao.box(
        bm, (0, face_y, cz + .1), (.13, .008, .3), bevel=.002)))
    for z in (.17, .1, .03):  # the red seal script, as bars
        out.append(mesh_part('seal_bar', mats['seal'], 'head', lambda bm, z=z: ao.box(
            bm, (0, face_y - .006, cz + z), (.075, .005, .018), bevel=.001)))
    out.append(mesh_part('seal_line', mats['seal'], 'head', lambda bm: ao.box(
        bm, (0, face_y - .006, cz + .1), (.014, .005, .24), bevel=.001)))
    out.append(mesh_part('robe_skirt', mats['cloth'], 'pelvis', lambda bm: ao.cylinder(
        bm, (0, .0, .84), (0, .0, .17), .2, .31, segs=40, cap=False)))
    out.append(mesh_part('robe_hem', mats['seal'], 'pelvis', lambda bm: ao.torus(
        bm, (0, .0, .18), .295, .012, n=40, m=8)))
    out.append(mesh_part('rank_badge', mats['talisman'], 'chest', lambda bm: ao.box(
        bm, (0, -.165, .86), (.1, .01, .1), bevel=.004)))
    mx, my, mz = lay['mouth']
    out.append(mesh_part('mouth', mats['ink'], 'head', lambda bm: ao.ellipsoid(
        bm, (0, my + .004, mz - .01), (.052, .018, .03), segs=18, rings=10)))
    for s in (-1, 1):
        out.append(mesh_part('fang', mats['white'], 'head', lambda bm, s=s: ao.cylinder(
            bm, (s * .02, my - .004, mz + .008), (s * .02, my - .012, mz - .05), .011, .0015, segs=10)))
    nx, ny, nz = lay['nose']
    out.append(mesh_part('nose_hole', mats['ink'], 'head', lambda bm: ao.ellipsoid(
        bm, (0, ny, nz - .01), (.022, .012, .014), segs=12, rings=8)))
    return out


def ghost_create():
    """(skin, parts, lay) of a floating ghost: a sheet with a scalloped hem, a hollow face, a trailing wisp."""
    from animal_geometry import tail_part
    mats = materials({'fur': '#E3EEFF', 'light': '#FFFFFF', 'dark': '#9DB4D4', 'accent': '#9DB4D4', 'ear_inner': '#E3EEFF',
                      'nose_color': '#101820'})
    bm = bmesh.new()
    E = lambda c, r, rot=(0, 0, 0): ao.ellipsoid(bm, c, r, rot, segs=36, rings=22)
    E((0, -.01, 1.2), (.27, .25, .25))
    E((0, 0, .9), (.29, .27, .32))
    E((0, .005, .68), (.28, .26, .24))
    for s in (-1, 1):
        ao.limb(bm, (s * .25, -.02, .98), (s * .31, -.26, .9), .066, .054, segs=24, rings=14)
        E((s * .31, -.29, .89), (.07, .07, .07))
    skin = ao.mesh_object('skin', bm, [mats['ghost']])
    ao.fuse(skin, voxel=.009, smooth=8, quads=5000)
    ao.paint(skin, mats['ghost'], [])
    parts = []
    for s in (-1, 1):  # hollow eyes
        parts.append(mesh_part('eye', mats['ink'], 'head', lambda b, s=s: ao.ellipsoid(
            b, (s * .1, -.235, 1.23), (.056, .03, .086), (0, 0, -s * .1), segs=20, rings=12)))
    parts.append(mesh_part('mouth', mats['ink'], 'head', lambda b: ao.ellipsoid(
        b, (0, -.247, 1.08), (.048, .026, .075), segs=20, rings=12)))
    parts.append(tail_part({'tail': 'wisp', 'fur': '#E3EEFF', 'light': '#FFFFFF'}, {**mats, 'fur': mats['ghost']}))
    lay = {'eye': (.1, -.235, 1.23), 'nose': (0, -.25, 1.15), 'mouth': (0, -.247, 1.08), 'mouth_half': .04}
    return skin, parts, lay
