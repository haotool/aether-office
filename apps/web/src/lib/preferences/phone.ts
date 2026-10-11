import { useSyncExternalStore } from 'react';

const PHONE_QUERY = '(max-width: 760px) and (min-height: 501px)';
const PHONE_ANY_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)';

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

export const usePhone = () => useSyncExternalStore(portrait.subscribe, portrait.get);
export const usePhoneAny = () => useSyncExternalStore(any.subscribe, any.get);
