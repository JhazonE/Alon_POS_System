'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Monitor, Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AddPosTerminalDialog } from './add-pos-terminal/AddPosTerminalDialog';
import { EditPosTerminalDialog } from './edit-pos-terminal/EditPosTerminalDialog';
import { TerminalCard } from './TerminalCard';
import { usePosTerminals } from './use-pos-terminals';

export default function PosTerminalsPage() {
  const {
    terminals, isLoading, warehouses,
    selectedTerminal, currentTerminalId,
    terminalToDelete, setTerminalToDelete,
    isEditDialogOpen, setIsEditDialogOpen,
    isOnline, handleEdit, handleConnect, handleReset, handleDelete,
    fetchTerminals,
  } = usePosTerminals();

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">POS Terminals</h2>
          <p className="text-muted-foreground">Manage your POS terminal devices and configurations</p>
          {currentTerminalId && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full w-fit">
              <Monitor className="h-4 w-4" />
              Currently Connected:{' '}
              <span className="font-bold">
                {terminals.find(t => t.id === currentTerminalId)?.terminalDescription || 'Linked'}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {currentTerminalId && (
            <button
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
            >
              Reset Connection
            </button>
          )}
          <AddPosTerminalDialog onTerminalAdded={fetchTerminals} />
        </div>
      </div>

      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : terminals.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Monitor className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No terminals found</h3>
              <p className="text-muted-foreground mb-4">Get started by adding your first POS terminal.</p>
              <AddPosTerminalDialog onTerminalAdded={fetchTerminals} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {terminals.map(terminal => (
                <TerminalCard
                  key={terminal.id}
                  terminal={terminal}
                  currentTerminalId={currentTerminalId}
                  warehouses={warehouses}
                  isOnline={isOnline}
                  onEdit={handleEdit}
                  onConnect={handleConnect}
                  onDeleteRequest={t => setTerminalToDelete({ id: t.id, description: t.terminalDescription || t.ipAddress || 'this terminal' })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTerminal && (
        <EditPosTerminalDialog
          terminal={selectedTerminal}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onTerminalUpdated={fetchTerminals}
        />
      )}

      <AlertDialog open={!!terminalToDelete} onOpenChange={open => !open && setTerminalToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the terminal &quot;{terminalToDelete?.description}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={e => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.stopPropagation(); handleDelete(); }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
