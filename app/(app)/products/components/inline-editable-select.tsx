'use client';

import { useState } from 'react';
import { PlusCircle, Pencil, Check, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { FormControl } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

export interface InlineEditableSelectProps<T> {
  items: T[];
  isLoading: boolean;
  // Admits undefined: this is bound to optional react-hook-form fields
  // (Department, Warehouse), whose value is undefined until something is
  // picked. Radix reads undefined as "no selection" and shows the placeholder
  // — which is why it is passed through rather than coerced to ''.
  value: string | undefined;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder: string;
  addLabel: string;
  emptyLabel: string;
  loadingLabel?: string;
  orphanLabel?: (value: string) => string;
  getId: (item: T) => string;
  getValue: (item: T) => string;
  getOptionLabel: (item: T) => string;
  getName: (item: T) => string;
  onAdd: (name: string) => Promise<string | undefined>;
  onRename: (id: string, name: string) => Promise<string | undefined>;
  triggerClassName?: string;
  itemClassName?: string;
}

export function InlineEditableSelect<T>({
  items,
  isLoading,
  value,
  onChange,
  open,
  onOpenChange,
  placeholder,
  addLabel,
  emptyLabel,
  loadingLabel = 'Loading...',
  orphanLabel,
  getId,
  getValue,
  getOptionLabel,
  getName,
  onAdd,
  onRename,
  triggerClassName,
  itemClassName,
}: InlineEditableSelectProps<T>) {
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameOldValue, setRenameOldValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const resetAdd = () => {
    setAdding(false);
    setAddDraft('');
  };
  const resetRename = () => {
    setRenamingId(null);
    setRenameDraft('');
    setRenameOldValue('');
  };

  const commitAdd = async () => {
    const name = addDraft.trim();
    if (!name || isSaving) return;
    setIsSaving(true);
    try {
      const newValue = await onAdd(name);
      if (newValue !== undefined) onChange(newValue);
      resetAdd();
    } finally {
      setIsSaving(false);
    }
  };

  const startRename = (item: T) => {
    setRenamingId(getId(item));
    setRenameDraft(getName(item));
    setRenameOldValue(getValue(item));
    setAdding(false);
  };

  const commitRename = async () => {
    const name = renameDraft.trim();
    if (!name || renamingId === null || isSaving) return;
    setIsSaving(true);
    try {
      const newValue = await onRename(renamingId, name);
      if (newValue !== undefined && renameOldValue === value) onChange(newValue);
      resetRename();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Select
      open={open}
      onOpenChange={onOpenChange}
      // Radix's hidden native <select> re-dispatches a change event when the
      // controlled value changes before the matching <option> has mounted
      // (e.g. right after an inline add); its value reads as '' and would
      // clobber the just-committed selection. Real selections are never ''.
      onValueChange={(v) => { if (v) onChange(v); }}
      value={value}
    >
      <FormControl>
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {isLoading ? (
          <SelectItem value="loading" disabled className={itemClassName}>{loadingLabel}</SelectItem>
        ) : items.length > 0 ? (
          items.map((item) => {
            const id = getId(item);
            if (renamingId === id) {
              return (
                <div
                  key={id}
                  className="flex items-center gap-1 px-2 py-1"
                  onPointerDown={stop}
                >
                  <Input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        resetRename();
                      }
                    }}
                    className="h-8"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 shrink-0 text-green-600"
                    disabled={isSaving || !renameDraft.trim()}
                    onClick={(e) => { e.preventDefault(); commitRename(); }}
                  >
                    {isSaving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={(e) => { e.preventDefault(); resetRename(); }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            }
            return (
              <div key={id} className="relative">
                <SelectItem value={getValue(item)} className={cn('pr-9', itemClassName)}>
                  {getOptionLabel(item)}
                </SelectItem>
                <button
                  type="button"
                  aria-label={`Rename ${getName(item)}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); startRename(item); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        ) : (
          <SelectItem value="none" disabled className={itemClassName}>{emptyLabel}</SelectItem>
        )}

        {!isLoading && orphanLabel && value && !items.some((item) => getValue(item) === value) && (
          <SelectItem value={value} className={itemClassName}>{orphanLabel(value)}</SelectItem>
        )}

        <div className="border-t mt-1 pt-1 px-1">
          {adding ? (
            <div className="flex items-center gap-1 px-1 py-1" onPointerDown={stop}>
              <Input
                autoFocus
                value={addDraft}
                placeholder="New name..."
                onChange={(e) => setAddDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitAdd();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    resetAdd();
                  }
                }}
                className="h-8"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 shrink-0 text-green-600"
                disabled={isSaving || !addDraft.trim()}
                onClick={(e) => { e.preventDefault(); commitAdd(); }}
              >
                {isSaving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 shrink-0 text-muted-foreground"
                onClick={(e) => { e.preventDefault(); resetAdd(); }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring w-full justify-start h-8 px-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetRename();
                setAdding(true);
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              {addLabel}
            </button>
          )}
        </div>
      </SelectContent>
    </Select>
  );
}
