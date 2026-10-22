'use client';

import { useState } from 'react';
import { ArrowRightLeft, GitBranch, Pencil, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BranchFormDialog } from './BranchFormDialog';
import { ReassignDialog } from './ReassignDialog';
import { FailureNotice } from './FailureNotice';
import { useBranches } from './use-branches';
import {
  outlineButton, primaryButton, smallDestructiveButton, smallOutlineButton,
} from './button-styles';
import { isActiveFlag, type Branch } from './branches-types';

export default function BranchesPage() {
  const {
    branches, members, isLoading, notice, setNotice,
    createBranch, updateBranch, setActive, reassign,
  } = useBranches();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<string | null>(null);
  const [toDeactivate, setToDeactivate] = useState<Branch | null>(null);

  const countFor = (key: 'warehouses' | 'users' | 'terminals', branchId: string) =>
    members ? members[key].filter(m => m.branchId === branchId && m.isActive).length : null;

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (b: Branch) => { setEditing(b); setFormOpen(true); };
  const openReassign = (targetId: string | null) => { setReassignTarget(targetId); setReassignOpen(true); };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Branches</h2>
          <p className="text-muted-foreground">
            Create branches, keep their BIR details current, and move warehouses, users and terminals between them.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={outlineButton} onClick={() => openReassign(null)} disabled={!members}>
            <ArrowRightLeft className="h-4 w-4" />
            Move to another branch
          </button>
          <button className={primaryButton} onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Branch
          </button>
        </div>
      </div>

      {notice && (
        <div data-testid="page-notice">
          <FailureNotice kind={notice.kind} message={notice.message} />
        </div>
      )}

      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="p-0">
          {isLoading && branches.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="h-8 w-8 text-primary" />
            </div>
          ) : branches.length === 0 ? (
            <div className="text-center py-12 border rounded-lg border-dashed">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <GitBranch className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No branches found</h3>
              <p className="text-muted-foreground">Get started by creating your first branch.</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Warehouses</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">Terminals</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map(b => {
                    const active = isActiveFlag(b.isActive);
                    const main = Number(b.isMain) === 1;
                    return (
                      <TableRow key={b.id} data-testid={`branch-row-${b.code}`}>
                        <TableCell className="font-mono font-semibold">{b.code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{b.name}</div>
                          {b.address && <div className="text-xs text-muted-foreground">{b.address}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <Badge variant={active ? 'secondary' : 'outline'}>{active ? 'Active' : 'Inactive'}</Badge>
                            {main && <Badge variant="secondary" className="bg-primary/10 text-primary border-none">Main</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" data-testid="count-warehouses">{countFor('warehouses', b.id) ?? '-'}</TableCell>
                        <TableCell className="text-right" data-testid="count-users">{countFor('users', b.id) ?? '-'}</TableCell>
                        <TableCell className="text-right" data-testid="count-terminals">{countFor('terminals', b.id) ?? '-'}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <button className={smallOutlineButton} onClick={() => openEdit(b)} aria-label={`Edit ${b.code}`}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                            {active && (
                              <button
                                className={smallOutlineButton}
                                onClick={() => openReassign(b.id)}
                                disabled={!members}
                                aria-label={`Move something into ${b.code}`}
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" /> Move here
                              </button>
                            )}
                            {active ? (
                              <button
                                className={smallDestructiveButton}
                                onClick={() => setToDeactivate(b)}
                                aria-label={`Deactivate ${b.code}`}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                className={smallOutlineButton}
                                onClick={() => { setNotice(null); void setActive(b, true); }}
                                aria-label={`Activate ${b.code}`}
                              >
                                Activate
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Counts show active warehouses, users and terminals, the same ones that block a deactivation.
          </p>
        </CardContent>
      </Card>

      <BranchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        branch={editing}
        onSubmit={values => (editing ? updateBranch(editing.id, values) : createBranch(values))}
      />

      <ReassignDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        branches={branches}
        members={members}
        presetTargetId={reassignTarget}
        onSubmit={reassign}
      />

      <AlertDialog open={!!toDeactivate} onOpenChange={open => !open && setToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate branch {toDeactivate?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              A branch can only be deactivated once its active warehouses, users and terminals have
              been moved elsewhere. If any remain, the system will refuse and tell you how many.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                const b = toDeactivate;
                setToDeactivate(null);
                if (b) void setActive(b, false);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
