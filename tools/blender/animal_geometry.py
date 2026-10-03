"""Original AETHER animal silhouettes built with audited upstream MIT primitives."""
import bpy
import bmesh
import math
from animal_rig import ao

PROFILES = {
    'fox': {'fur':'#CB7544','light':'#F4DEBA','head':(.235,.195,.20),'ears':'point','tail':'bush'},
    'rabbit': {'fur':'#EEE6DC','light':'#FFF5EA','head':(.205,.183,.19),'ears':'long','tail':'puff'},
    'panda': {'fur':'#ECE8DE','light':'#FAF1E2','head':(.26,.212,.21),'ears':'round','tail':'puff'},
    'cat': {'fur':'#879596','light':'#E7DACE','head':(.235,.19,.205),'ears':'point','tail':'cat'},
    'dog': {'fur':'#C7955E','light':'#F4DFC2','head':(.242,.208,.202),'ears':'point','tail':'curl'},
    'raccoon': {'fur':'#8F958E','light':'#E8E2D2','head':(.244,.201,.194),'ears':'round','tail':'rings'},
    'otter': {'fur':'#947451','light':'#E8D7BA','head':(.246,.205,.175),'ears':'small','tail':'otter'},
    'bear': {'fur':'#8A6249','light':'#D8BA91','head':(.26,.219,.211),'ears':'round','tail':'puff'},
}


def pbr(name, color, roughness=.7, fur=False):
    material = ao.material(name, color)
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = material.diffuse_color
    node.inputs['Roughness'].default_value = roughness
    if fur:
        noise = material.node_tree.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 180
        noise.inputs['Detail'].default_value = 2
        bump = material.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .18
        bump.inputs['Distance'].default_value = .012
        material.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
        material.node_tree.links.new(bump.outputs['Normal'], node.inputs['Normal'])
    return material


def create(species):
    profile = PROFILES[species]
    materials = {
        'fur':pbr('Fur',profile['fur'],.84,True), 'light':pbr('Cream',profile['light'],.88,True),
        'ink':pbr('Ink','#233137',.42), 'nose':pbr('Nose','#2E3231',.29),
        'pink':pbr('EarPink','#C88F88',.88), 'cloth':pbr('Uniform','#466F73',.9,True),
        'pants':pbr('Trousers','#344952',.86), 'trim':pbr('Trim','#DCBB85',.42),
        'white':pbr('EyeGlint','#F9F8ED',.22),
    }
    parts=[]
    def part(name,mat,bone,builder):
        bm=bmesh.new();builder(bm);ob=ao.mesh_object(name,bm,[materials[mat]])
        ob.vertex_groups.new(name=bone).add(list(range(len(ob.data.vertices))),1,'REPLACE');parts.append(ob);return ob
    def sphere(name,mat,bone,center,radii,rot=(0,0,0)):
        return part(name,mat,bone,lambda bm:ao.ellipsoid(bm,center,radii,rot,segs=24,rings=16))
    def limb(name,mat,bone,a,b,ra,rb):
        return part(name,mat,bone,lambda bm:ao.limb(bm,a,b,ra,rb,segs=18,rings=14))
    def box(name,mat,bone,center,size,radius=.01):
        return part(name,mat,bone,lambda bm:ao.box(bm,center,size,bevel=radius))
    sphere('pelvis','pants','pelvis',(0,0,.59),(.15,.125,.16))
    sphere('jacket','cloth','chest',(0,0,.81),(.195,.137,.23))
    sphere('neck','light','neck',(0,0,1.015),(.10,.09,.09))
    sphere('head','fur','head',(0,-.008,1.18),profile['head'])
    # A proper muzzle is shaped differently across species, not a recoloured common face.
    muzzle={'fox':(.112,.115,.09),'rabbit':(.082,.075,.062),'cat':(.10,.074,.065),'dog':(.135,.10,.085),'raccoon':(.133,.08,.065),'otter':(.15,.075,.07),'panda':(.12,.078,.088),'bear':(.13,.085,.09)}[species]
    sphere('muzzle','light','head',(0,-.188,1.115),muzzle)
    if species in ['fox','dog']:
        for s in [-1,1]:sphere(f'cheek{s}','light','head',(s*.15,-.125,1.135),(.088,.09,.082))
    sphere('nose','nose','head',(0,-.188-muzzle[1]+.006,1.14),(.032,.021,.024))
    # Mouth and brow shapes are physical mesh details, visible in close-up.
    for s in [-1,1]:
        side='L' if s>0 else 'R';bone='ear_'+side
        if profile['ears']=='long':
            sphere('ear_'+side,'fur',bone,(s*.125,.005,1.365),(.069,.048,.13),(0,s*-.13,0))
            sphere('inner_'+side,'pink',bone,(s*.125,-.037,1.366),(.036,.008,.103),(0,s*-.13,0))
        elif profile['ears']=='point':
            points=[(-.085,0),(.085,0),(.04,.20),(-.035,.18)]
            part('ear_'+side,'fur',bone,lambda bm,s=s:ao.outline(bm,points,.082,center=(s*.15,.015,1.28),bevel=.022))
            part('inner_'+side,'pink',bone,lambda bm,s=s:ao.outline(bm,[(-.047,0),(.047,0),(.022,.12)],.008,center=(s*.15,-.032,1.315),bevel=.008))
        else:
            radius=.09 if profile['ears']=='round' else .062
            sphere('ear_'+side,'ink' if species=='panda' else 'fur',bone,(s*.193,0,1.343),(radius,.055,radius))
            sphere('inner_'+side,'pink' if species!='panda' else 'ink',bone,(s*.193,-.05,1.343),(radius*.57,.009,radius*.59))
        if species in ['panda','raccoon']:
            sphere('mask_'+side,'ink','head',(s*.103,-.178,1.218),(.089,.036,.073),(0,s*.35,0))
        sphere('eye_white_'+side,'light','head',(s*.103,-.191,1.222),(.059,.032,.068))
        sphere('eye_'+side,'ink','head',(s*.103,-.219,1.219),(.035,.018,.044))
        sphere('glint_'+side,'white','head',(s*.103-.009,-.236,1.238),(.010,.007,.014))
        sphere('brow_'+side,'fur','head',(s*.105,-.188,1.282),(.062,.032,.025),(0,s*.1,0))
        limb('mouth_'+side,'ink','head',(0,-.19-muzzle[1],1.09),(s*.035,-.183-muzzle[1],1.105),.006,.005)
        if species in ['cat','otter','raccoon']:
            for n in range(3):
                limb('whisker_'+side+str(n),'light','head',(s*.10,-.225,1.11+n*.012),(s*(.23+n*.009),-.21,1.09+n*.03),.0024,.001)
        limb('sleeve_'+side,'cloth','upper_arm_'+side,(s*.18,0,.95),(s*.25,-.008,.795),.087,.072)
        limb('forearm_'+side,'fur','forearm_'+side,(s*.265,-.015,.77),(s*.29,-.045,.63),.067,.057)
        sphere('paw_'+side,'fur','hand_'+side,(s*.29,-.07,.60),(.065,.068,.075))
        part('cuff_'+side,'cloth','forearm_'+side,lambda bm,s=s:ao.cylinder(bm,(s*.281,-.04,.68),(s*.286,-.045,.649),.062,segs=20))
        limb('thigh_'+side,'pants','thigh_'+side,(s*.095,0,.55),(s*.095,-.01,.32),.085,.074)
        limb('shin_'+side,'pants','shin_'+side,(s*.095,-.01,.31),(s*.095,0,.09),.070,.060)
        sphere('shoe_'+side,'light','foot_'+side,(s*.095,-.055,.069),(.078,.125,.065))
        box('sole_'+side,'ink','foot_'+side,(s*.095,-.055,.026),(.151,.235,.025),.012)
        box('pocket_'+side,'cloth','chest',(s*.105,-.135,.83),(.095,.025,.09),.012)
        box('pocket_trim_'+side,'trim','chest',(s*.105,-.15,.872),(.083,.007,.008),.002)
    box('zipper','trim','chest',(0,-.137,.81),(.011,.01,.31),.002)
    box('badge','white','chest',(-.10,-.155,.925),(.085,.013,.04),.006)
    box('badge_ink','ink','chest',(-.10,-.164,.925),(.053,.008,.013),.002)
    if profile['tail']=='puff':sphere('tail','fur','tail',(0,.164,.59),(.088,.10,.084))
    elif profile['tail']=='bush':
        limb('tail','fur','tail',(0,.115,.59),(0,.50,.67),.095,.14)
        sphere('tail_tip','light','tail',(0,.58,.69),(.126,.17,.116),(-.3,0,0))
    elif profile['tail']=='curl':
        part('tail','fur','tail',lambda bm:ao.torus(bm,(0,.25,.70),.15,.067,rot=(0,math.pi/2,0),n=22,m=9))
        sphere('tail_tip','light','tail',(0,.33,.79),(.067,.095,.073))
    elif profile['tail']=='otter':limb('tail','fur','tail',(0,.10,.60),(0,.59,.40),.115,.022)
    else:
        for n in range(8):
            mat='ink' if n%2==1 else 'fur'
            radius=.05 if profile['tail']=='cat' else .082
            sphere('tail_'+str(n),mat,'tail',(0,.15+n*.057,.59+n*.009),(radius,.067,radius))
    mesh=ao.join(parts[0],parts[1:]);mesh.name=f'Aether_{species}'
    return mesh
