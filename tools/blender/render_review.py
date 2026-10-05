"""Renders each animal seated and typing at its desk from the front and the side, for a look at proportions and contact.

    blender --background --factory-startup --python tools/blender/render_review.py -- --out DIR [--species fox,cat] [--clip typing]
"""
import sys
import argparse
import math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Vector
import build_animals as build
import animal_clips as clips_module
import audit_animals as audit
from animal_profiles import PROFILES

VIEWS = {'front': (.9, -1.9, 1.0), 'side': (2.1, -.15, .85), 'back': (-.8, 2.2, .9)}


def box(name, lo, hi):
    bpy.ops.mesh.primitive_cube_add()
    o = bpy.context.object
    o.name = name
    o.location = [(a + b) / 2 for a, b in zip(lo, hi)]
    o.scale = [(b - a) / 2 for a, b in zip(lo, hi)]
    return o


def furniture():
    for name, (lo, hi) in audit.BOXES.items():
        box(name, lo, hi)


def render(path, eye, target=(0, -.1, .75)):
    scene = bpy.context.scene
    cam = bpy.data.objects.get('ReviewCam') or bpy.data.objects.new('ReviewCam', bpy.data.cameras.new('ReviewCam'))
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    cam.location = eye
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 45
    scene.camera = cam
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--species', default=','.join(PROFILES))
    parser.add_argument('--clip', default='typing')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(options.out)
    out.mkdir(parents=True, exist_ok=True)
    for species in options.species.split(','):
        mesh, rig, _ = build.assemble(species)
        scene = bpy.context.scene
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.render.resolution_x, scene.render.resolution_y = 560, 560
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'TEXTURE'
        scene.world = bpy.data.worlds.new('w') if not scene.world else scene.world
        scene.world.color = (.1, .13, .17)
        furniture()
        clips_module.pose_rig(rig, clips_module.clips_for(species)[options.clip][1](.5))
        bpy.context.view_layer.update()
        for view, eye in VIEWS.items():
            render(out / f'{species}-{view}.png', eye)
        for o in [o for o in bpy.data.objects if o.name.split('.')[0] in audit.BOXES]:
            bpy.data.objects.remove(o)
