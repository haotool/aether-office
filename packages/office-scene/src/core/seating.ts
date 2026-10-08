import RAW from '../desks/desk-seating.json';

type V3 = [number, number, number];
type Block = { size: V3; at: V3 };

/** A size or position of the JSON as the point it is: the file is read once, and a malformed one stops the scene at load. */
function point([x, y, z]: number[]): V3 {
  if (x === undefined || y === undefined || z === undefined)
    throw new Error('desk-seating.json: a size or position needs three numbers');
  return [x, y, z];
}
const block = (b: { size: number[]; at: number[] }): Block => ({
  size: point(b.size),
  at: point(b.at),
});

/**
 * The workstation's furniture in the desk's own frame (metres, y up, the member sits at +z facing -z), from
 * desk-seating.json: the one source for the scene and for the animal audit (tools/blender/audit_animals.py), so a character
 * is checked against the chair and desk it is really given.
 */
export const SEATING = {
  slab: block(RAW.slab),
  bar: block(RAW.bar),
  pedestal: { ...RAW.pedestal, at: point(RAW.pedestal.at) },
  seat: block(RAW.seat),
  cushion: block(RAW.cushion),
  back: block(RAW.back),
  sitter: RAW.sitter,
  screenY: RAW.screenY,
};

/** The desk's working surface: the top of the slab, where the monitor's things and the supervisor's stand. */
export const SLAB_TOP = SEATING.slab.at[1] + SEATING.slab.size[1] / 2;
