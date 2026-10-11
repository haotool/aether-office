import { useMemo } from 'react';
import type { DeskProfile } from '../desks/desk-profile.js';
import { deskItemsGeometry, deskItemsMaterial } from '../desks/desk-items.js';

export function DeskItems({ profile }: { profile: DeskProfile }) {
  const geometry = useMemo(() => deskItemsGeometry(profile.items, profile.sticky), [profile]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={deskItemsMaterial()} dispose={null} />;
}
