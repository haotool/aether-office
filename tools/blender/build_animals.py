"""Build real .blend + UV/PBR/rigged GLB/LOD assets, never placeholder files.
Run Blender --background --factory-startup --python tools/blender/build_animals.py -- --species fox
"""
import bpy
import math
import sys
import json
import hashlib
import time
import argparse
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from animal_geometry import create, tail_path
from animal_forms import GHOST_TAIL, ghost_create
from animal_clips import clips_for, key_clips
from animal_profiles import PROFILES
from animal_rig import skeleton, ao
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'apps/web/public/assets/animals'
SOURCE=ROOT/'assets-source/animals'
# The baked maps are source material: the shipped GLBs carry their own (WebP) copies, so these stay out of the web root.
TEXTURES=SOURCE/'textures'
BODY_BONES={'pelvis','chest','neck','head',*(f'{b}_{s}' for b in ('upper_arm','forearm','hand','thigh','shin','foot') for s in 'LR')}


def assemble(species):
    """The finished animal in the scene: fused skin with automatic weights, loose parts joined on, skinned to the rig."""
    ao.clear()
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    skin,parts,lay=ghost_create() if species=='ghost' else create(species)
    rig=skeleton(lay,GHOST_TAIL if species=='ghost' else tail_path(PROFILES[species]))
    for bone in rig.data.bones:bone.use_deform=bone.name in BODY_BONES
    bpy.ops.object.select_all(action='DESELECT');skin.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bpy.ops.object.select_all(action='DESELECT');skin.select_set(True);bpy.context.view_layer.objects.active=skin
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL',factor=.5,repeat=3)
    bpy.ops.object.mode_set(mode='OBJECT')
    with bpy.context.temp_override(object=skin,active_object=skin,selected_objects=[skin]):
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
    face=[v.index for v in skin.data.vertices if v.co.z>lay['mouth'][2]-.05 and v.co.y<-.1]
    for group in skin.vertex_groups:group.remove(face)
    skin.vertex_groups['head'].add(face,1,'REPLACE')
    skin.vertex_groups.new(name='FaceDetail').add(face,1,'REPLACE')
    for bone in rig.data.bones:bone.use_deform=True
    mesh=ao.join(skin,parts);mesh.name=f'Aether_{species}'
    return mesh,rig,lay


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def bake(mesh, species, size):
    scene=bpy.context.scene
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12
    scene.render.bake.margin=6
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.018)
    bpy.ops.object.mode_set(mode='OBJECT')
    images={};materials=list(mesh.data.materials)
    for kind in ['base_color','normal','roughness','ao']:
        image=bpy.data.images.new(f'{species}_{kind}',width=size,height=size,alpha=False)
        image.colorspace_settings.name='sRGB' if kind=='base_color' else 'Non-Color'
        nodes=[];old_links=[]
        for material in materials:
            tree=material.node_tree;target=tree.nodes.new('ShaderNodeTexImage');target.image=image
            tree.nodes.active=target;nodes.append((tree,target))
            if kind=='roughness':
                output=next(n for n in tree.nodes if n.type=='OUTPUT_MATERIAL')
                previous=output.inputs['Surface'].links[0].from_socket
                emit=tree.nodes.new('ShaderNodeEmission');value=tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value
                emit.inputs['Color'].default_value=(value,value,value,1)
                tree.links.new(emit.outputs[0],output.inputs['Surface']);old_links.append((tree,previous,output,emit))
        if kind=='base_color':bpy.ops.object.bake(type='DIFFUSE',pass_filter={'COLOR'})
        elif kind=='roughness':bpy.ops.object.bake(type='EMIT')
        elif kind=='normal':bpy.ops.object.bake(type='NORMAL',normal_space='TANGENT')
        else:bpy.ops.object.bake(type='AO')
        image.filepath_raw=str(TEXTURES/f'{species}-{kind}.png');image.file_format='PNG';image.save();image.pack();images[kind]=image
        for tree,previous,output,emit in old_links:tree.links.new(previous,output.inputs['Surface']);tree.nodes.remove(emit)
        for tree,node in nodes:tree.nodes.remove(node)
    group=bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    if not group.interface.items_tree:group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for material in materials:
        tree=material.node_tree;shader=tree.nodes.get('Principled BSDF')
        for kind in ['base_color','normal','roughness','ao']:
            image=tree.nodes.new('ShaderNodeTexImage');image.image=images[kind];image.label=kind
            if kind=='base_color':tree.links.new(image.outputs['Color'],shader.inputs['Base Color'])
            elif kind=='roughness':tree.links.new(image.outputs['Color'],shader.inputs['Roughness'])
            elif kind=='normal':
                normal=tree.nodes.new('ShaderNodeNormalMap');tree.links.new(image.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
            else:
                settings=tree.nodes.new('ShaderNodeGroup');settings.node_tree=group;tree.links.new(image.outputs['Color'],settings.inputs['Occlusion'])
    return images


def export(path, rig):
    rig.animation_data.action=None;ao.pose(rig,ao.Pose())
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_image_format='WEBP',export_image_webp_fallback=False,export_yup=True,export_apply=True,export_texcoords=True,export_cameras=False,export_lights=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_anim_slide_to_zero=True,export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=True,export_reset_pose_bones=True,export_def_bones=True)


def validate_lod(mesh):
    # Collapse can emit duplicate faces on tiny closed parts. Accept only those
    # exact vertex-set duplicates; any other validation repair fails the build.
    seen=set();duplicate_tris=0
    for face in mesh.data.polygons:
        key=tuple(sorted(face.vertices))
        if key in seen:duplicate_tris+=len(face.vertices)-2
        seen.add(key)
    before=ao.tris(mesh)
    mesh.data.validate(verbose=True)
    assert ao.tris(mesh)==before-duplicate_tris,'Unexpected LOD geometry repair'
    assert not mesh.data.validate(),'LOD remains invalid'
    return duplicate_tris



def face_points(mesh):
    face = mesh.vertex_groups['FaceDetail'].index
    return sorted(tuple(v.co) for v in mesh.data.vertices if any(g.group == face for g in v.groups))


def build(species, size):
    started=time.time();bpy.context.preferences.filepaths.save_version=0;OUT.mkdir(parents=True,exist_ok=True);TEXTURES.mkdir(parents=True,exist_ok=True)
    mesh,rig,lay=assemble(species);images=bake(mesh,species,size)
    clips=clips_for(species);key_clips(rig,clips)
    for name in ['sit_down','stand_up','turn']:
        if name in bpy.data.actions:bpy.data.actions[name].use_cyclic=False
    source=SOURCE/f'{species}.blend';bpy.ops.wm.save_as_mainfile(filepath=str(source))
    # All nine surfaces were baked into the same UV atlas. A single runtime
    # material preserves their distinct colours/roughness with one draw call.
    runtime=mesh.data.materials[0].copy();runtime.name=f'{species}_PBR'
    mesh.data.materials.clear();mesh.data.materials.append(runtime)
    for polygon in mesh.data.polygons:polygon.material_index=0
    before=ao.tris(mesh);mesh.data.validate();assert ao.tris(mesh)==before,'Validation changed geometry'
    lods=[]
    face=mesh.vertex_groups['FaceDetail'].index
    protected={v.index for v in mesh.data.vertices if any(g.group==face for g in v.groups)}
    face_tris=sum(len(p.vertices)-2 for p in mesh.data.polygons if all(v in protected for v in p.vertices))
    mesh.vertex_groups.new(name='LodBody').add([v.index for v in mesh.data.vertices if v.index not in protected],1,'REPLACE')
    expected_face=face_points(mesh)
    original=mesh.data.copy()
    for lod,ratio in [(0,1),(1,.35),(2,.085)]:
        if lod:
            mesh.data=original.copy();decimate=mesh.modifiers.new('Runtime_LOD','DECIMATE');decimate.ratio=(face_tris+(before-face_tris)*ratio)/before;decimate.use_collapse_triangulate=True
            decimate.vertex_group='LodBody';decimate.vertex_group_factor=1
            while list(mesh.modifiers).index(decimate)>0:
                with bpy.context.temp_override(object=mesh, active_object=mesh):bpy.ops.object.modifier_move_up(modifier=decimate.name)
            bpy.context.view_layer.objects.active=mesh;ao.apply_modifier(mesh,decimate.name)
        if lod==1:
            # Far away animals do not need the close-up texture; every LOD GLB embeds its own copy.
            for image in images.values():image.scale(512,512)
        duplicate_tris=validate_lod(mesh)
        assert face_points(mesh)==expected_face, 'LOD changed facial geometry'
        path=OUT/f'{species}-lod{lod}.glb';export(path,rig)
        lods.append({'level':lod,'file':path.name,'sha256':digest(path),'triangles':ao.tris(mesh),'duplicateTrianglesRemoved':duplicate_tris,'bytes':path.stat().st_size})
    bounds=[list(mesh.matrix_world@Vector(c)) for c in mesh.bound_box]
    manifest={'assetId':species,'version':2,'license':'MIT','provenance':'Original AETHER geometry/animation generated by tools/blender using AgentSystemLabs MIT aokit primitives','source':str(source.relative_to(ROOT)),'sourceSha256':digest(source),'blender':bpy.app.version_string,'metres':True,'upAxis':'glTF Y','bounds':bounds,'uvLayers':len(mesh.data.uv_layers),'materials':[m.name for m in mesh.data.materials],'bones':[b.name for b in rig.data.bones],'clips':list(clips),'sockets':['hand_socket_L','hand_socket_R','head_socket','chest_socket'],'textures':[{'file':f'textures/{Path(bpy.path.abspath(image.filepath_raw)).name}','sha256':digest(bpy.path.abspath(image.filepath_raw)),'colorSpace':image.colorspace_settings.name,'size':[size,size]} for image in images.values()],'lods':lods,'buildSeconds':round(time.time()-started,3),'verificationStatus':'not_run'}
    (OUT/f'{species}.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('AETHER_ASSET_BUILT '+json.dumps({'species':species,'seconds':manifest['buildSeconds'],'lods':lods}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--species',choices=[*PROFILES,'ghost','all'],default='all');parser.add_argument('--texture-size',type=int,default=1024)
    options=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for species in [*PROFILES,'ghost'] if options.species=='all' else [options.species]:build(species,options.texture_size)
