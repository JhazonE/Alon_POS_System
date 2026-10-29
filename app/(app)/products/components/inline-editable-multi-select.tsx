'use client';

import { useRef, useState, type ReactNode } from 'react';
import { PlusCircle, Pencil, Check, X, ChevronsUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormControl } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

export interface InlineEditableMultiSelectProps<T> {
  items: T[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  addLabel: string;
  emptyLabel: string;
  searchPlaceholder: string;
  getId: (item: T) => string;
  getName: (item: T) => string;
  /**
   * How an item is DISPLAYED (badge and option row). Defaults to `getName`.
   * `getName` stays the bare, editable name: it seeds the rename draft, so a
   * display-only suffix (e.g. a branch name) must not go through it.
   */
  getOptionLabel?: (item: T) => string;
  /** Returns the id of the newly created item, or undefined on failure. */
  onAdd: (name: string) => Promise<string | undefined>;
  /** Returns the renamed id on success, or undefined on failure. */
  onRename: (id: string, name: string) => Promise<string | undefined>;
  /**
   * Extra content rendered at the END of a SELECTED item's option row — the
   * warehouse picker puts that warehouse's opening-stock input here, so the
   * number is typed beside the name it belongs to instead of in a second table
   * under the field.
   *
   * Only called for selected items: an unselected row gets no slot, so an empty
   * input can never be mistaken for a deliberate 0. The node is rendered inside
   * the row but OUTSIDE its toggle target, and the row's own `onSelect` is
   * suppressed while the pointer is in here — otherwise clicking the input
   * would untick the item it belongs to.
   */
  renderSelectedAccessory?: (item: T) => ReactNode;
}

export function InlineEditableMultiSelect<T>({
  items,
  value,
  onChange,
  placeholder,
  addLabel,
  emptyLabel,
  searchPlaceholder,
  getId,
  getName,
  getOptionLabel,
  onAdd,
  onRename,
  renderSelectedAccessory,
}: InlineEditableMultiSelectProps<T>) {
  const label = getOptionLabel ?? getName;
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  /**
   * True while a pointer press is inside a row's accessory. cmdk's CommandItem
   * fires `onSelect` for a click anywhere in the item, so without this a click
   * on the stock input would untick its own warehouse.
   */
  const accessoryActiveRef = useRef(false);

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const resetAdd = () => {
    setAdding(false);
    setAddDraft('');
  };
  const resetRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const toggle = (id: string) => {
    const current = value || [];
    onChange(current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
  };

  const commitAdd = async () => {
    const name = addDraft.trim();
    if (!name || isSaving) return;
    setIsSaving(true);
    try {
      const newId = await onAdd(name);
      if (newId !== undefined && !(value || []).includes(newId)) {
        onChange([...(value || []), newId]);
      }
      resetAdd();
    } finally {
      setIsSaving(false);
    }
  };

  const startRename = (item: T) => {
    setRenamingId(getId(item));
    setRenameDraft(getName(item));
    setAdding(false);
  };

  const commitRename = async () => {
    const name = renameDraft.trim();
    if (!name || renamingId === null || isSaving) return;
    setIsSaving(true);
    try {
      await onRename(renamingId, name);
      resetRename();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover>
      <FormControl>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", 'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-auto min-h-10 text-left font-normal', !value?.length && 'text-muted-foreground')}
          >
            <div className="flex flex-wrap gap-1 pointer-events-none">
              {value && value.length > 0 ? (
                value.map((id) => {
                  const item = items.find((i) => getId(i) === id);
                  return (
                    <Badge variant="secondary" key={id} className="mr-1 mb-1">
                      {item ? label(item) : id}
                    </Badge>
                  );
                })
              ) : (
                placeholder
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
      </FormControl>
      <PopoverContent className="w-full min-w-[300px] p-0" align="start">
        <Command className="w-full">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
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
                const isSelected = value?.includes(id) ?? false;
                const accessory = isSelected ? renderSelectedAccessory?.(item) : undefined;
                return (
                  <CommandItem
                    key={id}
                    value={label(item)}
                    // cmdk owns `aria-selected` for its keyboard highlight, so
                    // the TICKED state needs its own attribute: without it a
                    // caller (and a test) cannot tell "highlighted" from
                    // "chosen".
                    data-ticked={isSelected}
                    className={cn('relative', accessory ? 'pr-2' : 'pr-9')}
                    onSelect={() => {
                      // A click that landed in the accessory (the stock input)
                      // must not toggle the row it belongs to. cmdk fires
                      // onSelect for any click inside the item, so the guard
                      // lives here rather than on the accessory's handlers.
                      if (accessoryActiveRef.current) return;
                      toggle(id);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="flex-1 truncate">{label(item)}</span>
                    {/* Rename stays reachable on an accessory row: it moves from
                        an absolutely-positioned corner button into the flow,
                        BEFORE the accessory, so a selected warehouse can still
                        be renamed. Dropping it would have made renaming
                        possible only by first unticking the warehouse. */}
                    <button
                      type="button"
                      aria-label={`Rename ${getName(item)}`}
                      className={cn(
                        'shrink-0 text-muted-foreground hover:text-foreground',
                        accessory ? 'ml-2' : 'absolute right-2 top-1/2 -translate-y-1/2',
                      )}
                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); startRename(item); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {accessory ? (
                      <span
                        className="ml-2 shrink-0"
                        onPointerDown={(e) => { e.stopPropagation(); accessoryActiveRef.current = true; }}
                        onPointerUp={() => { accessoryActiveRef.current = false; }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {accessory}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
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
        </Command>
      </PopoverContent>
    </Popover>
  );
}
