'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Globe, PlusCircle } from 'lucide-react';
import { ApiCard } from './ApiCard';
import type { ExternalApi } from './external-api-types';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  apis: ExternalApi[];
  isLoading: boolean;
  testingId: string | null;
  onAddApi: () => void;
  onToggle: (api: ExternalApi) => void;
  onEdit: (api: ExternalApi) => void;
  onDelete: (api: ExternalApi) => void;
  onTest: (api: ExternalApi) => void;
}

export function ApiConnectionsTab({ apis, isLoading, testingId, onAddApi, onToggle, onEdit, onDelete, onTest }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    );
  }

  if (apis.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Globe className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No APIs configured</h3>
          <p className="text-sm text-muted-foreground mb-4">Add your first external API to start sending or receiving data.</p>
          <button onClick={onAddApi} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]"><PlusCircle className="mr-2 h-4 w-4" />Add API</button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {apis.map(api => (
        <ApiCard key={api.id} api={api} testingId={testingId} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onTest={onTest} />
      ))}
    </div>
  );
}
