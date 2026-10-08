import { useState } from 'react';

type Density = 'comfortable' | 'compact';
const STORAGE_KEY = 'aether.convDensity';

const load = (): Density => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
};

/** How tightly the conversation is set, kept in this browser only; storage that is refused just means it starts comfortable. */
export function useConvDensity(): [Density, () => void] {
  const [density, setDensity] = useState<Density>(load);
  const toggle = () => {
    const next: Density = density === 'compact' ? 'comfortable' : 'compact';
    setDensity(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice lasts for this page */
    }
  };
  return [density, toggle];
}
