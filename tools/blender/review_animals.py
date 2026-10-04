"""Contact sheets for looking at the animals while modelling (scratch renders, never in the repo).

    blender --background --factory-startup --python tools/blender/review_animals.py -- --species fox [--clips idle,typing] [--views front,side]
Sheets land in $AO_SHOTS (default: the system temp folder, ao-shots/).
"""
import sys
import argparse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import build_animals as build
from animal_profiles import PROFILES
ALL = [*PROFILES, 'ghost']
from animal_rig import ao

VIEWS = {'front': (0, -1, .25), 'side': (1, 0, .2), 'tq': (-.75, -1, .45), 'back': (0, 1, .3)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--species', default='fox')
    parser.add_argument('--views', default='front,tq,side,back')
    parser.add_argument('--clips', default='')
    parser.add_argument('--zoom', default='full', choices=['full', 'head', 'upper'])
    parser.add_argument('--at', type=float, default=.5, help='how far through each clip (0..1)')
    parser.add_argument('--lineup', action='store_true', help='one tile per species instead of one species from several views')
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if options.lineup:
        view = options.views.split(',')[0]
        target, dist = ((0, 0, 1.18), 1.15) if options.zoom == 'head' else ((0, 0, .72), 3.1)
        print('SHEET', ao.sheet(f'lineup_{options.zoom}', [(lambda sp=sp: build.assemble(sp), view) for sp in ALL],
                                cell=(480, 600), target=target, dist=dist), flush=True)
        sys.exit(0)
    if options.clips:
        import animal_clips as clips_module
        mesh, rig, lay = build.assemble(options.species)
        table = clips_module.clips_for(options.species)
        view = options.views.split(',')[0]
        target, dist = {'head': ((0, 0, 1.18), 1.15), 'upper': ((0, 0, .95), 1.9)}.get(options.zoom, ((0, 0, .75), 3.2))
        shots = [(lambda name=name, t=t: clips_module.pose_rig(rig, table[name][1](t)), view)
                 for name in options.clips.split(',') for t in ([options.at] if options.at >= 0 else [.15, .4, .65, .9])]
        print('SHEET', ao.sheet(f'{options.species}_clips', shots, cell=(480, 600), target=target, dist=dist), flush=True)
        sys.exit(0)
    for species in ALL if options.species == 'all' else [options.species]:
        mesh, rig, lay = build.assemble(species)
        target, dist = ((0, 0, 1.18), 1.15) if options.zoom == 'head' else ((0, 0, .72), 3.1)
        ao.VIEWS.update(VIEWS) if hasattr(ao, 'VIEWS') else None
        shots = [(None, v) for v in options.views.split(',')]
        print('SHEET', ao.sheet(f'{species}_{options.zoom}', shots, cell=(480, 600), target=target, dist=dist), flush=True)
