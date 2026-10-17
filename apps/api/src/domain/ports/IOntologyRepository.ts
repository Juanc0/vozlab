import { OntologyClass } from '../entities/OntologyClass.js';
import { DatatypeProperty } from '../entities/DatatypeProperty.js';
import { ObjectProperty } from '../entities/ObjectProperty.js';

/**
 * Port: Ontology metamodel persistence contract (RF-06, RF-08, RF-09).
 * Scoped by `tid` (physical tenant DB).
 */
export interface IOntologyRepository {
  findClassById(id: string, tid: string): Promise<OntologyClass | null>;
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
  saveClass(cls: OntologyClass, tid: string, tx?: any): Promise<void>;
  saveDatatypeProperty(prop: DatatypeProperty, tid: string, tx?: any): Promise<void>;
  saveObjectProperty(prop: ObjectProperty, tid: string, tx?: any): Promise<void>;
}
