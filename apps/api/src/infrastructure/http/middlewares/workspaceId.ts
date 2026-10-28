/**
 * Workspace id validation shared by the scoping guards.
 *
 * The header and the path are both user input; the regex is the same one the
 * zero-trust guard has always used, kept here so a new guard cannot drift.
 */
export const WORKSPACE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidWorkspaceId(value: string): boolean {
  return WORKSPACE_ID_RE.test(value);
}
