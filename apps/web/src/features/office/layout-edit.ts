import type { Furniture, Layout } from '@aether/contracts';

/** Furniture other than a squad zone, which has its own fields. */
export type PlainFurniture = Exclude<Furniture['type'], 'squad'>;

/** The layout without the object, and without the squad zone anchored to it. */
export function withoutObject(layout: Layout, id: string): Layout {
  return {
    ...layout,
    objects: layout.objects.filter((o) => o.id !== id && !(o.type === 'squad' && o.anchor === id)),
  };
}

/** The layout with the update merged into the one object. */
export function withPatchedObject(layout: Layout, id: string, update: Partial<Furniture>): Layout {
  return {
    ...layout,
    objects: layout.objects.map((o) => (o.id === id ? ({ ...o, ...update } as Furniture) : o)),
  };
}
