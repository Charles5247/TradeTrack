// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

it('labels mobile card fields from the rendered table headers', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Stock</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Rice</TableCell><TableCell>12</TableCell><TableCell><button>Open</button></TableCell></TableRow></TableBody></Table>));
  expect(Array.from(host.querySelectorAll('td')).map(cell => cell.getAttribute('data-label'))).toEqual(['Product', 'Stock', 'Actions']);
  expect(host.querySelector('.tt-responsive-table')).not.toBeNull();
  await act(async () => root.unmount()); host.remove();
});
