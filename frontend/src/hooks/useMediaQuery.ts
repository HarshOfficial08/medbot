import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribes to a media query.
 *
 * useSyncExternalStore rather than useState + useEffect: matchMedia is
 * an external store, which is exactly what this hook exists for
 * (CLAUDE.md — an Effect is for syncing with something outside React).
 *
 * `subscribe` is memoised on `query`. An inline closure would make
 * React tear down and re-add the listener on every render, and a
 * `change` firing inside that window is simply lost.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  // Server snapshot: assume desktop so prerendered output is stable.
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** True below the `lg` breakpoint, where the three-panel layout stacks. */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}
