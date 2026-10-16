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
