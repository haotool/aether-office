import { useSyncExternalStore } from 'react';

/** A portrait phone: one column, a tab bar at the thumb, the 3D office filling the screen. */
export const PHONE_QUERY = '(max-width: 760px) and (min-height: 501px)';
/** Anything that gets the phone layout, including a phone on its side (no tab bar there: the height is too short). */
export const PHONE_ANY_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';

function watch(query: string) {
  const media = window.matchMedia(query);
  return {
    subscribe: (notify: () => void) => {
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    get: () => media.matches,
  };
}
const portrait = watch(PHONE_QUERY);
const any = watch(PHONE_ANY_QUERY);

/** True on a portrait phone. Follows rotation and window resizes. */
export const usePhone = () => useSyncExternalStore(portrait.subscribe, portrait.get);
/** True on any phone layout, portrait or on its side. */
export const usePhoneAny = () => useSyncExternalStore(any.subscribe, any.get);
