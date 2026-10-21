/**
 * The target of a proposal — the object the proposal is about.
 *
 * A proposal targets a node, an edge or an ontology class
 * (`edit_proposals.target_id` is polymorphic and has no foreign key,
 * decision M-12). To show the resolution controls the UI needs to know
 * **who maintains that target**: the API compares the caller's pseudonym
 * with the author of the *target*, not with the author of the proposal
 * (`resolveTargetAuthorHash` in the API).
 *
 * The three reads below are the only ones the API offers:
 *
 * - `GET /api/v1/nodes/:id` — the author of the node;
 * - `GET /api/v1/edges/:id` — the author of the relation;
 * - `GET /api/v1/ontology` — the **active** classes, with their
 *   `proposedBy`.
 *
 * The last one is a real limitation: a class that is still `PROPOSED` never
 * reaches the consumer, so the maintainer of an ontology target cannot
 * always be resolved. The UI then falls back to a weaker hint and lets the
 * API decide — it is the enforcement either way.
 */

import type { ApiClient } from './client';
import type { ProposalDto } from './types';
import { displayName } from '$lib/i18n/display-name';
import { DEFAULT_LOCALE } from '$lib/i18n/dictionary';

/** What the app could learn about the target of a proposal. */
export interface ProposalTarget {
  /**
   * The `authorHash` of the target's author — the maintainer the API
   * compares the resolver with. `null` when the target could not be read.
   */
  readonly maintainerHash: string | null;
  /** A readable label of the target (its title, its relation key, …). */
  readonly label: string | null;
  /**
   * `true` when the target could be **read**. It is `false` when the read
   * failed and when the target is an ontology class that is still
   * `PROPOSED` — the API only publishes the active classes.
   */
  readonly known: boolean;
}

/** The target could not be read. */
const UNKNOWN_TARGET: ProposalTarget = { maintainerHash: null, label: null, known: false };

/**
 * Reads the target of a proposal.
 *
 * A failed read is **not** an error the caller has to handle: the target is
 * simply unknown, and the UI degrades to the weaker hint. The caller shows
 * the read failure separately when it wants to.
 *
 * The label is the **name** of the target in the language of the interface:
 * the display name of the relation, the display name of the class of the
 * ontology, and the title of the node. The API sends the whole map of the
 * names and the client picks the one of its language.
 */
export async function resolveProposalTarget(
  client: ApiClient,
  proposal: ProposalDto,
  locale: string = DEFAULT_LOCALE
): Promise<ProposalTarget> {
  try {
    switch (proposal.targetType) {
      case 'NODE': {
        const body = await client.request<{ node: { authorHash: string; title: string } }>({
          path: `/nodes/${encodeURIComponent(proposal.targetId)}`
        });
        const node = body.node;
        return node
          ? { maintainerHash: node.authorHash, label: node.title, known: true }
          : UNKNOWN_TARGET;
      }
      case 'EDGE': {
        const body = await client.request<{
          edge: {
            authorHash: string;
            relationKey: string;
            relationDisplayNames: Record<string, string>;
          };
        }>({
          path: `/edges/${encodeURIComponent(proposal.targetId)}`
        });
        const edge = body.edge;
        return edge
          ? {
              maintainerHash: edge.authorHash,
              label: displayName(edge.relationDisplayNames, locale, edge.relationKey),
              known: true
            }
          : UNKNOWN_TARGET;
      }
      case 'ONTOLOGY': {
        const body = await client.request<{
          classes?: {
            id: string;
            proposedBy: string;
            systemKey: string;
            displayNames: Record<string, string>;
          }[];
        }>({
          path: '/ontology'
        });
        const found = (body.classes ?? []).find((entry) => entry.id === proposal.targetId);
        return found
          ? {
              maintainerHash: found.proposedBy,
              label: displayName(found.displayNames, locale, found.systemKey),
              known: true
            }
          : UNKNOWN_TARGET;
      }
      default:
        return UNKNOWN_TARGET;
    }
  } catch {
    // A missing, foreign or unreadable target is not fatal: the UI shows the
    // weaker hint and the API answers the real decision.
    return UNKNOWN_TARGET;
  }
}

/**
 * Reads the label of the node that **survives** a merge.
 *
 * The surviving node is named in the payload of the `MERGE` proposal
 * (`mergeIntoNodeId`, ADR-0026). It is a node of the workspace, so the
 * ordinary node read answers its title. A failed read yields `null`: the
 * uuid is still shown, the title is not.
 */
export async function resolveMergeTargetLabel(
  client: ApiClient,
  nodeId: string
): Promise<string | null> {
  try {
    const body = await client.request<{ node: { title: string } }>({
      path: `/nodes/${encodeURIComponent(nodeId)}`
    });

    return body.node?.title ?? null;
  } catch {
    return null;
  }
}
