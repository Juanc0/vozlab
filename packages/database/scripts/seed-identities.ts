/**
 * LOGIN-REACHABLE IDENTITY STATE — DEV SEEDING ROUTINE (T8, D-3 ruling).
 *
 * Produces, for one seeded HUMAN persona, exactly the state the F1 OIDC
 * callback (`CompleteOidcLoginUseCase`) reaches after a real login:
 *
 *   a. router `global_users` row (issuer, subject, peppered `email_hash`,
 *      full_name, email_verified)          — vault upsert by (issuer, subject)
 *   b. tenant `auth.users` row              — carries `global_user_id`
 *   c. tenant `auth.external_identities`    — (user_id, issuer, subject,
 *      provider_kind 'OIDC_INSTITUTIONAL')  — the sole external-identity
 *      store (audit D-2/T7)
 *   d. router `global_user_tenants`         — ACTIVE link vault↔tenant user
 *
 * Without (a)+(c)+(d) a real login on a seeded subject finds no external
 * identity and JITs a SECOND `auth.users` row (audit P5's duplicate trap).
 * With them, `findOrCreateByExternalIdentity` takes its existing-row branch
 * and no duplicate is written.
 *
 * SYSTEM_AGENT personas get NONE of this (audit P5, documented): their tokens
 * are minted by `db:mint-token` and they never log in through a broker, so no
 * IdP pair exists to seed.
 *
 * The ISSUER is a parameter, never hardcoded (ruling 3a): the seed must match
 * whatever realm the calling environment actually uses. This module is
 * importable by the integration test so the F1 acceptance test can run the
 * routine IN-PROCESS against the ephemeral mock realm (ruling 6's issuer
 * trap) — CI and local then execute identically regardless of what the
 * volume's own seed wrote under its `.env` issuer.
 *
 * Order is load-bearing (ruling 3): vault → tenant user → external identity
 * → link. Everything is an idempotent upsert, so re-runs heal drift without
 * duplicating.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import {
  externalIdentities,
  globalUserTenants,
  globalUsers,
  users,
} from '../src/index.js';
import { emailHashPeppered } from './email-hash.js';
import {
  DEV_HANDLES,
  DEV_HUMAN_NAMES,
  DEV_IDENTITIES,
  type DevHumanName,
} from './dev-identities.js';

export interface HumanIdentitySeedOptions {
  /** Live pool to the ROUTER database (never mixed with the tenant one). */
  readonly routerPool: Pool;
  /** Live pool to the TENANT database. */
  readonly tenantPool: Pool;
  /** Internal tenant UUID (`public.tenants.id`). */
  readonly tenantId: string;
  /** The OIDC issuer of the calling environment (ruling 3a — never hardcoded). */
  readonly issuer: string;
  /** `EMAIL_PEPPER` for the peppered vault email hash (DEC-4). */
  readonly emailPepper: string;
}

export interface SeededHumanIdentity {
  readonly name: DevHumanName;
  /** The router vault row id the persona's tenant user is linked to. */
  readonly globalUserId: string;
  /** The (fixed) `auth.users.id` of the persona. */
  readonly userId: string;
}

/**
 * The issuer the seed scripts must use: whatever the environment's OIDC
 * config names (`OIDC_ISSUER`). `null` when unset — a CI seed step that never
 * runs a login simply has no realm to be coherent with, and the caller skips
 * the identity-state block (the integration test then supplies the mock
 * realm's issuer itself; ruling 6).
 */
export function resolveSeedIssuer(): string | null {
  const issuer = process.env.OIDC_ISSUER?.trim();
  return issuer && issuer.length > 0 ? issuer : null;
}

/** Seed the full login-reachable identity state for one human persona. */
export async function seedHumanIdentity(
  opts: HumanIdentitySeedOptions,
  name: DevHumanName
): Promise<SeededHumanIdentity> {
  const identity = DEV_IDENTITIES[name];
  const subject = identity.subject;
  if (!subject) {
    throw new Error(
      `dev identity "${name}" carries no IdP subject — only humans are seedable (SYSTEM_AGENT personas are minted, never logged in)`
    );
  }
  const routerDb = drizzle(opts.routerPool);
  const tenantDb = drizzle(opts.tenantPool);

  // (a) Vault row, upserted by the (issuer, subject) unique key. The seed is
  // not a login, so `last_login_at` stays untouched (NULL on a fresh row);
  // the F1 callback is what stamps it.
  const [vault] = await routerDb
    .insert(globalUsers)
    .values({
      issuer: opts.issuer,
      subject,
      emailHash: emailHashPeppered(identity.email, opts.emailPepper),
      emailVerified: true,
      fullName: identity.fullName,
      picture: null,
    })
    .onConflictDoUpdate({
      target: [globalUsers.issuer, globalUsers.subject],
      set: {
        emailHash: sql`excluded.email_hash`,
        emailVerified: true,
        fullName: sql`excluded.full_name`,
        lastSeenAt: new Date(),
      },
    })
    .returning({ id: globalUsers.id });
  if (!vault) {
    throw new Error(`vault upsert returned no row for ${opts.issuer}/${subject}`);
  }

  // (b) Tenant user — the fixed-id row seed-dev writes anyway, healed with
  // the vault pointer. The base fields stay canonical (same rule as the bulk
  // insert in seed-dev). Handle coherence (ruling 4): the seeded handle
  // equals `deriveHandle`'s value for this persona (email local-part; no
  // preferred_username in the dev realm), and the F1 update path COALESCEs —
  // so a login on this subject lands ON this handle instead of colliding.
  const [user] = await tenantDb
    .insert(users)
    .values({
      id: identity.id,
      provider: 'OIDC_INSTITUTIONAL',
      authorHash: identity.authorHash,
      fullName: identity.fullName,
      handle: DEV_HANDLES[name] ?? null,
      systemRole: identity.systemRole,
      globalUserId: vault.id,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        fullName: sql`excluded.full_name`,
        handle: sql`excluded.handle`,
        systemRole: sql`excluded.system_role`,
        globalUserId: vault.id,
      },
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error(`tenant user upsert returned no row for "${name}"`);
  }

  // (c) External identity — the key the F1 path looks up first. A fresh row
  // is inserted; an existing one (this persona already logged in under this
  // issuer) is left alone, duplicate-safe by the (issuer, subject) unique.
  await tenantDb
    .insert(externalIdentities)
    .values({
      userId: user.id,
      issuer: opts.issuer,
      subject,
      providerKind: 'OIDC_INSTITUTIONAL',
    })
    .onConflictDoNothing();

  // (d) Router link vault↔tenant user, ACTIVE. Keyed on (tenant_id,
  // tenant_user_id) — NOT the API's (global_user_id, tenant_id) arbiter: one
  // persona can have vault rows under several issuers in the same router DB
  // (the dev volume's own seed + the test process's mock realm), and
  // `uniq_tenant_user` allows a single link per tenant user. Re-seeding under
  // a new issuer re-anchors the link to that issuer's vault row, exactly the
  // state the next login under it expects.
  await routerDb
    .insert(globalUserTenants)
    .values({
      globalUserId: vault.id,
      tenantId: opts.tenantId,
      tenantUserId: user.id,
      status: 'ACTIVE',
    })
    .onConflictDoUpdate({
      target: [globalUserTenants.tenantId, globalUserTenants.tenantUserId],
      set: {
        globalUserId: vault.id,
        status: 'ACTIVE',
        lastSeenAt: new Date(),
      },
    });

  return { name, globalUserId: vault.id, userId: user.id };
}

/** Seed every human persona (the three handles + the community/paper-lab story). */
export async function seedHumanIdentities(
  opts: HumanIdentitySeedOptions
): Promise<SeededHumanIdentity[]> {
  const seeded: SeededHumanIdentity[] = [];
  for (const name of DEV_HUMAN_NAMES) {
    seeded.push(await seedHumanIdentity(opts, name));
  }
  return seeded;
}
