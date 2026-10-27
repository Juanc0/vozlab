import { createHash, randomBytes } from 'node:crypto';
import { isSafeRedirectPath } from '@vozlab/shared-types';
import { IIdentityProvider } from '../../domain/ports/IIdentityProvider.js';
import { IOidcStateStore } from '../../domain/ports/IOidcStateStore.js';
import { IRouterDatabase } from '../../domain/ports/IRouterDatabase.js';

const STATE_TTL_SECONDS = 10 * 60;

export interface StartOidcLoginInput {
  /** Absolute path on the PWA origin; validated by the controller. */
  redirectPath: string;
  /** Optional institution slug requested at login time. */
  institution?: string;
  /** Optional IdP hint for the broker (kc_idp_hint). */
  kcIdpHint?: string;
}

export interface StartOidcLoginResult {
  authorizationUrl: string;
}

/**
 * Build the OIDC authorization request.
 *
 * State, nonce and the PKCE verifier are generated with CSPRNG and stored
 * server-side (Redis, single-use, 10 min). Only the state value and the S256
 * challenge travel through the browser.
 */
export class StartOidcLoginUseCase {
  constructor(
    private readonly identityProvider: IIdentityProvider,
    private readonly stateStore: IOidcStateStore,
    private readonly routerDb?: IRouterDatabase
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

    // Resolve the optional institution to its oidc_tenant_id.
    let institution: string | undefined;
    if (input.institution && this.routerDb) {
      const tenant = await this.routerDb.findTenantBySlug(input.institution);
      if (tenant) {
        institution = tenant.oidcTenantId;
      }
    }

    await this.stateStore.save(
      state,
      { nonce, codeVerifier, redirectPath, institution },
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
