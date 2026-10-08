'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertCircle, PlusCircle } from 'lucide-react';
import { useExternalApi } from './use-external-api';
import { ApiConnectionsTab } from './ApiConnectionsTab';
import { SyncLogsTab } from './SyncLogsTab';
import { ApiFormDialog } from './ApiFormDialog';
import { Spinner } from '@/components/ui/spinner';

export default function ExternalApiSettingsPage() {
  const m = useExternalApi();

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">External API Integrations</h2>
        <button onClick={m.openAddDialog} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]"><PlusCircle className="mr-2 h-4 w-4" />Add API</button>
      </div>

      {m.pendingCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  {m.pendingCount} item{m.pendingCount !== 1 && 's'} waiting to sync
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400">The system will automatically attempt to sync these in the background.</p>
              </div>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 border-amber-300 hover:bg-amber-100 dark:border-amber-800" onClick={() => m.fetchLogs()}>
                Refresh Status
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="apis" className="space-y-4">
        <TabsList>
          <TabsTrigger value="apis">API Connections</TabsTrigger>
          <TabsTrigger value="logs">Sync Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="apis" className="space-y-4">
          <ApiConnectionsTab
            apis={m.apis} isLoading={m.isLoadingApis} testingId={m.testingId}
            onAddApi={m.openAddDialog} onToggle={m.handleToggleEnabled}
            onEdit={m.openEditDialog} onDelete={m.setDeleteTarget} onTest={m.handleTestConnection}
          />
        </TabsContent>

        <TabsContent value="logs">
          <SyncLogsTab
            logs={m.logs} isLoading={m.isLoadingLogs}
            logStatusFilter={m.logStatusFilter} onStatusFilterChange={m.handleStatusFilterChange}
            onRefresh={() => m.fetchLogs()} retryingLogId={m.retryingLogId} onRetry={m.handleRetryLog}
            onClearLogs={m.clearLogs} isClearingLogs={m.isClearingLogs}
          />
        </TabsContent>
      </Tabs>

      <ApiFormDialog
        open={m.dialogOpen} onOpenChange={m.setDialogOpen}
        editingApi={m.editingApi} form={m.form} setForm={m.setForm}
        isSaving={m.isSaving} onSave={m.handleSave}
      />

      <AlertDialog open={!!m.deleteTarget} onOpenChange={open => !open && m.setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{m.deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this API configuration. Any sync operations using it will stop.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={m.handleDelete} disabled={m.isDeleting}>
              {m.isDeleting && <Spinner className="mr-2 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
