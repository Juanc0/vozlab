# TASK-13 — Ontology Vertical: Properties, Activation, Routes

> **Batch:** Phase 1R.3 (propagation) · **Depends on:** TASK-09, TASK-10 · **Size:** L
> **Self-contained:** yes.

## 1. Context
FR-06/FR-08/FR-09 specify a **collaborative dynamic metamodel** stored under `meta.*`:
- `meta.ontology_classes` (node types),
- `meta.datatype_properties` (scalar attributes; drives dynamic forms — FR-06),
- `meta.object_properties` (typed relations with domain/range — FR-08).

The code already has:
- Entities `OntologyClass` (with `activate`/`reject`), `DatatypeProperty` (with
  `validateValue`/`activate`), `ObjectProperty` (with `accepts` domain/range + `activate`).
- Port `IOntologyRepository` (reads + `saveClass`/`saveDatatypeProperty`/`saveObjectProperty`,
  `findClassById`, `applyClassDelta`, `activateClass` after TASK-08/TASK-09).
- Adapter `DrizzleOntologyRepository`.
- Use case `ProposeOntologyClassUseCase` and controller `OntologyController` (only a class
  proposal handler).
- Zod schemas: `ProposeOntologyClassSchema`, `ProposeDatatypePropertySchema`,
  `ProposeObjectPropertySchema` in `packages/shared-types`.

**What is missing:** the vertical is **not wired** (`routes.ts` has no `/ontology` route,
`server.ts` never instantiates these), and there are no use cases for datatype/object
properties, no read endpoints, and no activation endpoint.

## 2. Objective
Wire the ontology vertical and complete it: propose datatype/object properties, list/read the
active metamodel, and activate/reject proposals.

## 3. Project conventions (non-negotiable)
- **pnpm only**; NodeNext: relative `.ts` imports end with `.js`.
- `domain/` purity; adapters take `tid`; manual Composition Root.
- Everything born `PROPOSED`; only approval/activation makes it usable (governance invariant).
- Errors via `DomainError` + `sendError`/`mapDomainError` (TASK-06).
- `pnpm turbo run build` must pass.

## 4. Files to touch
| Action | Create/Edit | Path |
| --- | --- | --- |
| Create | use case | `apps/api/src/application/use_cases/ProposeDatatypePropertyUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/ProposeObjectPropertyUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/ActivateOntologyClassUseCase.ts` |
| Create | use case | `apps/api/src/application/use_cases/GetOntologyUseCase.ts` |
| Edit | use case | `apps/api/src/application/use_cases/ProposeOntologyClassUseCase.ts` (DomainError + DI) |
| Edit | controller | `apps/api/src/infrastructure/http/controllers/OntologyController.ts` |
| Edit | wiring | `apps/api/src/infrastructure/http/routes.ts` |
| Edit | composition | `apps/api/src/infrastructure/http/server.ts` |

## 5. Step-by-step instructions
1. `ProposeDatatypePropertyUseCase`:
   - validate that `domainClassKey` exists via `ontologyRepo.findClassByKey(...)`
     (`DomainError('ERR_VALIDATION_FAILED')` otherwise);
   - build a `DatatypeProperty` in `PROPOSED` and `saveDatatypeProperty(prop, tid)`;
   - publish `ONTOLOGY_PROPERTY_PROPOSED`.
2. `ProposeObjectPropertyUseCase`:
   - validate `domainClassKey` and `rangeClassKey` exist;
   - build `ObjectProperty` in `PROPOSED` and `saveObjectProperty(prop, tid)`;
   - publish `ONTOLOGY_PROPERTY_PROPOSED`.
3. `ActivateOntologyClassUseCase({ classId, workspaceId, tid, resolverHash, resolverRole })`:
   - authorization: only `ADMIN`/`MODERATOR` may activate (use `IMembershipRepository.getRole`,
     from TASK-05); else `DomainError('ERR_AUTHORIZATION_FAILED')`;
   - load the class with `findClassById`; if absent → `DomainError('ERR_VALIDATION_FAILED')`;
   - call `cls.activate()` (domain state machine) and persist via `applyClassDelta`/`activateClass`
     inside a `UnitOfWork`; publish `ONTOLOGY_CLASS_ACTIVATED`.
4. `GetOntologyUseCase({ workspaceId, tid })` → returns `{ classes: findActiveClasses, objectProperties: findActiveObjectProperties }` (add a `listDatatypeProperties` read if needed
   for the form; reuse `findDatatypeProperties(domainClassKey, ...)`).
5. `OntologyController`: add handlers `proposeClass`, `proposeDatatypeProperty`,
   `proposeObjectProperty`, `activateClass`, `getOntology`, all using `getRequestContext` +
   the shared error helpers and the matching Zod schemas.
6. `routes.ts` (guard chain on all):
   - `POST /api/v1/ontology/classes`
   - `POST /api/v1/ontology/datatype-properties`
   - `POST /api/v1/ontology/object-properties`
   - `PUT  /api/v1/ontology/classes/:id/activate`
   - `GET  /api/v1/ontology`
7. `server.ts`: instantiate the use cases and extend `RouteDependencies`.

## 6. Constraints & gotchas
- Do NOT reuse the generic `ProposeOntologyClassUseCase` for properties; each schema maps to one entity.
- Property proposals stay `PROPOSED`; `DatatypeProperty.activate()`/`ObjectProperty.activate()`
  exist but no activation endpoint is required for properties in this batch — do **not** invent one.
- Mapping to domain must handle nullable `workspaceId` on `meta.*` rows
  (`row.workspaceId ?? null`), as the existing adapter does.
- Keep the existing class-proposal behaviour.

## 7. Acceptance criteria
- [ ] `routes.ts` registers the five `/ontology` routes behind the guard chain.
- [ ] `server.ts` wires the ontology repo + all use cases.
- [ ] Proposing a property with an unknown class key → 422; with a known key → 201 `PROPOSED`.
- [ ] Activating a class as a non-moderator → 403; as a moderator → class becomes `ACTIVE`.
- [ ] `GET /api/v1/ontology` returns active classes + object properties.
- [ ] `pnpm turbo run build` passes.

## 8. Verification commands
```bash
pnpm turbo run build
grep -n "'/api/v1/ontology" apps/api/src/infrastructure/http/routes.ts
```

## 9. Definition of done / handoff
- Build passes; ontology proposals, activation and reads work.
- Mark `TASK-13` as `[x]` in `TODO.md` with a one-line result note.

## 10. Out of scope
- Auto-opening a discussion thread per ontology proposal (US-02 AC#3 — tracked separately),
  property rejection endpoints, and ontology caching in Redis.
