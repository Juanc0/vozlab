/**
 * The labels of the **statuses**.
 *
 * A status is a value of the domain — `PENDING`, `REJECTED_BY_AUTHOR` — and
 * not a sentence of the interface. It cannot live in the copy of the
 * dictionary as a key: `t('status.node.PENDING')` would be a dynamic key,
 * and the union of the keys of the dictionary cannot type it.
 *
 * So the statuses live in a **map per scope** inside the dictionaries
 * (`es.statuses.node`, `en.statuses.proposal`, …), each map typed against
 * the vocabulary of the shared contract: a status that is missing is a
 * compile error.
 *
 * The module is pure: no DOM, no state. The Svelte state reads it through
 * `LocaleState.status()`.
 */

import type {
  EdgeStatus,
  NodeStatus,
  ProposalStatus,
  ThreadStatus,
} from '@vozlab/shared-types';
import { en } from './locales/en';
import { es } from './locales/es';

/**
 * The scopes of the statuses.
 *
 * A scope is a **family** of values: the statuses of a node, of a relation,
 * of a proposal or of a discussion thread. Each one has its own vocabulary
 * and its own labels.
 */
export type StatusScope = 'node' | 'edge' | 'proposal' | 'thread';

/** The vocabulary of every scope — the union of the statuses of the contract. */
export type StatusValue = NodeStatus | EdgeStatus | ProposalStatus | ThreadStatus;

/** The labels of a scope, by language. */
export type StatusLabels = Record<string, string>;

/** The labels of every scope, by language. */
export interface StatusDictionary {
  node: StatusLabels;
  edge: StatusLabels;
  proposal: StatusLabels;
  thread: StatusLabels;
}

/**
 * The labels of the statuses, by language.
 *
 * The English dictionary is declared as `Dictionary<typeof es>`, so its
 * labels have the same keys as the Spanish ones: the two cannot drift.
 */
export const statusDictionaries: Readonly<Record<string, StatusDictionary>> = {
  es: es.statuses as StatusDictionary,
  en: en.statuses as StatusDictionary
};

/**
 * The label of a status, in the language of the interface.
 *
 * The chain is short: the label of the scope in the language of the
 * interface, and — when the scope or the value is unknown — the **raw
 * value**. A status that was added to the contract before the dictionary
 * was updated must not break the interface: the reader sees the value of
 * the system, which is what the API sent.
 */
export function statusLabel(locale: string, scope: StatusScope, value: string): string {
  const dictionary = statusDictionaries[locale] ?? statusDictionaries['es'];
  const labels = dictionary[scope];
  const label = labels?.[value];

  if (typeof label !== 'string' || label.trim() === '') {
    return value;
  }

  return label;
}
