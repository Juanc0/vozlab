import { describe, expect, it } from 'vitest';

import { collapseWorkspacesByStrongestRole } from '../../src/infrastructure/persistence/repositories/DrizzleUserRepository.js';

describe('collapseWorkspacesByStrongestRole', () => {
  it('returns one entry per workspace with the strongest role', () => {
    const rows = [
      { id: 'ws-1', slug: 'a', name: 'A', role: 'MEMBER' as const },
      { id: 'ws-1', slug: 'a', name: 'A', role: 'ADMIN' as const },
      { id: 'ws-2', slug: 'b', name: 'B', role: 'MODERATOR' as const },
      { id: 'ws-1', slug: 'a', name: 'A', role: 'GUEST' as const },
    ];
    const result = collapseWorkspacesByStrongestRole(rows);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === 'ws-1')?.role).toBe('ADMIN');
    expect(result.find((r) => r.id === 'ws-2')?.role).toBe('MODERATOR');
  });

  it('keeps a single row unchanged', () => {
    const rows = [{ id: 'ws-1', slug: 'a', name: 'A', role: 'MEMBER' as const }];
    expect(collapseWorkspacesByStrongestRole(rows)).toEqual(rows);
  });

  it('handles an empty list', () => {
    expect(collapseWorkspacesByStrongestRole([])).toEqual([]);
  });
});
