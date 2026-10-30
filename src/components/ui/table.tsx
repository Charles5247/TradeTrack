'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, children, ...props }, forwardedRef) => {
    const localRef = React.useRef<HTMLTableElement | null>(null);
    React.useLayoutEffect(() => {
      const table = localRef.current;
      if (!table) return;
      const labels = Array.from(table.querySelectorAll('thead th')).map(cell => cell.textContent?.trim() || '');
      for (const row of table.querySelectorAll('tbody tr')) {
        Array.from(row.querySelectorAll(':scope > td')).forEach((cell, index) => {
          if (labels[index] && !cell.hasAttribute('colspan')) cell.setAttribute('data-label', labels[index]);
        });
      }
    }, [children]);
    const setRef = (node: HTMLTableElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };
    return (
      <div className="tt-responsive-table relative min-w-0 w-full max-w-full overflow-x-hidden sm:overflow-x-auto sm:overscroll-x-contain">
        <table ref={setRef} className={cn('w-full caption-bottom text-[length:var(--base-font)] tabular-nums', className)} {...props}>{children}</table>
      </div>
    );
  }
);
Table.displayName = 'Table';

// Re-skinned per README §6.1 to match .tt-table: uppercase, letter-spaced,
// small, muted header text on a surfaceAlt (muted) background.
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b [&_tr]:border-border bg-muted', className)} {...props} />
  )
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn('border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
);
TableFooter.displayName = 'TableFooter';

// Row height driven by --row-h (respects density profile / POS / Dense
// overrides automatically) instead of a fixed shadcn padding value.
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'h-[var(--row-h)] border-b border-border transition-colors hover:bg-muted data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-3.5 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  )
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        'px-3.5 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  )
);
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption
      ref={ref}
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  )
);
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
