import { and, eq } from 'drizzle-orm';
import {
  ontologyClasses,
  datatypeProperties,
  objectProperties,
} from '@vozlab/database';
import { OntologyClass, OntologyStatus } from '../../../domain/entities/OntologyClass.js';
import { DatatypeProperty, DatatypeKind } from '../../../domain/entities/DatatypeProperty.js';
import { ObjectProperty } from '../../../domain/entities/ObjectProperty.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { IOntologyRepository } from '../../../domain/ports/IOntologyRepository.js';
import { ConnectionPoolManager } from '../ConnectionPoolManager.js';
import { DbTransaction } from '../../../domain/ports/Transaction.js';

/** Concrete Drizzle transaction type resolved from the tenant pool client. */
type Tx = Parameters<
  Parameters<Awaited<ReturnType<ConnectionPoolManager['getDb']>>['transaction']>[0]
>[0];

/**
 * DrizzleOntologyRepository: persists the metamodel in the tenant DB's
 * `meta` schema. Scoped by `tid`.
 */
export class DrizzleOntologyRepository implements IOntologyRepository {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  private async client(tid: string, tx?: DbTransaction) {
    return (tx as Tx | undefined) ?? (await this.poolManager.getDb(tid));
  }

  async findClassById(
    id: string,
    workspaceId: string,
    tid: string
  ): Promise<OntologyClass | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(ontologyClasses)
      .where(
        and(eq(ontologyClasses.id, id), eq(ontologyClasses.workspaceId, workspaceId))
      )
      .limit(1);
    return row ? classToDomain(row) : null;
  }

  async findClassByKey(
    systemKey: string,
    workspaceId: string,
    tid: string
  ): Promise<OntologyClass | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(ontologyClasses)
      .where(
        and(
          eq(ontologyClasses.systemKey, systemKey),
          eq(ontologyClasses.workspaceId, workspaceId)
        )
      )
      .limit(1);
    return row ? classToDomain(row) : null;
  }

  async findActiveClasses(workspaceId: string, tid: string): Promise<OntologyClass[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(ontologyClasses)
      .where(
        and(
          eq(ontologyClasses.workspaceId, workspaceId),
          eq(ontologyClasses.status, 'ACTIVE')
        )
      );
    return rows.map(classToDomain);
  }

  async findDatatypeProperties(
    domainClassKey: string,
    workspaceId: string,
    tid: string
  ): Promise<DatatypeProperty[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(datatypeProperties)
      .where(
        and(
          eq(datatypeProperties.domainClassKey, domainClassKey),
          eq(datatypeProperties.workspaceId, workspaceId)
        )
      );
    return rows.map(datatypeToDomain);
  }

  /**
   * ACTIVE datatype properties of the workspace.
   *
   * Stricter than `findDatatypeProperties` (which filters by class only): the
   * status predicate keeps a `PROPOSED`/`REJECTED` attribute out of the
   * dynamic form, exactly as `findActiveObjectProperties` does for relations.
   */
  async findActiveDatatypeProperties(
    workspaceId: string,
    tid: string
  ): Promise<DatatypeProperty[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(datatypeProperties)
      .where(
        and(
          eq(datatypeProperties.workspaceId, workspaceId),
          eq(datatypeProperties.status, 'ACTIVE')
        )
      );
    return rows.map(datatypeToDomain);
  }

  async findObjectProperty(
    relationKey: string,
    workspaceId: string,
    tid: string
  ): Promise<ObjectProperty | null> {
    const db = await this.client(tid);
    const [row] = await db
      .select()
      .from(objectProperties)
      .where(
        and(
          eq(objectProperties.systemKey, relationKey),
          eq(objectProperties.workspaceId, workspaceId)
        )
      )
      .limit(1);
    return row ? objectToDomain(row) : null;
  }

  async findActiveObjectProperties(
    workspaceId: string,
    tid: string
  ): Promise<ObjectProperty[]> {
    const db = await this.client(tid);
    const rows = await db
      .select()
      .from(objectProperties)
      .where(
        and(
          eq(objectProperties.workspaceId, workspaceId),
          eq(objectProperties.status, 'ACTIVE')
        )
      );
    return rows.map(objectToDomain);
  }

  async saveClass(cls: OntologyClass, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(ontologyClasses).values({
      id: cls.id,
      workspaceId: cls.workspaceId,
      systemKey: cls.systemKey,
      displayNames: cls.displayNames,
      descriptions: cls.descriptions,
      parentClassKey: cls.parentClassKey,
      status: cls.status,
      proposedBy: cls.proposedBy,
      createdAt: cls.createdAt,
    });
  }

  async saveDatatypeProperty(prop: DatatypeProperty, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(datatypeProperties).values({
      id: prop.id,
      workspaceId: prop.workspaceId,
      systemKey: prop.systemKey,
      displayNames: prop.displayNames,
      descriptions: prop.descriptions,
      datatype: prop.datatype,
      allowedValues: prop.allowedValues,
      isRequired: prop.isRequired,
      defaultValue: prop.defaultValue,
      domainClassKey: prop.domainClassKey,
      status: prop.status,
      proposedBy: prop.proposedBy,
      createdAt: prop.createdAt,
    });
  }

  async saveObjectProperty(prop: ObjectProperty, tid: string, tx?: DbTransaction): Promise<void> {
    const db = await this.client(tid, tx);
    await db.insert(objectProperties).values({
      id: prop.id,
      workspaceId: prop.workspaceId,
      systemKey: prop.systemKey,
      displayNames: prop.displayNames,
      descriptions: prop.descriptions,
      domainClassKey: prop.domainClassKey,
      rangeClassKey: prop.rangeClassKey,
      isDirectional: prop.isDirectional,
      isSymmetric: prop.isSymmetric,
      allowsSelfRelation: prop.allowsSelfRelation,
      status: prop.status,
      proposedBy: prop.proposedBy,
      createdAt: prop.createdAt,
    });
  }

  async applyClassDelta(
    targetId: string,
    proposedChanges: Record<string, unknown>,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .select()
      .from(ontologyClasses)
      .where(
        and(eq(ontologyClasses.id, targetId), eq(ontologyClasses.workspaceId, workspaceId))
      )
      .limit(1);

    if (!row) {
      throw new DomainError('ERR_VALIDATION_FAILED', `ontology class ${targetId} not found`);
    }

    // Whitelist accepted keys; never spread unknown jsonb keys into the update.
    const patch: Record<string, any> = {};
    if (proposedChanges.displayNames !== undefined) {
      patch.displayNames = proposedChanges.displayNames;
    }
    if (proposedChanges.descriptions !== undefined) {
      patch.descriptions = proposedChanges.descriptions;
    }
    if (proposedChanges.parentClassKey !== undefined) {
      patch.parentClassKey = proposedChanges.parentClassKey;
    }

    if (Object.keys(patch).length === 0) {
      return;
    }

    await db
      .update(ontologyClasses)
      .set(patch)
      .where(
        and(eq(ontologyClasses.id, targetId), eq(ontologyClasses.workspaceId, workspaceId))
      );
  }

  async activateClass(
    targetId: string,
    workspaceId: string,
    tid: string,
    tx?: DbTransaction
  ): Promise<void> {
    const db = await this.client(tid, tx);
    const [row] = await db
      .select()
      .from(ontologyClasses)
      .where(
        and(eq(ontologyClasses.id, targetId), eq(ontologyClasses.workspaceId, workspaceId))
      )
      .limit(1);

    if (!row) {
      throw new DomainError('ERR_VALIDATION_FAILED', `ontology class ${targetId} not found`);
    }

    // Domain state machine: throws ERR_INVALID_STATE_TRANSITION when not PROPOSED.
    const cls = classToDomain(row);
    cls.activate();

    await db
      .update(ontologyClasses)
      .set({ status: cls.status })
      .where(
        and(eq(ontologyClasses.id, targetId), eq(ontologyClasses.workspaceId, workspaceId))
      );
  }
}

function classToDomain(row: typeof ontologyClasses.$inferSelect): OntologyClass {
  return new OntologyClass(
    row.id,
    row.workspaceId ?? null,
    row.systemKey,
    row.displayNames as Record<string, string>,
    (row.descriptions as Record<string, string>) ?? {},
    row.parentClassKey ?? null,
    row.status as OntologyStatus,
    row.proposedBy,
    row.createdAt
  );
}

function datatypeToDomain(row: typeof datatypeProperties.$inferSelect): DatatypeProperty {
  return new DatatypeProperty(
    row.id,
    row.workspaceId ?? null,
    row.systemKey,
    row.displayNames as Record<string, string>,
    (row.descriptions as Record<string, string>) ?? {},
    row.datatype as DatatypeKind,
    (row.allowedValues as string[]) ?? null,
    row.isRequired,
    row.defaultValue,
    row.domainClassKey,
    row.status as OntologyStatus,
    row.proposedBy,
    row.createdAt
  );
}

function objectToDomain(row: typeof objectProperties.$inferSelect): ObjectProperty {
  return new ObjectProperty(
    row.id,
    row.workspaceId ?? null,
    row.systemKey,
    row.displayNames as Record<string, string>,
    (row.descriptions as Record<string, string>) ?? {},
    row.domainClassKey,
    row.rangeClassKey,
    row.isDirectional,
    row.isSymmetric,
    row.allowsSelfRelation,
    row.status as OntologyStatus,
    row.proposedBy,
    row.createdAt
  );
}
