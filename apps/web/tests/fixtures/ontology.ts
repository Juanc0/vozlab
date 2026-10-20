/**
 * The fixtures of the ontology.
 *
 * They mirror the dev seed (`packages/database/scripts/seed-dev.ts`): the
 * ACTIVE classes `Problem`, `Idea` and `Resource`, the ACTIVE datatype
 * properties `title` and `description` of `Problem` — the two that
 * re-declare the node's own fields — and the ACTIVE relation `RELATES_TO`
 * from a `Problem` to an `Idea`.
 */

import type {
  DatatypePropertyDto,
  OntologyClassDto,
  OntologyResponseDto,
  ObjectPropertyDto
} from '$lib/api/types';
import { WORKSPACE_ID } from './graph';

const AUTHOR = 'a'.repeat(64);
const CREATED_AT = '2026-10-19T09:00:00.000Z';

export const CLASS_PROBLEM: OntologyClassDto = {
  id: '11111111-2222-4333-8444-555555555551',
  workspaceId: WORKSPACE_ID,
  systemKey: 'Problem',
  displayNames: { en: 'Problem', es: 'Problema' },
  descriptions: { en: 'Something that has to be solved.' },
  parentClassKey: null,
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

export const CLASS_IDEA: OntologyClassDto = {
  id: '11111111-2222-4333-8444-555555555552',
  workspaceId: WORKSPACE_ID,
  systemKey: 'Idea',
  displayNames: { en: 'Idea', es: 'Idea' },
  descriptions: { en: 'A proposed solution.' },
  parentClassKey: null,
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

export const CLASS_RESOURCE: OntologyClassDto = {
  id: '11111111-2222-4333-8444-555555555553',
  workspaceId: WORKSPACE_ID,
  systemKey: 'Resource',
  displayNames: { en: 'Resource', es: 'Recurso' },
  descriptions: {},
  parentClassKey: null,
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** The `title` property of `Problem` — it re-declares a field of the node. */
export const PROPERTY_TITLE: DatatypePropertyDto = {
  id: '22222222-2222-4333-8444-555555555551',
  workspaceId: WORKSPACE_ID,
  systemKey: 'title',
  displayNames: { en: 'Title', es: 'Título' },
  descriptions: { en: 'The title of the problem.' },
  datatype: 'string',
  allowedValues: null,
  isRequired: true,
  defaultValue: null,
  domainClassKey: 'Problem',
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** The `description` property of `Problem` — it re-declares one too. */
export const PROPERTY_DESCRIPTION: DatatypePropertyDto = {
  id: '22222222-2222-4333-8444-555555555552',
  workspaceId: WORKSPACE_ID,
  systemKey: 'description',
  displayNames: { en: 'Description', es: 'Descripción' },
  descriptions: {},
  datatype: 'string',
  allowedValues: null,
  isRequired: false,
  defaultValue: null,
  domainClassKey: 'Problem',
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** A required number with a default value. */
export const PROPERTY_SEVERITY: DatatypePropertyDto = {
  id: '22222222-2222-4333-8444-555555555553',
  workspaceId: WORKSPACE_ID,
  systemKey: 'severity',
  displayNames: { en: 'Severity' },
  descriptions: {},
  datatype: 'number',
  allowedValues: null,
  isRequired: true,
  defaultValue: 3,
  domainClassKey: 'Problem',
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** An optional text with a default value. */
export const PROPERTY_SOURCE: DatatypePropertyDto = {
  id: '22222222-2222-4333-8444-555555555554',
  workspaceId: WORKSPACE_ID,
  systemKey: 'source',
  displayNames: { en: 'Source' },
  descriptions: {},
  datatype: 'string',
  allowedValues: null,
  isRequired: false,
  defaultValue: 'runbook',
  domainClassKey: 'Problem',
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** A boolean of `Idea`. */
export const PROPERTY_RESOLVED: DatatypePropertyDto = {
  id: '22222222-2222-4333-8444-555555555555',
  workspaceId: WORKSPACE_ID,
  systemKey: 'resolved',
  displayNames: { en: 'Resolved' },
  descriptions: {},
  datatype: 'boolean',
  allowedValues: null,
  isRequired: false,
  defaultValue: false,
  domainClassKey: 'Idea',
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** A date of `Idea`. */
export const PROPERTY_DUE_DATE: DatatypePropertyDto = {
  id: '22222222-2222-4333-8444-555555555556',
  workspaceId: WORKSPACE_ID,
  systemKey: 'dueDate',
  displayNames: { en: 'Due date' },
  descriptions: {},
  datatype: 'date',
  allowedValues: null,
  isRequired: false,
  defaultValue: null,
  domainClassKey: 'Idea',
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** An enum of `Idea`. */
export const PROPERTY_STATE: DatatypePropertyDto = {
  id: '22222222-2222-4333-8444-555555555557',
  workspaceId: WORKSPACE_ID,
  systemKey: 'state',
  displayNames: { en: 'State' },
  descriptions: {},
  datatype: 'enum',
  allowedValues: ['draft', 'review', 'accepted'],
  isRequired: true,
  defaultValue: 'draft',
  domainClassKey: 'Idea',
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** The relation of the dev seed: a `Problem` points at an `Idea`. */
export const PROPERTY_RELATES_TO: ObjectPropertyDto = {
  id: '33333333-2222-4333-8444-555555555551',
  workspaceId: WORKSPACE_ID,
  systemKey: 'RELATES_TO',
  displayNames: { en: 'Relates to', es: 'Se relaciona con' },
  descriptions: { en: 'Links a problem to a proposed idea.' },
  domainClassKey: 'Problem',
  rangeClassKey: 'Idea',
  isDirectional: true,
  isSymmetric: false,
  allowsSelfRelation: false,
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** A relation that starts at an `Idea` — it must not be offered for a `Problem`. */
export const PROPERTY_SUGGESTS: ObjectPropertyDto = {
  id: '33333333-2222-4333-8444-555555555552',
  workspaceId: WORKSPACE_ID,
  systemKey: 'SUGGESTS',
  displayNames: { en: 'Suggests' },
  descriptions: {},
  domainClassKey: 'Idea',
  rangeClassKey: 'Problem',
  isDirectional: true,
  isSymmetric: false,
  allowsSelfRelation: false,
  status: 'ACTIVE',
  proposedBy: AUTHOR,
  createdAt: CREATED_AT
};

/** The whole active metamodel of the fixture workspace. */
export const ONTOLOGY: OntologyResponseDto = {
  classes: [CLASS_PROBLEM, CLASS_IDEA, CLASS_RESOURCE],
  objectProperties: [PROPERTY_RELATES_TO, PROPERTY_SUGGESTS],
  datatypeProperties: [
    PROPERTY_TITLE,
    PROPERTY_DESCRIPTION,
    PROPERTY_SEVERITY,
    PROPERTY_SOURCE,
    PROPERTY_RESOLVED,
    PROPERTY_DUE_DATE,
    PROPERTY_STATE
  ]
};

/** The metamodel of a workspace without any active class. */
export const EMPTY_ONTOLOGY: OntologyResponseDto = {
  classes: [],
  objectProperties: [],
  datatypeProperties: []
};
