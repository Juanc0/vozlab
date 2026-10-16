import {
  pgSchema,
  uuid,
  varchar,
  jsonb,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { workspaces } from './tenant.auth.schema.js';

/**
 * Meta schema: ontological metamodel (RF-06, RF-08, RF-09).
 * This schema resides in the institution's physical database.
 *
 *   ontology_classes    -> node/entity types (e.g. Problem, Idea, Resource)
 *   datatype_properties -> attributes of a class (drives dynamic forms, RF-06)
 *   object_properties   -> typed relations between classes, with domain/range (RF-08)
 */
export const metaSchema = pgSchema('meta');

export const ontologyClasses = metaSchema.table(
  'ontology_classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    systemKey: varchar('system_key', { length: 100 }).notNull(),
    displayNames: jsonb('display_names').notNull(), // { "es": "Problema", "en": "Problem" }
    descriptions: jsonb('descriptions').default({}),
    parentClassKey: varchar('parent_class_key', { length: 100 }),
    status: varchar('status', { length: 20 }).default('PROPOSED').notNull(), // PROPOSED | ACTIVE | REJECTED
    proposedBy: varchar('proposed_by', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One class key per workspace; classes are resolved by `system_key`.
    index('idx_ontology_classes_workspace_key').on(
      table.workspaceId,
      table.systemKey
    ),
  ]
);

/**
 * Datatype properties: scalar attributes attached to an ontology class.
 * The node creation form is built dynamically from these (RF-06).
 */
export const datatypeProperties = metaSchema.table(
  'datatype_properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    systemKey: varchar('system_key', { length: 100 }).notNull(),
    displayNames: jsonb('display_names').notNull(),
    descriptions: jsonb('descriptions').default({}),
    // Scalar kind the UI/validators must enforce.
    datatype: varchar('datatype', { length: 30 }).default('string').notNull(), // string | number | boolean | date | enum
    allowedValues: jsonb('allowed_values'), // for `enum` datatypes
    isRequired: boolean('is_required').default(false).notNull(),
    defaultValue: jsonb('default_value'),
    // Owning class (references ontology_classes.system_key).
    domainClassKey: varchar('domain_class_key', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }).default('PROPOSED').notNull(),
    proposedBy: varchar('proposed_by', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_datatype_properties_domain_class').on(
      table.workspaceId,
      table.domainClassKey
    ),
  ]
);

/**
 * Object properties: typed, directed relations between two classes, with
 * domain/range restrictions validated on edge creation (RF-08).
 */
export const objectProperties = metaSchema.table(
  'object_properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    systemKey: varchar('system_key', { length: 100 }).notNull(),
    displayNames: jsonb('display_names').notNull(),
    descriptions: jsonb('descriptions').default({}),
    // Domain (source) and range (target) class keys.
    domainClassKey: varchar('domain_class_key', { length: 100 }).notNull(),
    rangeClassKey: varchar('range_class_key', { length: 100 }).notNull(),
    isDirectional: boolean('is_directional').default(true).notNull(),
    isSymmetric: boolean('is_symmetric').default(false).notNull(),
    // Allows the self-loop / same-class relations to be flagged explicitly.
    allowsSelfRelation: boolean('allows_self_relation').default(false).notNull(),
    status: varchar('status', { length: 20 }).default('PROPOSED').notNull(),
    proposedBy: varchar('proposed_by', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_object_properties_domain_range').on(
      table.workspaceId,
      table.domainClassKey,
      table.rangeClassKey
    ),
  ]
);

export type OntologyClass = typeof ontologyClasses.$inferSelect;
export type DatatypeProperty = typeof datatypeProperties.$inferSelect;
export type ObjectProperty = typeof objectProperties.$inferSelect;
