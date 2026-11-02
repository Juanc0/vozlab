/**
 * The comparison of the engines is a **development** surface.
 *
 * The rule is the one of the development sign-in (3.9): the surface is
 * rendered only in a development build, and the code behind it never
 * reaches a production bundle. The first half is checked here — the second
 * one is proved by the build.
 */

import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import EnginesPage from '../src/routes/(app)/engines/+page.svelte';

const { envState } = vi.hoisted(() => ({
  envState: { isDevelopmentBuild: (): boolean => false }
}));

vi.mock('$lib/config/environment', () => envState);

vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: false,
  version: 'test'
}));

describe('the comparison of the engines', () => {
  it('is not rendered outside a development build', () => {
    envState.isDevelopmentBuild = () => false;

    const { container } = render(EnginesPage);

    // The route answers with nothing: there is no panel, no heading and no
    // canvas — and the module of the comparison was never imported.
    expect(container.textContent?.trim()).toBe('');
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('h1')).toBeNull();
  });
});
