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
   * `GET /api/v1/nodes/subgraph` — the relation of the graph.
   *
   * It carries the topology, the display names of the relation, its
   * attributes, the pseudonym of its author, its status, its score and the
   * instant it was created: the same values the full edge carries.
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
  /** The states of a proposal (`PENDING` … `AUTO_APPLIED`). */
  ProposalStatus,
  /** The kind of a proposal (`EDIT` | `MERGE`, ADR-0026). */
  ProposalKind,
  /** The kinds of object a proposal may target (`NODE` | `EDGE` | `ONTOLOGY`). */
  TargetType,
  /** `GET /api/v1/discussions`, `PUT /api/v1/discussions/:threadId/close`. */
  ThreadDto,
  /** The states of a discussion thread (`OPEN` | `CLOSED`). */
  ThreadStatus,
  /** The kinds of object a discussion may target. */
  DiscussionTargetType,
  /** `GET /api/v1/discussions/:threadId/posts`. */
  PostDto,
  /** `GET /api/v1/ontology` (classes). */
  OntologyClassDto,
  /** `GET /api/v1/ontology` (object properties). */
  ObjectPropertyDto,
  /** `GET /api/v1/ontology` (datatype properties — the attributes). */
  DatatypePropertyDto,
  /** `GET /api/v1/ontology` — the body of the ontology response. */
  OntologyResponseDto,
  /** The scalar kind of a datatype property (`string` … `enum`). */
  DatatypeKind,
  /** `POST /api/v1/nodes` — the body of a node creation. */
  CreateNodeInput,
  /** `POST /api/v1/edges` — the body of an edge creation. */
  CreateEdgeInput,
  /** `POST /api/v1/discussions` — the body of a thread creation. */
  CreateThreadInput,
  /** `POST /api/v1/discussions/:threadId/posts` — the body of a post. */
  CreatePostInput,
  /** `POST /api/v1/interactions` — the body of a cast vote. */
  InteractionDto,
  /** The kinds of object a vote may target. */
  InteractionTargetType,
  /** The kinds of vote (`UPVOTE` | `DOWNVOTE` | `SUPPORT` | `VALIDATE`). */
  InteractionType,
} from '@vozlab/shared-types';
