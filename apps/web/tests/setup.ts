import '@testing-library/jest-dom/vitest';
// Registers the automatic setup/cleanup of @testing-library/svelte for Vitest.
import '@testing-library/svelte/vitest';

/**
 * The width of the window the tests pretend they have.
 *
 * jsdom does not evaluate the media queries: `matchMedia` always answers
 * "no". The interface asks the width of the window to know whether the
 * navigation is a column or a drawer, and whether the inspector is a column
 * or a sheet — so the tests need a window they can resize. This stub
 * answers the queries of the app with the width below.
 */
let viewportWidth = 1280;

/** The width of the window the tests pretend they have. */
export function setViewportWidth(width: number): void {
  viewportWidth = width;
}

/** Whether the query of a media query matches the width of the window. */
function matches(query: string): boolean {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const max = /max-width:\s*(\d+)px/.exec(query);

  if (min !== null && viewportWidth < Number(min[1])) {
    return false;
  }

  if (max !== null && viewportWidth > Number(max[1])) {
    return false;
  }

  return true;
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    }) as unknown as MediaQueryList
});
