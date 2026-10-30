// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Element.prototype.scrollIntoView = () => {};
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('portals select options above dialog layers', async () => {
  await act(async () => root.render(
    <Select open value="grocery">
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="grocery">Grocery</SelectItem></SelectContent>
    </Select>,
  ));
  const popup = document.querySelector('[role="listbox"]');
  expect(popup).not.toBeNull();
  expect(popup?.parentElement?.className || popup?.className).toContain('z-[100]');
  expect(document.body.textContent).toContain('Grocery');
});
