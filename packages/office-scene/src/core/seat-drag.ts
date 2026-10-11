import type { Layout } from '@aether/contracts';
import { validateLayout } from '@aether/kernel';

const SEAT_GRID = 0.5;
export const snapSeat = (v: number) => Math.round(v / SEAT_GRID) * SEAT_GRID;

export type SeatReason = 'bounds' | 'aisle' | 'occupied' | 'invalid';
export type SeatCheck = { ok: true } | { ok: false; reason: SeatReason };

const REASONS: Record<string, SeatReason> = {
  LAYOUT_OUT_OF_BOUNDS: 'bounds',
  LAYOUT_BLOCKS_AISLE: 'aisle',
  LAYOUT_OVERLAP: 'occupied',
};

export function movedTo(layout: Layout, objectId: string, x: number, z: number): Layout {
  return {
    ...layout,
    objects: layout.objects.map((o) => (o.id === objectId ? { ...o, x, z } : o)),
  };
}

export function checkSeat(layout: Layout, objectId: string, x: number, z: number): SeatCheck {
  try {
    validateLayout(movedTo(layout, objectId, x, z).objects);
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    return { ok: false, reason: REASONS[code] ?? 'invalid' };
  }
}
