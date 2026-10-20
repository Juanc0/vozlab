/**
 * A full browser navigation to an absolute URL.
 *
 * The institutional login starts on the **API** origin (`GET /auth/login`
 * answers with a `302` to the identity provider). That has to be a document
 * navigation: a client-side router fetch would try to read the API's redirect
 * answer as a page and fail.
 *
 * The indirection exists so the navigation can be stubbed in the tests.
 */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
