'use client';

import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { type FailureKind } from './branches-types';

const TITLES: Record<FailureKind, string> = {
  forbidden: 'Not permitted',
  refused: 'Refused - resolve this first',
  error: 'Something went wrong',
};

/**
 * 403 and 409 are different problems with different fixes, so they get
 * different headings. The message is the server's own: a 409 names the counts
 * (e.g. "2 warehouses, 1 user"), which is how the admin learns what to move.
 */
export function FailureNotice({ kind, message }: { kind: FailureKind; message: string }) {
  const Icon = kind === 'forbidden' ? ShieldAlert : AlertTriangle;
  return (
    <Alert variant="destructive" data-testid={`failure-${kind}`}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{TITLES[kind]}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
