'use client';

import { useState } from 'react';

export type ListSort = 'az' | 'za' | 'newest' | 'oldest';
export type ProductGroup = 'none' | 'category' | 'supplier';

export function useListPreference<T extends string>(key: string, fallback: T) {
  const [value, setValueState] = useState<T>(() => {
    if (typeof window === 'undefined') return fallback;
    return (window.localStorage.getItem(key) as T | null) ?? fallback;
  });
  const setValue = (next: T) => {
    setValueState(next);
    window.localStorage.setItem(key, next);
  };
  return [value, setValue] as const;
}

export function compareListRows(left: { name?: string | null; created_at?: string | null }, right: { name?: string | null; created_at?: string | null }, sort: ListSort) {
  if (sort === 'newest' || sort === 'oldest') {
    const delta = Date.parse(left.created_at || '') - Date.parse(right.created_at || '');
    return sort === 'newest' ? -delta : delta;
  }
  const delta = (left.name || '').localeCompare(right.name || '', undefined, { sensitivity: 'base', numeric: true });
  return sort === 'za' ? -delta : delta;
}
