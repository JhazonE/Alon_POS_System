'use client';

import { useState } from 'react';
import { Check, ChevronDown, Loader2, Pencil, PlusCircle, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Category } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { FormControl } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface PickerSectionProps {
  title: string;
  items: Category[];
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
  addLabel: string;
  emptyLabel: string;
  orphanLabel?: (value: string) => string;
  /** When set, renders a "None" row that clears the selection. */
  clearLabel?: string;
  onAdd: (name: string) => Promise<string | undefined>;
  onRename: (id: string, name: string) => Promise<string | undefined>;
}

function PickerSection({
  title,
  items,
  isLoading,
  value,
  onChange,
  addLabel,
  emptyLabel,
  orphanLabel,
  clearLabel,
  onAdd,
  onRename,
}: PickerSectionProps) {
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameOldValue, setRenameOldValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  const startRename = (item: Category) => {
    setRenamingId(item.id);
    setRenameDraft(item.name);
    setRenameOldValue(item.name);
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

  const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:pointer-events-none disabled:opacity-45';
  const rowClass = (selected: boolean) =>
    cn(
      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
      selected && 'bg-accent font-medium',
    );

  const renderEditor = (
    draft: string,
    setDraft: (v: string) => void,
    commit: () => void,
    cancel: () => void,
    placeholder?: string,
  ) => (
    <div className="flex items-center gap-1 py-1">
      <Input
        autoFocus
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className="h-8"
      />
      <button
        type="button"
        className={cn(iconButton, 'text-green-600')}
        disabled={isSaving || !draft.trim()}
        onClick={commit}
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button type="button" className={cn(iconButton, 'text-muted-foreground')} onClick={cancel}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col">
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="max-h-56 overflow-y-auto">
        {clearLabel && (
          <button type="button" className={cn(rowClass(!value), 'text-muted-foreground')} onClick={() => onChange('')}>
            <span className="flex-1 truncate">{clearLabel}</span>
            {!value && <Check className="h-4 w-4" />}
          </button>
        )}
        {isLoading ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading...</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          items.map((item) =>
            renamingId === item.id ? (
              <div key={item.id}>{renderEditor(renameDraft, setRenameDraft, commitRename, resetRename)}</div>
            ) : (
              <div key={item.id} className="group relative">
                <button
                  type="button"
                  className={cn(rowClass(item.name === value), 'pr-9')}
                  onClick={() => onChange(item.name)}
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.name === value && <Check className="h-4 w-4 shrink-0" />}
                </button>
                <button
                  type="button"
                  aria-label={`Rename ${item.name}`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    resetAdd();
                    startRename(item);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )
        )}
        {!isLoading && orphanLabel && value && !items.some((item) => item.name === value) && (
          <button type="button" className={rowClass(true)} onClick={() => onChange(value)}>
            <span className="flex-1 truncate">{orphanLabel(value)}</span>
            <Check className="h-4 w-4 shrink-0" />
          </button>
        )}
      </div>
      <div className="mt-1 border-t pt-1">
        {adding ? (
          renderEditor(addDraft, setAddDraft, commitAdd, resetAdd, 'New name...')
        ) : (
          <button
            type="button"
            className="inline-flex h-8 w-full items-center justify-start gap-2 rounded-md px-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            onClick={() => {
              resetRename();
              setAdding(true);
            }}
          >
            <PlusCircle className="h-4 w-4" />
            {addLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export interface CategorySubcategoryPickerProps {
  categories: Category[];
  subcategories: Category[];
  isLoadingCategories?: boolean;
  isLoadingSubcategories?: boolean;
  category: string;
  subcategory: string;
  onCategoryChange: (value: string) => void;
  onSubcategoryChange: (value: string) => void;
  onAddCategory: (name: string) => Promise<string | undefined>;
  onRenameCategory: (id: string, name: string) => Promise<string | undefined>;
  onAddSubcategory: (name: string) => Promise<string | undefined>;
  onRenameSubcategory: (id: string, name: string) => Promise<string | undefined>;
  orphanLabel?: (value: string) => string;
}

/**
 * One field for picking a category and an (optional) subcategory. Categories
 * and subcategories are independent lists, so both are shown side by side in a
 * single popover, each with its own inline add/rename.
 */
export function CategorySubcategoryPicker({
  categories,
  subcategories,
  isLoadingCategories = false,
  isLoadingSubcategories = false,
  category,
  subcategory,
  onCategoryChange,
  onSubcategoryChange,
  onAddCategory,
  onRenameCategory,
  onAddSubcategory,
  onRenameSubcategory,
  orphanLabel,
}: CategorySubcategoryPickerProps) {
  const [open, setOpen] = useState(false);

  const label = [category, subcategory].filter(Boolean).join(' › ');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <button
            type="button"
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              !label && 'text-muted-foreground',
            )}
          >
            <span className="line-clamp-1 text-left">{label || 'Select a category'}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(36rem,calc(100vw-2rem))] p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:divide-x">
          <PickerSection
            title="Category"
            items={categories}
            isLoading={isLoadingCategories}
            value={category}
            onChange={onCategoryChange}
            addLabel="Add Category"
            emptyLabel="No categories found"
            orphanLabel={orphanLabel}
            onAdd={onAddCategory}
            onRename={onRenameCategory}
          />
          <div className="sm:pl-3">
            <PickerSection
              title="Subcategory (Optional)"
              items={subcategories}
              isLoading={isLoadingSubcategories}
              value={subcategory}
              onChange={onSubcategoryChange}
              addLabel="Add Subcategory"
              emptyLabel="No subcategories found"
              clearLabel="None"
              orphanLabel={orphanLabel}
              onAdd={onAddSubcategory}
              onRename={onRenameSubcategory}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end border-t pt-2">
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
