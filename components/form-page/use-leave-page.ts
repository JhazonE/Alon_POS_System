'use client';

import { useRouter } from 'next/navigation';

/**
 * Where the New / Edit pages go after a save or Cancel: back to wherever the
 * user came from (a list, the Products page, the dashboard); a directly opened
 * URL has no history to go back to, so fall back to `fallbackHref`.
 */
export function useLeavePage(fallbackHref: string) {
  const router = useRouter();
  return () => {
    if (window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };
}
