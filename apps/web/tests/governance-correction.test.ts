/**
 * The correction form — the delta it builds (FR-10).
 *
 * The delta is the contract with the API: it must carry **only** the fields
 * the API applies for the kind of the target, and **only** the ones that
 * change. A field the API ignores would be a proposal that silently does
 * nothing; an unchanged field would claim a change that is not one.
 */

import { describe, expect, it } from 'vitest';
import {
  appendAttributeRow,
  attributeFieldKey,
  buildCorrection,
  coerceAttributeRow,
  edgeSnapshot,
  initialAttributeRows,
  nodeSnapshot,
  retypeAttributeRow,
  type AttributeRow,
  type CorrectionDraft,
  type CorrectionSnapshot
} from '$lib/governance/correction';
import { EDGE, NODE_A } from './fixtures/graph';

/** A counter of the rows — the ids only have to be unique. */
function counter(): () => string {
  let value = 0;
  return () => {
    value += 1;
    return `row-${value}`;
  };
}

/** The snapshot of the node of the fixture. */
const NODE: CorrectionSnapshot = nodeSnapshot(NODE_A);

/** The snapshot of the relation of the fixture. */
const RELATION: CorrectionSnapshot = edgeSnapshot({
  id: EDGE.id,
  workspaceId: EDGE.sourceNodeId,
  sourceNodeId: EDGE.sourceNodeId,
  targetNodeId: EDGE.targetNodeId,
  relationKey: EDGE.relationKey,
  attributes: { weight: 2, confident: true },
  authorHash: 'a'.repeat(64),
  status: EDGE.status,
  communityScore: EDGE.communityScore,
  createdAt: '2026-10-19T10:00:00.000Z'
});

/** A draft of a node. */
function nodeDraft(overrides: Partial<CorrectionDraft> = {}): CorrectionDraft {
  return {
    kind: 'NODE',
    title: NODE_A.title,
    description: NODE_A.description ?? '',
    rows: initialAttributeRows(NODE_A.attributes, counter()),
    justification: '',
    ...overrides
  } as CorrectionDraft;
}

/** A draft of a relation. */
function edgeDraft(overrides: Partial<CorrectionDraft> = {}): CorrectionDraft {
  return {
    kind: 'EDGE',
    relationKey: RELATION.kind === 'EDGE' ? RELATION.relationKey : '',
    rows: initialAttributeRows(RELATION.kind === 'EDGE' ? RELATION.attributes : {}, counter()),
    justification: '',
    ...overrides
  } as CorrectionDraft;
}

describe('the delta of a correction', () => {
  it('carries exactly the fields the API applies for a node', () => {
    const build = buildCorrection(NODE, nodeDraft({ title: 'Another title' }));

    // `title`, `description` and `attributes` — nothing else.
    expect(Object.keys(build.proposedChanges).sort()).toEqual(['title']);
  });

  it('carries exactly the fields the API applies for a relation', () => {
    const build = buildCorrection(RELATION, edgeDraft({ relationKey: 'INFORMS' }));

    // `relationKey` and `attributes` — nothing else.
    expect(Object.keys(build.proposedChanges).sort()).toEqual(['relationKey']);
  });

  it('sends only the fields that change', () => {
    const build = buildCorrection(
      NODE,
      nodeDraft({
        title: 'The campus shuttle leaves every half hour',
        description: NODE_A.description ?? '',
        rows: initialAttributeRows(NODE_A.attributes, counter())
      })
    );

    // The title changed; the description and the attributes did not.
    expect(Object.keys(build.proposedChanges)).toEqual(['title']);
    expect(build.proposedChanges['title']).toBe('The campus shuttle leaves every half hour');
  });

  it('does not send an attribute that did not change', () => {
    const build = buildCorrection(
      NODE,
      nodeDraft({
        title: 'The campus shuttle leaves every half hour',
        rows: initialAttributeRows(NODE_A.attributes, counter())
      })
    );

    // The attributes of the node are `source` and `severity`: neither of
    // them changed, so the delta carries no `attributes` at all.
    expect(build.proposedChanges['attributes']).toBeUndefined();
  });

  it('sends the attributes that change, and only those', () => {
    const rows = initialAttributeRows(NODE_A.attributes, counter());
    const severity = rows.find((row) => row.key === 'severity');
    expect(severity).toBeDefined();
    severity!.text = '5';

    const build = buildCorrection(NODE, nodeDraft({ rows }));

    expect(build.proposedChanges['attributes']).toEqual({ severity: 5 });
  });

  it('refuses a proposal that changes nothing', () => {
    const build = buildCorrection(NODE, nodeDraft());

    expect(build.hasChanges).toBe(false);
    expect(build.valid).toBe(false);
  });

  it('refuses a title the API would refuse', () => {
    const build = buildCorrection(NODE, nodeDraft({ title: 'ab' }));

    expect(build.valid).toBe(false);
    expect(build.invalid.map((field) => field.key)).toContain('title');
    // The invalid title is not in the delta.
    expect(build.proposedChanges['title']).toBeUndefined();
  });
});

describe('the coercion of the attribute rows', () => {
  it('coerces a row to the type it declares', () => {
    const text: AttributeRow = {
      id: 'a',
      key: 'source',
      type: 'text',
      text: 'runbook',
      checked: false,
      current: undefined,
      exists: false,
      editable: true
    };
    const number: AttributeRow = { ...text, id: 'b', type: 'number', text: '42' };
    const checkbox: AttributeRow = { ...text, id: 'c', type: 'checkbox', checked: true };

    expect(coerceAttributeRow(text)).toEqual({ ok: true, value: 'runbook' });
    expect(coerceAttributeRow(number)).toEqual({ ok: true, value: 42 });
    expect(coerceAttributeRow(checkbox)).toEqual({ ok: true, value: true });
  });

  it('refuses a number that is not one', () => {
    const row: AttributeRow = {
      id: 'a',
      key: 'severity',
      type: 'number',
      text: 'high',
      checked: false,
      current: undefined,
      exists: false,
      editable: true
    };

    const coerced = coerceAttributeRow(row);

    expect(coerced.ok).toBe(false);
    expect(coerced.ok === false && coerced.message).toBe('This attribute must be a number.');
  });

  it('keeps the type of the value of the target', () => {
    const rows = initialAttributeRows(NODE_A.attributes, counter());

    const severity = rows.find((row) => row.key === 'severity');
    const source = rows.find((row) => row.key === 'source');

    expect(severity?.type).toBe('number');
    expect(severity?.text).toBe('3');
    expect(source?.type).toBe('text');
    expect(source?.text).toBe('runbook');
  });

  it('re-reads the value of a row when its type changes', () => {
    const rows = initialAttributeRows(NODE_A.attributes, counter());
    const severity = rows.find((row) => row.key === 'severity');
    expect(severity).toBeDefined();

    const asText = retypeAttributeRow(severity!, 'text');
    expect(asText.type).toBe('text');
    expect(asText.text).toBe('3');

    const asCheckbox = retypeAttributeRow(severity!, 'checkbox');
    expect(asCheckbox.type).toBe('checkbox');
    expect(asCheckbox.checked).toBe(false);
  });

  it('does not send a row without a value', () => {
    const ids = counter();
    const rows = appendAttributeRow(initialAttributeRows(NODE_A.attributes, ids), ids);
    const added = rows[rows.length - 1];
    added.key = 'owner';
    added.text = '';

    const build = buildCorrection(NODE, nodeDraft({ rows }));

    expect(build.proposedChanges['attributes']).toBeUndefined();
  });

  it('refuses to empty an attribute the target already carries', () => {
    const rows = initialAttributeRows(NODE_A.attributes, counter());
    const severity = rows.find((row) => row.key === 'severity');
    expect(severity).toBeDefined();
    severity!.text = '';

    const build = buildCorrection(NODE, nodeDraft({ rows }));

    expect(build.valid).toBe(false);
    expect(build.invalid.map((field) => field.key)).toContain(attributeFieldKey(severity!.id));
    expect(build.proposedChanges['attributes']).toBeUndefined();
  });

  it('refuses two rows with the same key', () => {
    const ids = counter();
    const rows = appendAttributeRow(initialAttributeRows(NODE_A.attributes, ids), ids);
    const added = rows[rows.length - 1];
    added.key = 'source';
    added.text = 'another runbook';

    const build = buildCorrection(NODE, nodeDraft({ rows }));

    expect(build.valid).toBe(false);
    expect(build.invalid.map((field) => field.key)).toContain(`${attributeFieldKey(added.id)}:key`);
  });

  it('leaves an attribute the form cannot express alone', () => {
    // The attributes are JSONB: a value that is not a text, a number or a
    // boolean cannot be proposed by the editor, and rewriting it as a text
    // would corrupt it.
    const snapshot: CorrectionSnapshot = {
      kind: 'NODE',
      title: 'A title',
      description: null,
      attributes: { meta: { source: 'runbook' } }
    };

    const rows = initialAttributeRows(snapshot.attributes, counter());
    expect(rows[0]?.editable).toBe(false);

    const build = buildCorrection(snapshot, {
      kind: 'NODE',
      title: 'A title',
      description: '',
      rows,
      justification: ''
    });

    // The attribute is not in the delta, and the diff says it does not
    // change.
    expect(build.proposedChanges['attributes']).toBeUndefined();
    const meta = build.diff.find((entry) => entry.field === 'attributes.meta');
    expect(meta?.changed).toBe(false);
  });
});

describe('the diff of a correction', () => {
  it('shows the current value and the proposed one of every field', () => {
    const build = buildCorrection(
      NODE,
      nodeDraft({ title: 'The campus shuttle leaves every half hour' })
    );

    const title = build.diff.find((entry) => entry.field === 'title');
    expect(title?.current).toBe(NODE_A.title);
    expect(title?.proposed).toBe('The campus shuttle leaves every half hour');
    expect(title?.changed).toBe(true);

    const description = build.diff.find((entry) => entry.field === 'description');
    expect(description?.current).toBe(NODE_A.description);
    expect(description?.proposed).toBe(NODE_A.description);
    expect(description?.changed).toBe(false);
  });

  it('marks the fields that change', () => {
    const build = buildCorrection(
      NODE,
      nodeDraft({ title: 'The campus shuttle leaves every half hour' })
    );

    expect(build.changed).toEqual(['title']);
    expect(build.diff.filter((entry) => entry.changed)).toHaveLength(1);
  });

  it('shows the attributes the target will carry once the delta is merged', () => {
    const rows = initialAttributeRows(NODE_A.attributes, counter());
    const severity = rows.find((row) => row.key === 'severity');
    severity!.text = '5';

    const build = buildCorrection(NODE, nodeDraft({ rows }));

    const severityDiff = build.diff.find((entry) => entry.field === 'attributes.severity');
    expect(severityDiff?.current).toBe('3');
    expect(severityDiff?.proposed).toBe('5');
    expect(severityDiff?.changed).toBe(true);

    // The attribute that did not change is shown too — the reader sees the
    // whole picture.
    const sourceDiff = build.diff.find((entry) => entry.field === 'attributes.source');
    expect(sourceDiff?.changed).toBe(false);
  });

  it('shows an empty description as a change', () => {
    const build = buildCorrection(NODE, nodeDraft({ description: '' }));

    const description = build.diff.find((entry) => entry.field === 'description');
    expect(description?.current).toBe(NODE_A.description);
    expect(description?.proposed).toBe('(empty)');
    expect(description?.changed).toBe(true);
    expect(build.proposedChanges['description']).toBe('');
  });

  it('does not see a missing description and an empty one as two things', () => {
    const snapshot: CorrectionSnapshot = {
      kind: 'NODE',
      title: 'A title',
      description: null,
      attributes: {}
    };

    const build = buildCorrection(snapshot, {
      kind: 'NODE',
      title: 'A title',
      description: '',
      rows: [],
      justification: ''
    });

    expect(build.changed).toEqual([]);
  });
});
