# Zitadel social logins (B9 — v6/TASK-09)

Enable Google and Microsoft identity providers in the Zitadel instance used by
VozLab so external collaborators (gmail / outlook) can log in.

## How Zitadel v4.16 models this

Zitadel v4 **removed the built-in Google/Microsoft provider types**. A social
login is now a generic **OIDC IdP** discovered from the provider's issuer.
Google and Microsoft both publish standard OIDC discovery, so:

| Provider  | Issuer                                              |
|-----------|-----------------------------------------------------|
| Google    | `https://accounts.google.com`                       |
| Microsoft | `https://login.microsoftonline.com/common/v2.0`     |
|           | (`.../consumers/v2.0` for personal MSA only)        |

User auto-creation on first external login is a property of the IdP config
(`autoRegister: true`), which the script already sets. Claim mapping
(email/name) is handled automatically by OIDC discovery; the script maps
username from `email` and display name from `preferred_username`.

## Provisioning — scripted (done)

`scripts/setup-zitadel.sh` §8 provisions the IdPs through the Management API
(`POST /management/v1/idps/oidc`, `PUT /management/v1/idps/{id}/oidc_config`,
`POST /management/v1/policies/login/idps`), creates the organization login
policy when missing (allowing password + external IdP + registration), and is
fully idempotent. The section is **skipped when no credentials are set**.

Verified 2026-10-29 against the dev instance with dummy credentials
(create → update → link → unlink → delete), then cleaned up.

## Connect real credentials — PENDING (external)

This is the remaining half of B9; it needs accounts outside the repo:

1. **Google** — Google Cloud Console → APIs & Services → OAuth consent screen
   (External) → Credentials → Create OAuth client ID (Web application).
   Authorized redirect URI: `https://<zitadel-domain>/ui/login/login/externalidp/callback`
   (dev: `http://localhost:8081/ui/login/login/externalidp/callback`).
2. **Microsoft** — Azure portal → Entra ID → App registrations → New
   registration → "Accounts in any organizational directory and personal
   Microsoft accounts". Redirect URI: type *Web*, same callback URL as above.
3. Export the credentials and rerun the setup script:

   ```bash
   ZITADEL_GOOGLE_CLIENT_ID=... ZITADEL_GOOGLE_CLIENT_SECRET=... \
   ZITADEL_MICROSOFT_CLIENT_ID=... ZITADEL_MICROSOFT_CLIENT_SECRET=... \
   ./scripts/setup-zitadel.sh
   ```

   (The script rotates the OIDC client secret on every run — copy the printed
   `.env` block into `.env` and restart the API afterwards.)
4. Test in identity lab: the login page must show Google and Microsoft buttons;
   complete one login per provider and verify the JIT user lands in VozLab
   through the normal OIDC callback (ADR-0018 / ADR-0029 — the API itself needs
   **no** code change; social logins are brokered entirely by Zitadel).

## Related

- v6 cleanup half of TASK-09 (expired invitations + inactive guests): done in
  `CleanupExpiredInvitationsUseCase` + `POST /api/v1/admin/cleanup`
  (commit `7833c75`). The optional cron trigger is not wired.
- `docs/analysis/auth-onboarding-committee-review.md` §B9.
