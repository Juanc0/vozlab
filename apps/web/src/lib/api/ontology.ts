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

export interface OntologyActionResult {
  readonly id: string;
  readonly systemKey: string;
  readonly status: string;
  readonly migrationTargetKey?: string | null;
}

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

export async function activateDatatypeProperty(
  client: ApiClient,
  propertyId: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/datatype-properties/${encodeURIComponent(propertyId)}/activate`
  });
  return body;
}

export async function rejectDatatypeProperty(
  client: ApiClient,
  propertyId: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/datatype-properties/${encodeURIComponent(propertyId)}/reject`
  });
  return body;
}

export async function activateObjectProperty(
  client: ApiClient,
  propertyId: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/object-properties/${encodeURIComponent(propertyId)}/activate`
  });
  return body;
}

export async function rejectObjectProperty(
  client: ApiClient,
  propertyId: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/object-properties/${encodeURIComponent(propertyId)}/reject`
  });
  return body;
}

export async function activateOntologyClass(
  client: ApiClient,
  classId: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/classes/${encodeURIComponent(classId)}/activate`
  });
  return body;
}

export async function rejectOntologyClass(
  client: ApiClient,
  classId: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/classes/${encodeURIComponent(classId)}/reject`
  });
  return body;
}

export interface OntologyProposalsDto {
  readonly classes: import('./types').OntologyClassDto[];
  readonly datatypeProperties: import('./types').DatatypePropertyDto[];
  readonly objectProperties: import('./types').ObjectPropertyDto[];
}

export async function listOntologyProposals(client: ApiClient): Promise<OntologyProposalsDto> {
  const body = await client.request<OntologyProposalsDto>({ path: '/ontology/proposals' });
  return {
    classes: Array.isArray(body?.classes) ? body.classes : [],
    datatypeProperties: Array.isArray(body?.datatypeProperties) ? body.datatypeProperties : [],
    objectProperties: Array.isArray(body?.objectProperties) ? body.objectProperties : []
  };
}

export async function deprecateOntologyClass(
  client: ApiClient,
  classId: string,
  migrationTargetKey: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/classes/${encodeURIComponent(classId)}/deprecate`,
    body: { migrationTargetKey }
  });
  return body;
}

export async function deprecateDatatypeProperty(
  client: ApiClient,
  propertyId: string,
  migrationTargetKey: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/datatype-properties/${encodeURIComponent(propertyId)}/deprecate`,
    body: { migrationTargetKey }
  });
  return body;
}

export async function deprecateObjectProperty(
  client: ApiClient,
  propertyId: string,
  migrationTargetKey: string
): Promise<OntologyActionResult> {
  const body = await client.request<OntologyActionResult>({
    method: 'PUT',
    path: `/ontology/object-properties/${encodeURIComponent(propertyId)}/deprecate`,
    body: { migrationTargetKey }
  });
  return body;
}
