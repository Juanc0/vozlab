/**
 * The labels of the **statuses**.
 *
 * A status is a value of the domain, not a sentence: the labels live in a
 * map per scope inside the dictionaries, and each map is typed against the
 * vocabulary of the shared contract. The tests below say out loud what the
 * compiler already enforces: a status that is missing is a compile error.
 */

import { describe, expect, it } from 'vitest';
import {
  EdgeStatusSchema,
  NodeStatusSchema,
  ProposalStatusSchema,
  ThreadStatusSchema
} from '@vozlab/shared-types';
import { LocaleState } from '$lib/i18n';
import { en, es } from '$lib/i18n';
import {
  statusDictionaries,
  statusLabel,
  type StatusDictionary,
  type StatusScope
} from '$lib/i18n/statuses';

/** The scopes of the statuses and the vocabulary of each one. */
const SCOPES: Array<{ scope: StatusScope; values: readonly string[] }> = [
  { scope: 'node', values: NodeStatusSchema.options },
  { scope: 'edge', values: EdgeStatusSchema.options },
  { scope: 'proposal', values: ProposalStatusSchema.options },
  { scope: 'thread', values: ThreadStatusSchema.options }
];

/** The dictionaries as maps of labels — the shape the accessor reads. */
const spanish = es.statuses as StatusDictionary;
const english = en.statuses as StatusDictionary;

describe('the vocabulary of the statuses', () => {
  it('has a label in both languages for every status', () => {
    for (const { scope, values } of SCOPES) {
      for (const value of values) {
        expect(spanish[scope][value], `${scope}.${value} (es)`).toBeTruthy();
        expect(english[scope][value], `${scope}.${value} (en)`).toBeTruthy();
      }
    }
  });

  it('has no label that is empty', () => {
    for (const dictionary of [spanish, english]) {
      for (const scope of Object.keys(dictionary) as StatusScope[]) {
        for (const [value, label] of Object.entries(dictionary[scope])) {
          expect(label.trim(), `${scope}.${value}`).not.toBe('');
        }
      }
    }
  });

  it('has the same statuses in the two languages', () => {
    for (const { scope } of SCOPES) {
      expect(Object.keys(english[scope]).sort()).toEqual(Object.keys(spanish[scope]).sort());
    }
  });
});

describe('the label of a status', () => {
  it('is the label of the scope, in the language of the interface', () => {
    expect(statusLabel('es', 'node', 'ACTIVE')).toBe('Activo');
    expect(statusLabel('en', 'node', 'ACTIVE')).toBe('Active');
    expect(statusLabel('es', 'proposal', 'REJECTED_BY_AUTHOR')).toBe('Rechazada por la autoría');
    expect(statusLabel('en', 'proposal', 'REJECTED_BY_AUTHOR')).toBe('Rejected by the author');
  });

  it('falls back to the raw value when the status is unknown', () => {
    expect(statusLabel('es', 'node', 'SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(statusLabel('es', 'node', '')).toBe('');
  });

  it('falls back to the raw value when the language is unknown', () => {
    expect(statusLabel('fr', 'node', 'ACTIVE')).toBe('Activo');
  });

  it('is the label of the thread in the language of the interface', () => {
    expect(statusLabel('es', 'thread', 'OPEN')).toBe('Abierto');
    expect(statusLabel('en', 'thread', 'CLOSED')).toBe('Closed');
  });
});

describe('the state of the language', () => {
  it('reads the label of a status', () => {
    const locale = new LocaleState('es');

    expect(locale.status('node', 'PENDING')).toBe('Pendiente');
    expect(locale.status('edge', 'REJECTED')).toBe('Rechazado');
    expect(locale.status('proposal', 'AUTO_APPLIED')).toBe('Aplicada automáticamente');
  });

  it('follows the language the reader chose', () => {
    const locale = new LocaleState('es');

    expect(locale.status('node', 'ACTIVE')).toBe('Activo');

    locale.setLocale('en');

    expect(locale.status('node', 'ACTIVE')).toBe('Active');
  });

  it('falls back to the raw value of an unknown status', () => {
    const locale = new LocaleState('es');

    expect(locale.status('node', 'SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});

describe('the dictionaries of the statuses', () => {
  it('are the ones of the two languages', () => {
    expect(statusDictionaries['es']).toBe(es.statuses);
    expect(statusDictionaries['en']).toBe(en.statuses);
  });
});
