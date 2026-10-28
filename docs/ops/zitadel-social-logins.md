# Zitadel social logins (v5)

Enable Google (personal) and Microsoft (personal) social identity providers in the
Zitadel realm used by VozLab. This supports external collaborators (gmail/outlook).

Steps:
1. In Zitadel console, add IdP of type Google and Microsoft (personal).
2. Map email, email_verified, name, picture claims.
3. Enable auto-creation of users on first login.
4. Link IdP to the default login policy.
5. Test in identity lab (`docker compose --profile idp up -d`).

See `docs/analysis/auth-onboarding-committee-review.md` section 15.5.