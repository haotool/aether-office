import type { CSSProperties } from 'react';
import { DEPARTMENTS } from '@aether/kernel';

/**
 * What the building shows of one floor's KPIs: strings the page has already formatted (the scene knows no number
 * formats) and the floor's share of the busiest floor today for the mini bar.
 */
export type FloorKpiBadge = {
  /** Tokens used today, compact (`1.2M`). */
  tokens: string;
  /** 0 to 1: this floor's tokens today against the busiest floor's. */
  share: number;
  /** Tokens per active minute today, when there was activity (`24K/min`). */
  rate: string | null;
  /** Branches merged in the last week, when known. */
  merged: string | null;
  labels: { tokens: string; merged: string };
};

/** The line on a deck of the floor switcher: today's tokens, a bar against the busiest deck, the rate. */
export function SlabKpi({ badge }: { badge: FloorKpiBadge }) {
  return (
    <small className="slab-kpi" style={{ ['--share' as string]: badge.share } as CSSProperties}>
      <b>{badge.tokens}</b>
      <u aria-hidden="true" />
      {badge.rate && <em>{badge.rate}</em>}
    </small>
  );
}

/**
 * The floor's plaque over the scene: today's tokens and merged branches of the floor on show, a button that opens the
 * floor's dashboard. Plain DOM (no per-frame work); the page decides when to draw it (never on a phone).
 */
export function FloorPlaque({
  zh,
  floor,
  badge,
  onOpen,
}: {
  zh: boolean;
  floor: number;
  badge: FloorKpiBadge;
  onOpen: (floor: number) => void;
}) {
  const department = DEPARTMENTS[floor]!;
  return (
    <button
      className="floor-plaque fui"
      style={{ ['--accent' as string]: department.accent }}
      aria-label={`${floor + 1}F ${zh ? department.zh : department.en}: ${badge.labels.tokens} ${badge.tokens}`}
      onClick={() => onOpen(floor)}
    >
      <span className="plaque-floor">{floor + 1}F</span>
      <span className="plaque-metric">
        <small>{badge.labels.tokens}</small>
        <b>{badge.tokens}</b>
      </span>
      {badge.merged !== null && (
        <span className="plaque-metric">
          <small>{badge.labels.merged}</small>
          <b>{badge.merged}</b>
        </span>
      )}
    </button>
  );
}
