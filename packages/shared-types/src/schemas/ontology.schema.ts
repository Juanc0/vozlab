import { z } from 'zod';

/**
 * Zod schemas for the collaborative ontology metamodel (RF-09).
 * Used when a user proposes new classes, datatype properties (attributes)
 * or object properties (typed relations with domain/range).
 */

/**
 * The lifecycle states of an ontology element (class, datatype property,
 * object property).
 *
 * The domain entity `domain/entities/OntologyClass.ts` calls this
 * vocabulary `OntologyStatus` and imports it from here — the values are
 * declared once.
 */
export const PropertyStatusSchema = z.enum(['PROPOSED', 'ACTIVE', 'REJECTED']);
export type PropertyStatus = z.infer<typeof PropertyStatusSchema>;

export const DatatypeKindSchema = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'enum',
]);
export type DatatypeKind = z.infer<typeof DatatypeKindSchema>;

export const ProposeOntologyClassSchema = z.object({
  systemKey: z.string().min(1).max(100),
  displayNames: z.record(z.string()),
  descriptions: z.record(z.string()).default({}),
  parentClassKey: z.string().max(100).optional(),
});
export type ProposeOntologyClassInput = z.infer<typeof ProposeOntologyClassSchema>;

export const ProposeDatatypePropertySchema = z.object({
  systemKey: z.string().min(1).max(100),
  displayNames: z.record(z.string()),
  descriptions: z.record(z.string()).default({}),
  datatype: DatatypeKindSchema.default('string'),
  allowedValues: z.array(z.string()).optional(),
  isRequired: z.boolean().default(false),
  defaultValue: z.any().optional(),
  domainClassKey: z.string().min(1).max(100),
});
export type ProposeDatatypePropertyInput = z.infer<
  typeof ProposeDatatypePropertySchema
>;

export const ProposeObjectPropertySchema = z.object({
  systemKey: z.string().min(1).max(100),
  displayNames: z.record(z.string()),
  descriptions: z.record(z.string()).default({}),
  domainClassKey: z.string().min(1).max(100),
  rangeClassKey: z.string().min(1).max(100),
  isDirectional: z.boolean().default(true),
  isSymmetric: z.boolean().default(false),
  allowsSelfRelation: z.boolean().default(false),
});
export type ProposeObjectPropertyInput = z.infer<
  typeof ProposeObjectPropertySchema
>;

/**
 * Stable JSON projection of an OntologyClass — the element returned by
 * `GET /api/v1/ontology`.
 *
 * It never leaks internal state beyond what consumers need to render the
 * metamodel. The API owns the projection (`OntologyController`); the PWA
 * consumes the result read-only.
 */
export interface OntologyClassDto {
  id: string;
  /** `null` for a system-wide class. */
  workspaceId: string | null;
  systemKey: string;
  displayNames: Record<string, string>;
  descriptions: Record<string, string>;
  parentClassKey: string | null;
  status: PropertyStatus;
  proposedBy: string;
  /** ISO-8601 instant. */
  createdAt: string;
}

/**
 * Stable JSON projection of an ObjectProperty (domain/range typed relation)
 * — the element returned by `GET /api/v1/ontology`.
 *
 * The API owns the projection (`OntologyController`); the PWA consumes the
 * result read-only.
 */
export interface ObjectPropertyDto {
  id: string;
  /** `null` for a system-wide property. */
  workspaceId: string | null;
  systemKey: string;
  displayNames: Record<string, string>;
  descriptions: Record<string, string>;
  domainClassKey: string;
  rangeClassKey: string;
  isDirectional: boolean;
  isSymmetric: boolean;
  allowsSelfRelation: boolean;
  status: PropertyStatus;
  proposedBy: string;
  /** ISO-8601 instant. */
  createdAt: string;
}

/**
 * Stable JSON projection of a DatatypeProperty (scalar attribute of a class)
 * — the element returned by `GET /api/v1/ontology`.
 *
 * It is exactly what the PWA needs to build the dynamic node-creation form
 * (FR-06): the scalar kind, the enum domain, the required flag and the
 * default value.
 *
 * The API owns the projection (`OntologyController`); the PWA consumes the
 * result read-only.
 */
export interface DatatypePropertyDto {
  id: string;
  /** `null` for a system-wide property. */
  workspaceId: string | null;
  systemKey: string;
  displayNames: Record<string, string>;
  descriptions: Record<string, string>;
  /** The scalar kind the form must enforce. */
  datatype: DatatypeKind;
  /** The enum domain; `null` for every other datatype. */
  allowedValues: string[] | null;
  isRequired: boolean;
  defaultValue: unknown;
  /** The class this attribute belongs to (its `systemKey`). */
  domainClassKey: string;
  status: PropertyStatus;
  proposedBy: string;
  /** ISO-8601 instant. */
  createdAt: string;
}

/**
 * The body of `GET /api/v1/ontology`.
 *
 * The three collections are the *active* metamodel of the workspace: a
 * proposal awaiting approval never reaches the client (governance invariant).
 */
export interface OntologyResponseDto {
  classes: OntologyClassDto[];
  objectProperties: ObjectPropertyDto[];
  datatypeProperties: DatatypePropertyDto[];
}
