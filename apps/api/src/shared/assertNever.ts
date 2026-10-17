/**
 * Exhaustiveness guard for `switch`/`if` chains over a closed union.
 *
 * Passing a value the compiler has narrowed to `never` proves every member is
 * handled: adding a member without a case turns the call site into a type
 * error. It throws a plain `Error` (not a `DomainError`) because reaching it is
 * a programmer error, not a domain condition — hence `shared/`, not `domain/`.
 */
export function assertNever(value: never, context = 'unexpected value'): never {
  throw new Error(`${context}: ${JSON.stringify(value)}`);
}
