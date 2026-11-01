/**
 * Governance writes for nodes and edges.
 *
 * The implementations live in `./graph` (alongside the other graph reads and
 * writes); this module re-exports them under the names the governance flow
 * uses, so callers can import them from either place.
 */
export {
  activateNode,
  rejectNode,
  autoActivateNode,
  activateEdge,
  rejectEdge,
  autoActivateEdge
} from './graph';
