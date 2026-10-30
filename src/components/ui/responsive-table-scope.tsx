'use client';

import * as React from 'react';

function prepareTables(root: HTMLElement) {
  for (const table of root.querySelectorAll('table')) {
    const container = table.parentElement;
    if (container) container.classList.add('tt-responsive-table');

    const labels = Array.from(table.querySelectorAll('thead th')).map(
      cell => cell.textContent?.trim() || '',
    );
    for (const row of table.querySelectorAll('tbody tr')) {
      Array.from(row.querySelectorAll(':scope > td')).forEach((cell, index) => {
        if (labels[index] && !cell.hasAttribute('colspan')) {
          cell.setAttribute('data-label', labels[index]);
        }
      });
    }
  }
}

/** Makes legacy/raw dashboard tables use the same phone card layout as Table. */
export function ResponsiveTableScope({ children }: { children: React.ReactNode }) {
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    prepareTables(root);
    const observer = new MutationObserver(() => prepareTables(root));
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <div ref={rootRef} className="contents">{children}</div>;
}
