import { randomUUID } from 'node:crypto';
import { OntologyClass } from '../../domain/entities/OntologyClass.js';
import { ObjectProperty } from '../../domain/entities/ObjectProperty.js';

/**
 * The ontology every new workspace is born with (US-00).
 *
 * A workspace without an ontology cannot create a node: the node form is
 * driven by the metamodel and `CreateNodeUseCase` requires an ACTIVE class.
 * These are the same three classes and five relations the development seed
 * uses, so a workspace created from the administration screen is immediately
 * usable instead of needing hand-written SQL.
 *
 * The creator is the author of the rows (`proposed_by`), which keeps the
 * pseudonymous authorship rule intact.
 */
export function baseOntologyClasses(
  workspaceId: string,
  authorHash: string
): OntologyClass[] {
  return [
    new OntologyClass(
      randomUUID(),
      workspaceId,
      'Problem',
      { en: 'Problem', es: 'Problema' },
      {
        en: 'A challenge or need raised by the community.',
        es: 'Un reto o necesidad planteada por la comunidad.',
      },
      null,
      'ACTIVE',
      authorHash
    ),
    new OntologyClass(
      randomUUID(),
      workspaceId,
      'Idea',
      { en: 'Idea', es: 'Idea' },
      {
        en: 'A proposed solution or approach.',
        es: 'Una solución o enfoque propuesto.',
      },
      null,
      'ACTIVE',
      authorHash
    ),
    new OntologyClass(
      randomUUID(),
      workspaceId,
      'Resource',
      { en: 'Resource', es: 'Recurso' },
      {
        en: 'Material, data or tool relevant to the community.',
        es: 'Material, dato o herramienta relevante para la comunidad.',
      },
      null,
      'ACTIVE',
      authorHash
    ),
  ];
}

export function baseOntologyRelations(
  workspaceId: string,
  authorHash: string
): ObjectProperty[] {
  return [
    new ObjectProperty(
      randomUUID(),
      workspaceId,
      'RELATES_TO',
      { en: 'Relates to', es: 'Se relaciona con' },
      {
        en: 'Links a problem to a proposed idea.',
        es: 'Vincula un problema con una idea propuesta.',
      },
      'Problem',
      'Idea',
      true,
      false,
      false,
      'ACTIVE',
      authorHash
    ),
    new ObjectProperty(
      randomUUID(),
      workspaceId,
      'INVOLVES',
      { en: 'Involves', es: 'Involucra' },
      {
        en: 'A problem that involves another problem.',
        es: 'Un problema que involucra a otro problema.',
      },
      'Problem',
      'Problem',
      true,
      false,
      true,
      'ACTIVE',
      authorHash
    ),
    new ObjectProperty(
      randomUUID(),
      workspaceId,
      'ADDRESSES',
      { en: 'Addresses', es: 'Atiende' },
      {
        en: 'An idea that addresses a problem.',
        es: 'Una idea que atiende un problema.',
      },
      'Idea',
      'Problem',
      true,
      false,
      false,
      'ACTIVE',
      authorHash
    ),
    new ObjectProperty(
      randomUUID(),
      workspaceId,
      'BUILDS_ON',
      { en: 'Builds on', es: 'Se apoya en' },
      {
        en: 'An idea that builds on another idea.',
        es: 'Una idea que se apoya en otra idea.',
      },
      'Idea',
      'Idea',
      true,
      false,
      true,
      'ACTIVE',
      authorHash
    ),
    new ObjectProperty(
      randomUUID(),
      workspaceId,
      'EVIDENCED_BY',
      { en: 'Evidenced by', es: 'Está respaldado por' },
      {
        en: 'A problem backed by a resource (a report, a norm, a survey).',
        es: 'Un problema respaldado por un recurso (un informe, una norma, una encuesta).',
      },
      'Problem',
      'Resource',
      true,
      false,
      false,
      'ACTIVE',
      authorHash
    ),
  ];
}
