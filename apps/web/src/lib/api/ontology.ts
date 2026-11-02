/**
 * The read of the active metamodel.
 *
 * `GET /api/v1/ontology` answers with the **active** classes, object
 * properties and datatype properties of the workspace. A property that is
 * still `PROPOSED` never reaches the client, so what comes back here is
 * exactly what the dynamic creation form may offer (FR-06, FR-08).
 *
 * The response is the workspace's whole metamodel: it changes rarely, so the
 * caller reads it once and keeps it.
 */

import type { ApiClient } from './client';
import type { OntologyResponseDto } from './types';

/**
 * Reads the active ontology of the workspace.
 *
 * The three collections are normalised: a body that is missing one of them
 * yields an empty list rather than a crash.
 */
export async function loadOntology(client: ApiClient): Promise<OntologyResponseDto> {
  const body = await client.request<OntologyResponseDto>({ path: '/ontology' });

  return {
    classes: Array.isArray(body?.classes) ? body.classes : [],
    objectProperties: Array.isArray(body?.objectProperties) ? body.objectProperties : [],
    datatypeProperties: Array.isArray(body?.datatypeProperties) ? body.datatypeProperties : []
  };
}
