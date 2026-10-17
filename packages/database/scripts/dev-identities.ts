/**
 * DEV IDENTITY FIXTURES — DEVELOPMENT ONLY.
 *
 * Single source of truth for the local tenant/workspace identifiers and the
 * dev identities seeded by `seed-dev.ts` and minted by `mint-dev-token.ts`.
 * Never wire this into app startup, `db:migrate` or CI.
 *
 * Why this exists
 * ---------------
 * There is no reachable IdP locally and no `/auth/*` endpoint yet, so no token
 * can be obtained. These fixtures pin stable UUIDs / `sub` / `authorHash`
 * values so the seed is idempotent and a hand-minted JWT maps to a real
 * `auth.users` row (and its workspace membership).
 *
 * JWT mapping (see `AuthGuard` + `TenantWorkspaceGuard`)
 * -----------------------------------------------------
 *   - `sub`        -> `req.user.userId`; resolved against
 *                     `auth.workspace_memberships.user_id`, so it MUST be the
 *                     internal `auth.users.id` UUID.
 *   - `tid`        -> `tenants.oidc_tenant_id` (seeded as `sabana`).
 *   - `authorHash` -> pseudonymous author of graph mutations (FR-12).
 *   - `type`       -> only for system agents (e.g. `AGENT_EXTRACTOR`); agents
 *                     carry no membership.
 */
import { createHash } from 'node:crypto';
import type { AgentType } from '@vozlab/shared-types';

export type { AgentType };

/** Fixed router/tenant identifiers — deterministic so seeds can re-run safely. */
export const TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const TENANT_CONNECTION_ID = '22222222-2222-4222-8222-222222222222';
export const TENANT_SLUG = 'sabana';
/** Must match the JWT `tid` claim. */
export const OIDC_TENANT_ID = 'sabana';

/** Fixed workspace identifiers — the UUID travels in `X-Workspace-ID`. */
export const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
export const WORKSPACE_SLUG = 'general';

export type SystemRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'SYSTEM_AGENT';
export type WorkspaceRole = 'ADMIN' | 'MODERATOR' | 'MEMBER';
export type DevIdentityName = 'maintainer' | 'moderator' | 'member' | 'agent';

export interface DevMembershipFixture {
  /** Fixed `auth.workspace_memberships.id`. */
  readonly id: string;
  readonly role: WorkspaceRole;
}

export interface DevIdentityFixture {
  /** Fixed `auth.users.id` (and the JWT `sub`). */
  readonly id: string;
  /** JWT `sub` claim — equals `id` so membership resolution succeeds. */
  readonly sub: string;
  /** Stable stand-in for the IdP subject (`auth.users.provider_user_id`). */
  readonly providerUserId: string;
  /** 64-char hex SHA-256 of `dev-<name>` (`auth.users.author_hash`, unique). */
  readonly authorHash: string;
  readonly fullName: string;
  readonly email: string;
  readonly systemRole: SystemRole;
  /** `null` for system agents (they act platform-wide, with no membership). */
  readonly membership: DevMembershipFixture | null;
  /** JWT `type` claim — only present for system agents. */
  readonly agentType?: AgentType;
}

/**
 * `authorHash` for a dev identity: SHA-256 of the stable string `dev-<name>`.
 * The maintainer keeps sha256("dev-maintainer") so the seeded ontology's
 * `proposed_by` (FR-12 author) still resolves.
 */
export function authorHashFor(name: string): string {
  return createHash('sha256').update(`dev-${name}`).digest('hex');
}

/**
 * The four dev identities, keyed by the `--as` selector understood by
 * `mint-dev-token.ts`. Frozen so a consumer cannot mutate shared state.
 */
export const DEV_IDENTITIES: Readonly<
  Record<DevIdentityName, DevIdentityFixture>
> = Object.freeze({
  // Author of the seeded ontology; workspace ADMIN (FR-12 authority).
  maintainer: Object.freeze({
    id: '44444444-4444-4444-8444-444444444444',
    sub: '44444444-4444-4444-8444-444444444444',
    providerUserId: 'dev-maintainer',
    authorHash: authorHashFor('maintainer'),
    fullName: 'Dev Maintainer',
    email: 'dev-maintainer@example.edu',
    systemRole: 'USER',
    membership: Object.freeze({
      id: '55555555-5555-4555-8555-555555555555',
      role: 'ADMIN',
    }),
  }),
  // May override a stalled proposal via the auto-apply path (RF-13).
  moderator: Object.freeze({
    id: '44444444-4444-4444-8444-444444444445',
    sub: '44444444-4444-4444-8444-444444444445',
    providerUserId: 'dev-moderator',
    authorHash: authorHashFor('moderator'),
    fullName: 'Dev Moderator',
    email: 'dev-moderator@example.edu',
    systemRole: 'MODERATOR',
    membership: Object.freeze({
      id: '55555555-5555-4555-8555-555555555556',
      role: 'MODERATOR',
    }),
  }),
  // Regular participant: can propose / vote / discuss, cannot approve.
  member: Object.freeze({
    id: '44444444-4444-4444-8444-444444444446',
    sub: '44444444-4444-4444-8444-444444444446',
    providerUserId: 'dev-member',
    authorHash: authorHashFor('member'),
    fullName: 'Dev Member',
    email: 'dev-member@example.edu',
    systemRole: 'USER',
    membership: Object.freeze({
      id: '55555555-5555-4555-8555-555555555557',
      role: 'MEMBER',
    }),
  }),
  // AI worker stand-in: system role + agent `type`, no workspace membership.
  agent: Object.freeze({
    id: '44444444-4444-4444-8444-444444444447',
    sub: '44444444-4444-4444-8444-444444444447',
    providerUserId: 'dev-agent',
    authorHash: authorHashFor('agent'),
    fullName: 'Dev System Agent',
    email: 'dev-agent@example.edu',
    systemRole: 'SYSTEM_AGENT',
    membership: null,
    agentType: 'AGENT_EXTRACTOR',
  }),
});

/** Ordered identity names — stable iteration for seeding and printing. */
export const DEV_IDENTITY_NAMES: readonly DevIdentityName[] = [
  'maintainer',
  'moderator',
  'member',
  'agent',
];
