import { describe, expect, it } from 'vitest';
import {
  buildNodeForm,
  classOptions,
  coerceAttributeValue,
  displayNameOf,
  initialFieldValue,
  isDateInput,
  relationAccepts,
  relationsForSource,
  validateNodeForm
} from '$lib/ontology/node-form';
import {
  EMPTY_ONTOLOGY,
  ONTOLOGY,
  PROPERTY_SOURCE,
  PROPERTY_STATE
} from './fixtures/ontology';
import { spanish } from './harness/messages';

describe('the ontology of the node form', () => {
  it('lists the active classes by their display name', () => {
    const options = classOptions(ONTOLOGY);

    expect(options.map((option) => option.systemKey)).toEqual(['Idea', 'Problem', 'Resource']);
    expect(options.map((option) => option.label)).toEqual(['Idea', 'Problem', 'Resource']);
  });

  it('names the classes in the language of the interface', () => {
    // The ontology carries its own translations: a form whose labels are in
    // another language than the screen around them is half-translated.
    const options = classOptions(ONTOLOGY, 'es');

    expect(options.map((option) => option.label)).toEqual(['Idea', 'Problema', 'Recurso']);
  });

  it('prefers the name of the language of the interface and falls back to the english one', () => {
    expect(displayNameOf({ en: 'Problem', es: 'Problema' }, 'fallback', 'es')).toBe('Problema');
    expect(displayNameOf({ en: 'Problem', es: 'Problema' }, 'fallback', 'en')).toBe('Problem');
    expect(displayNameOf({ en: 'Problem' }, 'fallback', 'es')).toBe('Problem');
    expect(displayNameOf({ es: 'Problema' }, 'fallback')).toBe('Problema');
    expect(displayNameOf({}, 'fallback')).toBe('fallback');
    expect(displayNameOf(undefined, 'fallback')).toBe('fallback');
  });

  it('builds the attribute fields from the datatype properties of the class', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');

    expect(model.fields.map((field) => field.systemKey)).toEqual(['severity', 'source']);
    expect(model.label).toBe('Problem');
  });

  it('takes only the properties of the chosen class', () => {
    const model = buildNodeForm(ONTOLOGY, 'Idea');

    expect(model.fields.map((field) => field.systemKey)).toEqual([
      'dueDate',
      'resolved',
      'state'
    ]);
  });

  it('skips a property that re-declares a field of the node and says why', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');

    expect(model.skipped).toEqual([
      { systemKey: 'description', label: 'Description', reason: 'fixed-field' },
      { systemKey: 'title', label: 'Title', reason: 'fixed-field' }
    ]);
    expect(model.fields.some((field) => field.systemKey === 'title')).toBe(false);
    expect(model.fields.some((field) => field.systemKey === 'description')).toBe(false);
  });

  it('drives the field with the required flag and the default value', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');
    const severity = model.fields.find((field) => field.systemKey === 'severity');
    const source = model.fields.find((field) => field.systemKey === 'source');

    expect(severity?.isRequired).toBe(true);
    expect(severity?.datatype).toBe('number');
    expect(initialFieldValue(severity!)).toBe('3');

    expect(source?.isRequired).toBe(false);
    expect(initialFieldValue(source!)).toBe('runbook');
  });

  it('drives the input kind with the datatype', () => {
    const model = buildNodeForm(ONTOLOGY, 'Idea');
    const byKey = new Map(model.fields.map((field) => [field.systemKey, field]));

    expect(byKey.get('resolved')?.datatype).toBe('boolean');
    expect(byKey.get('dueDate')?.datatype).toBe('date');
    expect(byKey.get('state')?.datatype).toBe('enum');
    expect(byKey.get('state')?.allowedValues).toEqual(['draft', 'review', 'accepted']);
  });

  it('coerces the value of every datatype', () => {
    const problem = buildNodeForm(ONTOLOGY, 'Problem');
    const idea = buildNodeForm(ONTOLOGY, 'Idea');

    const severity = problem.fields.find((field) => field.systemKey === 'severity');
    const resolved = idea.fields.find((field) => field.systemKey === 'resolved');
    const dueDate = idea.fields.find((field) => field.systemKey === 'dueDate');
    const state = idea.fields.find((field) => field.systemKey === 'state');

    expect(coerceAttributeValue(severity!, '42')).toEqual({ ok: true, value: 42 });
    expect(coerceAttributeValue(resolved!, true)).toEqual({ ok: true, value: true });
    expect(coerceAttributeValue(dueDate!, '2026-10-31')).toEqual({ ok: true, value: '2026-10-31' });
    expect(coerceAttributeValue(state!, 'review')).toEqual({ ok: true, value: 'review' });
  });

  it('refuses a value that does not match the datatype', () => {
    const problem = buildNodeForm(ONTOLOGY, 'Problem');
    const idea = buildNodeForm(ONTOLOGY, 'Idea');

    const severity = problem.fields.find((field) => field.systemKey === 'severity');
    const dueDate = idea.fields.find((field) => field.systemKey === 'dueDate');
    const state = idea.fields.find((field) => field.systemKey === 'state');

    expect(coerceAttributeValue(severity!, 'high').ok).toBe(false);
    expect(coerceAttributeValue(dueDate!, '31/10/2026').ok).toBe(false);
    expect(coerceAttributeValue(dueDate!, '2026-02-31').ok).toBe(false);
    expect(coerceAttributeValue(state!, 'unknown').ok).toBe(false);
  });

  it('knows a real date from a real day', () => {
    expect(isDateInput('2026-10-31')).toBe(true);
    expect(isDateInput('2026-02-31')).toBe(false);
    expect(isDateInput('2026-10-3')).toBe(false);
  });

  it('rejects an invalid value before the request leaves the app', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');

    const result = validateNodeForm(
      model,
      { severity: 'high', source: 'runbook' },
      { title: 'A valid title', description: '' }
    );

    expect(result.valid).toBe(false);
    expect(spanish(result.errors['severity']!)).toBe('Este atributo debe ser un número.');
    // The invalid attribute is not sent: the form does not leave the app.
    expect(result.attributes).toEqual({ source: 'runbook' });
    expect(result.attributes['severity']).toBeUndefined();
  });

  it('rejects a title that is too short and a missing required attribute', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');

    const result = validateNodeForm(model, { severity: '', source: '' }, { title: 'ab', description: '' });

    expect(result.valid).toBe(false);
    expect(spanish(result.errors['title']!)).toBe('El título debe tener al menos 3 caracteres.');
    expect(spanish(result.errors['severity']!)).toBe('Este atributo es obligatorio.');
  });

  it('builds the attributes keyed by the system key of the property', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');

    const result = validateNodeForm(
      model,
      { severity: '5', source: 'minutes' },
      { title: 'The shuttle leaves every hour', description: 'Reported by the students.' }
    );

    expect(result.valid).toBe(true);
    expect(result.attributes).toEqual({ severity: 5, source: 'minutes' });
  });

  it('leaves an optional attribute that is empty out of the payload', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');

    const result = validateNodeForm(
      model,
      { severity: '3', source: '' },
      { title: 'The shuttle leaves every hour', description: '' }
    );

    expect(result.valid).toBe(true);
    expect(result.attributes).toEqual({ severity: 3 });
  });

  it('keeps an enum value and refuses one that is not allowed', () => {
    const model = buildNodeForm(ONTOLOGY, 'Idea');

    const accepted = validateNodeForm(
      model,
      { state: 'review', resolved: true, dueDate: '2026-10-31' },
      { title: 'Publish the timetable', description: '' }
    );
    expect(accepted.valid).toBe(true);
    expect(accepted.attributes).toEqual({ state: 'review', resolved: true, dueDate: '2026-10-31' });

    const refused = validateNodeForm(
      model,
      { state: 'unknown', resolved: true, dueDate: '' },
      { title: 'Publish the timetable', description: '' }
    );
    expect(refused.valid).toBe(false);
    expect(spanish(refused.errors['state']!)).toContain('draft, review, accepted');
  });

  it('builds an empty form for a workspace without any class', () => {
    const model = buildNodeForm(EMPTY_ONTOLOGY, 'Problem');

    expect(model.fields).toEqual([]);
    expect(model.skipped).toEqual([]);
    expect(classOptions(EMPTY_ONTOLOGY)).toEqual([]);
  });
});

describe('the relations of the edge form', () => {
  it('offers only the relations whose domain is the class of the source', () => {
    const relations = relationsForSource(ONTOLOGY, 'Problem');

    expect(relations.map((relation) => relation.systemKey)).toEqual(['RELATES_TO']);
  });

  it('offers the relations of the class of an idea', () => {
    const relations = relationsForSource(ONTOLOGY, 'Idea');

    expect(relations.map((relation) => relation.systemKey)).toEqual(['SUGGESTS']);
  });

  it('offers nothing for a class without relation', () => {
    expect(relationsForSource(ONTOLOGY, 'Resource')).toEqual([]);
    expect(relationsForSource(null, 'Problem')).toEqual([]);
  });

  it('accepts the pair of classes the API would accept', () => {
    const [relatesTo] = relationsForSource(ONTOLOGY, 'Problem');

    expect(relationAccepts(relatesTo, 'Problem', 'Idea')).toBe(true);
    expect(relationAccepts(relatesTo, 'Problem', 'Problem')).toBe(false);
    expect(relationAccepts(relatesTo, 'Problem', 'Resource')).toBe(false);
  });

  it('mirrors the default value of an enum', () => {
    const model = buildNodeForm(ONTOLOGY, 'Idea');
    const state = model.fields.find((field) => field.systemKey === 'state');

    expect(state?.systemKey).toBe(PROPERTY_STATE.systemKey);
    expect(initialFieldValue(state!)).toBe('draft');
  });

  it('keeps the source text as it is', () => {
    const model = buildNodeForm(ONTOLOGY, 'Problem');
    const source = model.fields.find((field) => field.systemKey === 'source');

    expect(source?.systemKey).toBe(PROPERTY_SOURCE.systemKey);
    expect(initialFieldValue(source!)).toBe('runbook');
  });
});
