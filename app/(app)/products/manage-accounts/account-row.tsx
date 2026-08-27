'use client';

import { Pencil, Trash2 } from 'lucide-react';

import { TableCell, TableRow } from '@/components/ui/table';
import type { Account } from '@/lib/types';

import { AccountDialog } from './account-dialog';
import type { AccountType } from './use-account-form';

export function AccountRow({
  account,
  onUpdate,
  onDelete,
}: {
  account: Account;
  onUpdate: (id: string, name: string, type: AccountType, code?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{account.name}</TableCell>
      <TableCell>{account.type === 'income' ? 'Income' : 'Expense'}</TableCell>
      <TableCell>{account.code || '-'}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <AccountDialog
            account={account}
            onSave={(name, type, code) => onUpdate(account.id, name, type, code)}
          >
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </button>
          </AccountDialog>
          <button onClick={() => onDelete(account.id)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}
