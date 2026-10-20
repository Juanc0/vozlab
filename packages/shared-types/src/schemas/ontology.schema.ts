import { z } from 'zod';

/**
 * Zod schemas for the collaborative ontology metamodel (RF-09).
 * Used when a user proposes new classes, datatype properties (attributes)
 * or object properties (typed relations with domain/range).
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
  status: string;
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
  status: string;
  proposedBy: string;
  /** ISO-8601 instant. */
  createdAt: string;
}
