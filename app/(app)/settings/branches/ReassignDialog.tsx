'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { FailureNotice } from './FailureNotice';
import { outlineButton, primaryButton } from './button-styles';
import {
  isActiveFlag,
  type ActionResult, type Branch, type BranchMembers, type FailureKind, type ReassignKind,
} from './branches-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  members: BranchMembers | null;
  /** Branch to pre-select as the destination, when opened from a branch row. */
  presetTargetId: string | null;
  onSubmit: (kind: ReassignKind, id: string, branchId: string) => Promise<ActionResult>;
}

const KIND_LABEL: Record<ReassignKind, string> = {
  warehouse: 'Warehouse',
  user: 'User',
  terminal: 'POS Terminal',
};

type Item = { id: string; label: string; branchId: string | null };

export function ReassignDialog({ open, onOpenChange, branches, members, presetTargetId, onSubmit }: Props) {
  const [kind, setKind] = useState<ReassignKind>('warehouse');
  const [itemId, setItemId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<{ kind: FailureKind; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setKind('warehouse');
      setItemId('');
      setTargetId(presetTargetId ?? '');
      setFailure(null);
    }
  }, [open, presetTargetId]);

  const codeOf = (branchId: string | null) =>
    branches.find(b => b.id === branchId)?.code ?? 'no branch';

  const items: Item[] = useMemo(() => {
    if (!members) return [];
    if (kind === 'warehouse') return members.warehouses.map(w => ({ id: w.id, label: w.name, branchId: w.branchId }));
    if (kind === 'user') return members.users.map(u => ({ id: u.uid, label: u.displayName || u.username, branchId: u.branchId }));
    return members.terminals.map(t => ({ id: t.id, label: t.name || t.id, branchId: t.branchId }));
  }, [members, kind]);

  const selected = items.find(i => i.id === itemId) ?? null;
  // Only active branches are valid destinations (the server refuses an
  // inactive one), and the branch the item is already in is no move at all.
  const targets = branches.filter(b => isActiveFlag(b.isActive) && b.id !== selected?.branchId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId || !targetId) {
      setFailure({ kind: 'error', message: `Choose a ${KIND_LABEL[kind].toLowerCase()} and a destination branch.` });
      return;
    }
    setIsSaving(true);
    setFailure(null);
    const result = await onSubmit(kind, itemId, targetId);
    setIsSaving(false);
    if (result.ok) onOpenChange(false);
    else setFailure({ kind: result.kind, message: result.message });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Move to another branch</DialogTitle>
          <DialogDescription>
            Reassign a warehouse, user or POS terminal. The move is recorded in the activity log.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>What to move</Label>
            <Select
              value={kind}
              onValueChange={v => { setKind(v as ReassignKind); setItemId(''); setFailure(null); }}
            >
              <SelectTrigger aria-label="What to move"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as ReassignKind[]).map(k => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{KIND_LABEL[kind]}</Label>
            <Select value={itemId} onValueChange={v => { setItemId(v); setFailure(null); }}>
              <SelectTrigger aria-label={`Choose ${KIND_LABEL[kind]}`}>
                <SelectValue placeholder={`Select a ${KIND_LABEL[kind].toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {items.map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.label} ({codeOf(i.branchId)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Destination branch</Label>
            <Select value={targetId} onValueChange={v => { setTargetId(v); setFailure(null); }}>
              <SelectTrigger aria-label="Destination branch"><SelectValue placeholder="Select a branch" /></SelectTrigger>
              <SelectContent>
                {targets.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.code} - {b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind === 'warehouse' && (
            <p className="rounded-lg border bg-muted/50 p-3 text-sm" data-testid="warehouse-move-note">
              <strong>The warehouse&apos;s stock and history move with it.</strong>{' '}
              Past sales keep the branch that issued them: invoices already filed stay with the
              BIR establishment that rang them and are not moved.
            </p>
          )}
          {kind === 'terminal' && (
            <p className="rounded-lg border bg-muted/50 p-3 text-sm">
              Sales rung on this terminal from now on belong to the new branch. Past sales keep
              the branch that issued them.
            </p>
          )}

          {failure && <FailureNotice kind={failure.kind} message={failure.message} />}

          <DialogFooter>
            <button type="button" className={outlineButton} onClick={() => onOpenChange(false)}>Close</button>
            <button type="submit" className={primaryButton} disabled={isSaving}>
              {isSaving ? <><Spinner className="h-4 w-4 mr-2" />Moving...</> : 'Move'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
