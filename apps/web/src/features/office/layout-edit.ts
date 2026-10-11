import type { Furniture, Layout } from '@aether/contracts';

export type PlainFurniture = Exclude<Furniture['type'], 'squad'>;

export function withoutObject(layout: Layout, id: string): Layout {
  return {
    ...layout,
    objects: layout.objects.filter((o) => o.id !== id && !(o.type === 'squad' && o.anchor === id)),
  };
}

export function withPatchedObject(layout: Layout, id: string, update: Partial<Furniture>): Layout {
  return {
    ...layout,
    objects: layout.objects.map((o) => (o.id === id ? ({ ...o, ...update } as Furniture) : o)),
  };
}
