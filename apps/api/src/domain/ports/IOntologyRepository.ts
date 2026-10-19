import { DbTransaction } from './Transaction.js';
import { OntologyClass } from '../entities/OntologyClass.js';
import { DatatypeProperty } from '../entities/DatatypeProperty.js';
import { ObjectProperty } from '../entities/ObjectProperty.js';

/**
 * Port: Ontology metamodel persistence contract (RF-06, RF-08, RF-09).
 * Scoped by `tid` (physical tenant DB).
 */
export interface IOntologyRepository {
  findClassById(id: string, workspaceId: string, tid: string): Promise<OntologyClass | null>;
  findClassByKey(systemKey: string, workspaceId: string, tid: string): Promise<OntologyClass | null>;
  findActiveClasses(workspaceId: string, tid: string): Promise<OntologyClass[]>;
  findDatatypeProperties(
    domainClassKey: string,
    workspaceId: string,
    tid: string
  ): Promise<DatatypeProperty[]>;
  findObjectProperty(
    relationKey: string,
    workspaceId: string,
    tid: string
  ): Promise<ObjectProperty | null>;
  findActiveObjectProperties(workspaceId: string, tid: string): Promise<ObjectProperty[]>;
  saveClass(cls: OntologyClass, tid: string, tx?: DbTransaction): Promise<void>;
  saveDatatypeProperty(prop: DatatypeProperty, tid: string, tx?: DbTransaction): Promise<void>;
  saveObjectProperty(prop: ObjectProperty, tid: string, tx?: DbTransaction): Promise<void>;
  /**
   * Apply an approved proposal's delta to an ontology class (RF-10/FR-12):
   * only `displayNames` / `descriptions` / `parentClassKey` are accepted.
   */
  applyClassDelta(
    targetId: string,
    proposedChanges: Record<string, unknown>,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void>;
  /**
   * Promote a proposed class to `ACTIVE` (FR-09), honouring the
   * `OntologyClass` state machine.
   */
  activateClass(targetId: string, workspaceId: string, tid: string, tx?: DbTransaction): Promise<void>;
}
