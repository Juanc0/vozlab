/**
 * Port: tenant identity providers in the router DB (D1).
 *
 * Each row describes an IdP that a tenant uses for institutional login.
 * The broker (Keycloak/Zitadel) federates these providers.
 */
export interface TenantIdentityProvider {
  id: string;
  tenantId: string;
  providerKind: 'OIDC_INSTITUTIONAL' | 'OIDC_SOCIAL' | 'SAML' | 'LDAP';
  issuer: string;
  clientId: string | null;
  metadataUrl: string | null;
  enabled: boolean;
  createdAt: Date;
}

export interface ITenantIdentityProviderRepository {
  /** List all enabled providers for a tenant. */
  listByTenant(tenantId: string): Promise<TenantIdentityProvider[]>;

  /** Find a provider by its issuer URL. */
  findByIssuer(issuer: string): Promise<TenantIdentityProvider | null>;

  /** Create a new provider for a tenant. */
  create(input: {
    tenantId: string;
    providerKind: TenantIdentityProvider['providerKind'];
    issuer: string;
    clientId?: string | null;
    metadataUrl?: string | null;
  }): Promise<TenantIdentityProvider>;

  /** Enable or disable a provider. */
  setEnabled(id: string, enabled: boolean): Promise<void>;
}