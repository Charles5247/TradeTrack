'use client';
import { useCopy } from '@/i18n/text';


import { ErrorState } from '@/components/ui/error-state';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const copy = useCopy();
  return <ErrorState title={copy("This page could not be loaded")} body={copy("Check your connection and try loading this page again.")} onRetry={reset} />;
}
