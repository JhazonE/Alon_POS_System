'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Pencil, Send, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { METHODS_BADGE, type ExternalApi } from './external-api-types';

interface Props {
  api: ExternalApi;
  testingId: string | null;
  onToggle: (api: ExternalApi) => void;
  onEdit: (api: ExternalApi) => void;
  onDelete: (api: ExternalApi) => void;
  onTest: (api: ExternalApi) => void;
}

export function ApiCard({ api, testingId, onToggle, onEdit, onDelete, onTest }: Props) {
  const methods = METHODS_BADGE[api.allowedMethods];
  return (
    <Card className={!api.enabled ? 'opacity-60' : ''}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="pt-0.5">
            <Switch checked={api.enabled} onCheckedChange={() => onToggle(api)} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-base">{api.name}</span>
              <Badge variant="outline" className={methods.class}>
                {api.allowedMethods === 'send_only'    && <ArrowUp    className="mr-1 h-3 w-3" />}
                {api.allowedMethods === 'receive_only' && <ArrowDown   className="mr-1 h-3 w-3" />}
                {api.allowedMethods === 'full_access'  && <ArrowUpDown className="mr-1 h-3 w-3" />}
                {methods.label}
              </Badge>
              <Badge variant={api.enabled ? 'default' : 'secondary'}>
                {api.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              {api.provider === 'sta_lucia' && (
                <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                  Sta. Lucia
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground font-mono truncate mb-1">{api.apiEndpoint}</p>
            {api.description && <p className="text-sm text-muted-foreground">{api.description}</p>}

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span>Auth: <span className="font-medium capitalize">{api.authType.replace('_', ' ')}</span></span>
              <span>Sync: <span className="font-medium capitalize">{api.syncMode}</span></span>
              <span>On Error: <span className="font-medium">{api.onErrorAction.replace('_', ' ')}</span></span>
              <span>Timeout: <span className="font-medium">{(api.timeout / 1000).toFixed(0)}s</span></span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onTest(api)} disabled={testingId === api.id} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              {testingId === api.id
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Send className="mr-1.5 h-3.5 w-3.5" />}
              Test
            </button>
            <button onClick={() => onEdit(api)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(api)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
