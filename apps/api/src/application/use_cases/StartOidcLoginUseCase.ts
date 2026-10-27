import { createHash, randomBytes } from 'node:crypto';
import { isSafeRedirectPath } from '@vozlab/shared-types';
import { IIdentityProvider } from '../../domain/ports/IIdentityProvider.js';
import { IOidcStateStore } from '../../domain/ports/IOidcStateStore.js';

const STATE_TTL_SECONDS = 10 * 60;

export interface StartOidcLoginInput {
  /** Absolute path on the PWA origin; validated by the controller. */
  redirectPath: string;
  /** Optional IdP hint for the broker (kc_idp_hint). */
  kcIdpHint?: string;
  /** Optional invitation token (raw, single-use). */
  invitationToken?: string;
}

export interface StartOidcLoginResult {
  authorizationUrl: string;
}

/**
 * Build the OIDC authorization request.
 *
 * The tenant is NOT resolved here. It is resolved later in
 * CompleteOidcLoginUseCase from the token claims (hd for Google,
 * tid for Entra, org ID for Zitadel native). The user selects the
 * authentication provider, not the institution.
 */
export class StartOidcLoginUseCase {
  constructor(
    private readonly identityProvider: IIdentityProvider,
    private readonly stateStore: IOidcStateStore
  ) {}

  async execute(input: StartOidcLoginInput): Promise<StartOidcLoginResult> {
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const redirectPath = isSafeRedirectPath(input.redirectPath)
      ? input.redirectPath
      : '/';

    await this.stateStore.save(
      state,
      { nonce, codeVerifier, redirectPath, invitationToken: input.invitationToken },
      STATE_TTL_SECONDS
    );

    return {
      authorizationUrl: this.identityProvider.buildAuthorizationUrl({
        state,
        nonce,
        codeChallenge,
        kcIdpHint: input.kcIdpHint,
      }),
    };
  }
}
