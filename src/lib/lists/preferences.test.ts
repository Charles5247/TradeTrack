import { describe, expect, it } from 'vitest';
import { compareListRows } from './preferences';

const rows = [{ name: 'Zinc', created_at: '2026-01-01T00:00:00Z' }, { name: 'Apple', created_at: '2026-02-01T00:00:00Z' }];

describe('list ordering', () => {
  it('sorts names in both directions', () => {
    expect([...rows].sort((a, b) => compareListRows(a, b, 'az')).map(row => row.name)).toEqual(['Apple', 'Zinc']);
    expect([...rows].sort((a, b) => compareListRows(a, b, 'za')).map(row => row.name)).toEqual(['Zinc', 'Apple']);
  });
  it('sorts creation dates in both directions', () => {
    expect([...rows].sort((a, b) => compareListRows(a, b, 'newest'))[0].name).toBe('Apple');
    expect([...rows].sort((a, b) => compareListRows(a, b, 'oldest'))[0].name).toBe('Zinc');
  });
});
