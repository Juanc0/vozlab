import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '$lib/pwa/register';
import {
  registerSW,
  registerSWOptions,
  resetPwaRegisterMock,
  updateServiceWorker
} from './mocks/pwa-register';

// The module under test only registers the worker in the browser.
vi.mock('$app/environment', () => ({
  browser: true,
  building: false,
  dev: true,
  version: 'test'
}));

describe('registerServiceWorker', () => {
  beforeEach(() => {
    resetPwaRegisterMock();
  });

  it('registers the service worker immediately', async () => {
    await registerServiceWorker();

    expect(registerSW).toHaveBeenCalledTimes(1);
    expect(registerSWOptions[0]?.immediate).toBe(true);
  });

  it('hands the update callback over when a new worker is waiting', async () => {
    const onNeedRefresh = vi.fn();

    await registerServiceWorker({ onNeedRefresh });
    registerSWOptions[0]?.onNeedRefresh?.();

    expect(onNeedRefresh).toHaveBeenCalledTimes(1);

    const applyUpdate = onNeedRefresh.mock.calls[0]?.[0];
    expect(typeof applyUpdate).toBe('function');

    await applyUpdate?.();
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);
  });

  it('reports when the app shell is cached for offline use', async () => {
    const onOfflineReady = vi.fn();

    await registerServiceWorker({ onOfflineReady });
    registerSWOptions[0]?.onOfflineReady?.();

    expect(onOfflineReady).toHaveBeenCalledTimes(1);
  });

  it('forwards registration errors', async () => {
    const onRegisterError = vi.fn();

    await registerServiceWorker({ onRegisterError });
    registerSWOptions[0]?.onRegisterError?.(new Error('boom'));

    expect(onRegisterError).toHaveBeenCalledTimes(1);
    expect(onRegisterError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});
