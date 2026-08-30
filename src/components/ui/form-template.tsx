"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";

/**
 * New components per README §6.2 / §9.4 — `<FormTemplate>` + `<Field>`:
 * Add/Edit page shell (sections + sidebar + save bar) and its field
 * cluster (label + input + hint/error). See
 * design_files/templates.jsx → `FormTemplate`, `Field`. Use for Product
 * Add/Edit, User Invite, Warehouse Create, Vendor Add (README §7/§9.4 —
 * "do not hand-roll form layouts").
 */
export interface FormSection {
  title: string;
  description?: string;
  fields: React.ReactNode;
}

export interface FormTemplateProps {
  sections: FormSection[];
  sidebar?: React.ReactNode;
  onCancel?: () => void;
  onSave?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  isNew?: boolean;
  isSaving?: boolean;
  className?: string;
}

export function FormTemplate({
  sections,
  sidebar,
  onCancel,
  onSave,
  saveLabel = "Save changes",
  cancelLabel = "Cancel",
  isNew = false,
  isSaving = false,
  className,
}: FormTemplateProps) {
  return (
    <div className={cn("grid gap-8", sidebar ? "lg:grid-cols-[2fr_1fr]" : "grid-cols-1", className)}>
      <div className="flex flex-col gap-5">
        {sections.map((sec, i) => (
          <Card key={i} className="p-[var(--card-pad)]">
            <div className="mb-5">
              <div className="tt-section-title text-lg">{sec.title}</div>
              {sec.description && (
                <div className="mt-1 text-[13px] text-muted-foreground">{sec.description}</div>
              )}
            </div>
            {sec.fields}
          </Card>
        ))}
        <div className="sticky bottom-0 flex justify-end gap-2.5 border-t border-border bg-background/80 py-4 backdrop-blur-sm">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
              {cancelLabel}
            </Button>
          )}
          {onSave && (
            <Button onClick={onSave} disabled={isSaving}>
              {isSaving ? "Saving…" : isNew ? "Create" : saveLabel}
            </Button>
          )}
        </div>
      </div>
      {sidebar && <div className="flex flex-col gap-4">{sidebar}</div>}
    </div>
  );
}

export interface FieldProps {
  label?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  half?: boolean;
  className?: string;
}

export function Field({ label, hint, error, children, half, className }: FieldProps) {
  return (
    <div className={cn("mb-4", half && "inline-block w-[calc(50%-8px)] align-top even:ml-2", className)}>
      {label && <Label className="mb-1.5 block">{label}</Label>}
      {children}
      {hint && !error && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
      {error && <div className="mt-1.5 text-[11px] text-destructive">{error}</div>}
    </div>
  );
}
