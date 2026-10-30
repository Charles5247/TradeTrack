// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ResponsiveTableScope } from './responsive-table-scope';

describe('ResponsiveTableScope', () => {
  it('upgrades raw tables with card labels without changing their content', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(
      <ResponsiveTableScope>
        <div data-testid="wrapper">
          <table>
            <thead><tr><th>Product</th><th>Stock</th></tr></thead>
            <tbody><tr><td>Rice</td><td>12</td></tr></tbody>
          </table>
        </div>
      </ResponsiveTableScope>,
    ));

    expect(host.querySelector('[data-testid="wrapper"]')?.classList.contains('tt-responsive-table')).toBe(true);
    expect(Array.from(host.querySelectorAll('td')).map(cell => cell.getAttribute('data-label'))).toEqual(['Product', 'Stock']);
    act(() => root.unmount());
    host.remove();
  });
});
