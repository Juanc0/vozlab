import { describe, expect, it } from 'vitest';
import { SessionState } from '$lib/state/session.svelte';
import type { AuthSessionDto, AuthUserDto } from '@vozlab/shared-types';

const USER: AuthUserDto = {
  id: '44444444-4444-4444-8444-444444444444',
  fullName: 'Ada Lovelace',
  anonymousAlias: null,
  provider: 'OIDC_INSTITUTIONAL',
  systemRole: 'USER',
  authorHash: 'a'.repeat(64)
};

const SESSION: AuthSessionDto = {
  accessToken: 'header.payload.signature',
  expiresAt: '2026-10-19T12:15:00.000Z',
  user: USER
};

describe('SessionState', () => {
  it('starts without a session', () => {
    const state = new SessionState();

    expect(state.accessToken).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('adopts a session', () => {
    const state = new SessionState();

    state.setSession(SESSION);

    expect(state.accessToken).toBe(SESSION.accessToken);
    expect(state.expiresAt).toBe(SESSION.expiresAt);
    expect(state.user).toEqual(USER);
    expect(state.isAuthenticated).toBe(true);
  });

  it('drops the session', () => {
    const state = new SessionState();
    state.setSession(SESSION);

    state.clear();

    expect(state.accessToken).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('never writes the access token to a web storage', () => {
    const state = new SessionState();

    state.setSession(SESSION);

    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
});
