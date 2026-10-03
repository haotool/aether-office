"""Honest Cycles render of the saved source, with device/samples/time/checksums."""
import bpy
import sys
import argparse
import hashlib
import json
import time
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--species',default='fox');parser.add_argument('--width',type=int,default=1280);parser.add_argument('--height',type=int,default=960);parser.add_argument('--samples',type=int,default=32)
options=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=ROOT/'assets-source/animals'/f'{options.species}.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=options.samples;scene.cycles.use_denoising=True
scene.render.resolution_x=options.width;scene.render.resolution_y=options.height;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.14,.21,.23,1);scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.3
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));ground=bpy.context.object;ground.name='Studio floor'
mat=bpy.data.materials.new('Studio graphite');mat.diffuse_color=(.12,.18,.19,1);mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.12,.18,.19,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.83;ground.data.materials.append(mat)
for name,position,power,size,color in [('Key',(-3,-4,4.5),500,3.0,(1,.88,.74)),('Fill',(3,-2,2.0),250,3.0,(.7,.88,1)),('Rim',(1,3,3.5),600,2.0,(.64,1,1))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(Vector((0,0,.8))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Portrait');camera=bpy.data.objects.new('Portrait',data);scene.collection.objects.link(camera);camera.location=(2.1,-3.5,1.65);camera.rotation_euler=(Vector((0,0,.77))-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=1.8*options.width/options.height;scene.camera=camera
folder=ROOT/'evidence/renders';folder.mkdir(parents=True,exist_ok=True);output=folder/f'{options.species}-{options.width}x{options.height}.png';scene.render.filepath=str(output)
started=time.time();bpy.ops.render.render(write_still=True)
record={'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'output':str(output.relative_to(ROOT)),'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'resolution':[options.width,options.height],'nativeResolution':True,'engine':'Cycles','device':'CPU','samples':options.samples,'denoise':True,'camera':{'position':list(camera.location),'rotation':list(camera.rotation_euler),'orthographicScale':data.ortho_scale},'renderSeconds':time.time()-started,'blender':bpy.app.version_string}
output.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n');print('AETHER_RENDER_COMPLETE '+json.dumps(record),flush=True)
