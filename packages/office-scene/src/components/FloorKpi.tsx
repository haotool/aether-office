import type { CSSProperties } from 'react';
import { departmentAt } from '../scene/scene-geometry.js';

export type FloorKpiBadge = {
  tokens: string;
  share: number;
  rate: string | null;
  merged: string | null;
  labels: { tokens: string; merged: string };
};

export function SlabKpi({ badge }: { badge: FloorKpiBadge }) {
  return (
    <small className="slab-kpi" style={{ ['--share' as string]: badge.share } as CSSProperties}>
      <b>{badge.tokens}</b>
      <u aria-hidden="true" />
      {badge.rate && <em>{badge.rate}</em>}
    </small>
  );
}

/** Plain DOM (no per-frame work); the page decides when to draw it (never on a phone). */
export function FloorPlaque({
  floor,
  badge,
  onOpen,
}: {
  floor: number;
  badge: FloorKpiBadge;
  onOpen: (floor: number) => void;
}) {
  const department = departmentAt(floor);
  return (
    <button
      className="floor-plaque fui"
      style={{ ['--accent' as string]: department.accent }}
      onClick={() => onOpen(floor)}
    >
      <span className="plaque-floor">{floor + 1}F </span>
      <span className="plaque-metric">
        <small>{badge.labels.tokens} </small>
        <b>{badge.tokens} </b>
      </span>
      {badge.merged !== null && (
        <span className="plaque-metric">
          <small>{badge.labels.merged} </small>
          <b>{badge.merged}</b>
        </span>
      )}
    </button>
  );
}
