import type { Edge } from '../../domain/entities/Edge.js';
import type { Node } from '../../domain/entities/Node.js';
import type { SubgraphEdge } from '../../domain/ports/INodeRepository.js';
import type { IOntologyRepository } from '../../domain/ports/IOntologyRepository.js';

/**
 * The display names of a class or of a relation, by language.
 *
 * The shape is the one the ontology already uses
 * (`meta.ontology_classes.display_names`): `{"en": "Problem", "es": "Problema"}`.
 * An empty map means "the ontology does not know this key" — never `null`
 * and never a map with holes.
 */
export type DisplayNames = Record<string, string>;

/**
 * The names of the metamodel of a workspace, by key.
 *
 * `classes` is keyed by the `systemKey` of the class — the `typeKey` of a
 * node — and `properties` by the `systemKey` of the object property — the
 * `relationKey` of a relation.
 */
export interface MetamodelNames {
  readonly classes: ReadonlyMap<string, DisplayNames>;
  readonly properties: ReadonlyMap<string, DisplayNames>;
}

/** A node and the display names of its class. */
export interface NamedNode {
  readonly node: Node;
  readonly typeDisplayNames: DisplayNames;
}

/** A relation and the display names of its property. */
export interface NamedEdge {
  readonly edge: Edge;
  readonly relationDisplayNames: DisplayNames;
}

/** A relation of a subgraph and the display names of its property. */
export interface NamedRelation {
  readonly relation: SubgraphEdge;
  readonly relationDisplayNames: DisplayNames;
}

/**
 * The catalog of the display names of a workspace.
 *
 * The **composition** of the names, not a join: the repository of the nodes
 * stays about the nodes and the repository of the ontology stays about the
 * metamodel. The use case asks this catalog and maps the keys of the graph
 * onto the names of the ontology.
 *
 * The catalog reads the active metamodel of the workspace in **two
 * queries** — the classes and the object properties — whatever the number of
 * nodes and relations is. A window of two hundred nodes and two hundred
 * relations is therefore two hundred and two queries, not four hundred: the
 * lookup is never per node.
 *
 * The workspace scopes both reads: the adapter filters on
 * `workspace_id = $workspaceId`, so a class of another workspace is never
 * in the catalog and never leaks.
 */
export class DisplayNameCatalog {
  constructor(private readonly ontologyRepo: IOntologyRepository) {}

  /**
   * Reads the names of the active metamodel of the workspace.
   *
   * Only the ACTIVE classes and properties are in the catalog: a class that
   * is still `PROPOSED` is a proposal, and a proposal never reaches the
   * client (the governance invariant of the ontology read).
   */
  async read(workspaceId: string, tid: string): Promise<MetamodelNames> {
    const [classes, properties] = await Promise.all([
      this.ontologyRepo.findActiveClasses(workspaceId, tid),
      this.ontologyRepo.findActiveObjectProperties(workspaceId, tid),
    ]);

    return {
      classes: new Map(classes.map((cls) => [cls.systemKey, { ...cls.displayNames }])),
      properties: new Map(
        properties.map((property) => [property.systemKey, { ...property.displayNames }])
      ),
    };
  }
}

/**
 * The names of the class of a node.
 *
 * A class that is not in the ontology gets an **empty map**: the client
 * falls back to the key of the node, and the graph never fails because a
 * class is missing.
 */
export function classNames(names: MetamodelNames, typeKey: string): DisplayNames {
  return names.classes.get(typeKey) ?? {};
}

/**
 * The names of the property of a relation.
 *
 * A property that is not in the ontology gets an **empty map**: the client
 * falls back to the key of the relation.
 */
export function propertyNames(names: MetamodelNames, relationKey: string): DisplayNames {
  return names.properties.get(relationKey) ?? {};
}
