import { z } from 'zod';
import { CreateNodeSchema } from './node.schema.js';

/**
 * Zod schema for batched node ingestion.
 *
 * Contract only — no endpoint is implemented yet. It exists so the Extractor
 * worker (docs/modules/modules_05) and the API agree on the payload shape when
 * batch ingestion is wired in a later batch. A batch carries between 1 and
 * 1000 nodes, each validated by `CreateNodeSchema`.
 */
export const BatchCreateNodeSchema = z.object({
  nodes: z.array(CreateNodeSchema).min(1).max(1000),
});

export type BatchCreateNodeInput = z.infer<typeof BatchCreateNodeSchema>;
