'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { FailureNotice } from './FailureNotice';
import { outlineButton, primaryButton } from './button-styles';
import {
  EMPTY_BRANCH_FORM, OPTIONAL_FIELDS,
  type ActionResult, type Branch, type BranchFormValues, type FailureKind,
} from './branches-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create; a branch = edit (its code is shown but immutable). */
  branch: Branch | null;
  onSubmit: (values: BranchFormValues) => Promise<ActionResult>;
}

function fromBranch(b: Branch | null): BranchFormValues {
  if (!b) return EMPTY_BRANCH_FORM;
  return {
    code: b.code, name: b.name,
    businessName: b.businessName ?? '', address: b.address ?? '', tin: b.tin ?? '',
    contactNumber: b.contactNumber ?? '', permitNo: b.permitNo ?? '', minNumber: b.minNumber ?? '',
    serialNumber: b.serialNumber ?? '', operatedBy: b.operatedBy ?? '',
  };
}

export function BranchFormDialog({ open, onOpenChange, branch, onSubmit }: Props) {
  const [values, setValues] = useState<BranchFormValues>(EMPTY_BRANCH_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [failure, setFailure] = useState<{ kind: FailureKind; message: string } | null>(null);
  const editing = branch !== null;

  useEffect(() => {
    if (open) {
      setValues(fromBranch(branch));
      setFailure(null);
    }
  }, [open, branch]);

  const set = (name: keyof BranchFormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues(v => ({ ...v, [name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim() || (!editing && !values.code.trim())) {
      setFailure({ kind: 'error', message: editing ? 'Name is required.' : 'Code and name are required.' });
      return;
    }
    setIsSaving(true);
    setFailure(null);
    const result = await onSubmit(values);
    setIsSaving(false);
    if (result.ok) onOpenChange(false);
    else setFailure({ kind: result.kind, message: result.message });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Branch ${branch.code}` : 'New Branch'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'The branch code is fixed once created. Changes to BIR identity fields are recorded in the activity log.'
              : 'A new branch starts active with its own invoice numbering from 000001.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="branch-code">Code</Label>
            <Input id="branch-code" value={values.code} onChange={set('code')} disabled={editing} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-name">Name</Label>
            <Input id="branch-name" value={values.name} onChange={set('name')} />
          </div>
          {OPTIONAL_FIELDS.map(({ name, label }) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={`branch-${name}`}>{label}</Label>
              <Input id={`branch-${name}`} value={values[name]} onChange={set(name)} />
            </div>
          ))}

          {failure && <FailureNotice kind={failure.kind} message={failure.message} />}

          <DialogFooter>
            <button type="button" className={outlineButton} onClick={() => onOpenChange(false)}>Close</button>
            <button type="submit" className={primaryButton} disabled={isSaving}>
              {isSaving ? <><Spinner className="h-4 w-4 mr-2" />Saving...</> : 'Save'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
