'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState title="This page could not be loaded" body="Check your connection and try loading this page again." onRetry={reset} />;
}
