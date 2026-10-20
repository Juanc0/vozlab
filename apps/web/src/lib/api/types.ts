/**
 * The response DTOs the API returns.
 *
 * The shapes live in `@vozlab/shared-types` — the same package the API
 * projects them from — so both sides speak one contract. This module only
 * re-exports them: the PWA imports them from `$lib/api/types` and never
 * re-declares a field of its own.
 *
 * The auth DTOs (`AuthUserDto`, `AuthSessionDto`, `AuthMeDto`) are not
 * repeated here: `auth.ts` imports them straight from the package.
 */

export type {
  /** `GET /api/v1/nodes/:id`, `GET /api/v1/nodes`, `GET /api/v1/nodes/subgraph`. */
  NodeDto,
  /** The lifecycle states of a node (`DRAFT` … `REJECTED`). */
  NodeStatus,
  /**
   * `GET /api/v1/nodes/subgraph` — the edge projection of a subgraph.
   *
   * Narrower than {@link EdgeDto}: it carries the topology only (the
   * endpoints, the relation key and the status).
   */
  SubgraphEdgeDto,
  /** `GET /api/v1/nodes/subgraph` — the body of the subgraph response. */
  SubgraphResponseDto,
  /** `GET /api/v1/edges/:id`, `GET /api/v1/edges`, `PATCH /api/v1/edges/:id`. */
  EdgeDto,
  /** The lifecycle states of a relation (`DRAFT` … `REJECTED`). */
  EdgeStatus,
  /** `GET /api/v1/proposals`, `GET /api/v1/proposals/:id`. */
  ProposalDto,
  /** `GET /api/v1/discussions`, `PUT /api/v1/discussions/:threadId/close`. */
  ThreadDto,
  /** `GET /api/v1/discussions/:threadId/posts`. */
  PostDto,
  /** `GET /api/v1/ontology` (classes). */
  OntologyClassDto,
  /** `GET /api/v1/ontology` (object properties). */
  ObjectPropertyDto,
  /** `POST /api/v1/interactions` — the body of a cast vote. */
  InteractionDto,
} from '@vozlab/shared-types';
