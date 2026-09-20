import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

/**
 * jsdom has no matchMedia, which any responsive hook will reach for.
 * Defaults to "no match" so tests describe the desktop layout unless a
 * test explicitly says otherwise via setViewport().
 */
function installMatchMedia(width: number): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList => {
      const max = /max-width:\s*(\d+)px/.exec(query)
      const min = /min-width:\s*(\d+)px/.exec(query)
      const matches =
        (max ? width <= Number(max[1]) : true) &&
        (min ? width >= Number(min[1]) : true)

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList
    },
  )
}

/** Drive responsive tests at a real breakpoint width. */
export function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  installMatchMedia(width)
  window.dispatchEvent(new Event('resize'))
}

installMatchMedia(1440)
