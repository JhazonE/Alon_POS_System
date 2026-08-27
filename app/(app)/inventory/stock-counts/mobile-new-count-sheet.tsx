'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

export function MobileNewCountSheet({
  open, onClose, onSubmit,
  name, setName,
  notes, setNotes,
  warehouseId, setWarehouseId,
  shelfLocationIds, setShelfLocationIds,
  warehouses, shelves,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  name: string; setName: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  warehouseId: string; setWarehouseId: (v: string) => void;
  shelfLocationIds: string[]; setShelfLocationIds: React.Dispatch<React.SetStateAction<string[]>>;
  warehouses: { id: string; name: string }[];
  shelves: { id: string; name: string }[];
  isSubmitting: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [shelfSearch, setShelfSearch] = useState('');

  useEffect(() => { if (open) { setStep(1); setShelfSearch(''); } }, [open]);

  const filteredShelves = shelves.filter((s) =>
    s.name.toLowerCase().includes(shelfSearch.toLowerCase())
  );
  const canGoNext = name.trim().length > 0;

  if (!open) return null;

  return (
    <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative z-10 bg-background rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh]">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 flex-shrink-0 border-b border-border/60">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold">Start Stock Count</h2>
            <button type="button" onClick={onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Takes a snapshot so you can count items while operations continue.
          </p>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {([1, 2] as const).map((s, idx) => (
              <div key={s} className="flex items-center gap-2">
                {idx > 0 && <div className={`h-px w-6 transition-colors ${s <= step ? 'bg-primary' : 'bg-border'}`} />}
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  s < step ? 'bg-emerald-500 text-white'
                    : s === step ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {s < step ? <Check className="h-3 w-3" /> : s}
                </div>
                <span className={`text-xs font-medium ${s === step ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s === 1 ? 'Details' : 'Location'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* Step 1 */}
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sc-name-m" className="text-sm font-semibold">
                    Count Name / Reference <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sc-name-m"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Q1 Annual Count, End of Month"
                    className="h-11 text-base"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    A descriptive name so you can identify this count later.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sc-notes-m" className="text-sm font-semibold">
                    Notes <span className="font-normal text-muted-foreground">(Optional)</span>
                  </Label>
                  <Textarea
                    id="sc-notes-m"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special instructions for counters…"
                    className="text-base resize-none"
                    rows={4}
                  />
                </div>
              </>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Warehouse <span className="font-normal text-muted-foreground">(Optional)</span>
                  </Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="All Warehouses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Warehouses</SelectItem>
                      {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">
                      Shelves <span className="font-normal text-muted-foreground">(Optional)</span>
                    </Label>
                    {shelfLocationIds.length > 0 && (
                      <button type="button" onClick={() => setShelfLocationIds([])}
                        className="text-xs text-muted-foreground hover:text-foreground underline">
                        Clear ({shelfLocationIds.length})
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search shelves…"
                      value={shelfSearch}
                      onChange={(e) => setShelfSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {shelves.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No shelves available</p>
                  ) : (
                    <div className="border border-border rounded-xl overflow-hidden divide-y divide-border/60 max-h-52 overflow-y-auto">
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-muted/20 hover:bg-muted/50 transition-colors">
                        <Checkbox
                          checked={shelfLocationIds.length === shelves.length && shelves.length > 0}
                          onCheckedChange={(v) => setShelfLocationIds(v ? shelves.map((s) => s.id) : [])}
                        />
                        <span className="text-sm font-medium">Select All ({shelves.length})</span>
                      </label>

                      {filteredShelves.length === 0
                        ? <p className="text-sm text-muted-foreground text-center py-4">No shelves match &quot;{shelfSearch}&quot;</p>
                        : filteredShelves.map((shelf) => (
                          <label key={shelf.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                            <Checkbox
                              checked={shelfLocationIds.includes(shelf.id)}
                              onCheckedChange={(v) =>
                                setShelfLocationIds((p) =>
                                  v ? [...p, shelf.id] : p.filter((id) => id !== shelf.id)
                                )
                              }
                            />
                            <span className="text-sm">{shelf.name}</span>
                          </label>
                        ))}
                    </div>
                  )}

                  {shelfLocationIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {shelfLocationIds.map((id) => {
                        const s = shelves.find((sh) => sh.id === id);
                        return (
                          <Badge key={id} variant="secondary" className="font-normal flex items-center gap-1 text-xs">
                            {s?.name || id}
                            <X className="h-3 w-3 cursor-pointer hover:text-destructive"
                              onClick={() => setShelfLocationIds((p) => p.filter((i) => i !== id))} />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Sticky footer */}
          <div className="flex-shrink-0 border-t border-border/60 px-5 py-4 space-y-2">
            {step === 1 ? (
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] w-full h-11 text-base" disabled={!canGoNext} onClick={() => setStep(2)}>
                Next: Set Location <ChevronRight className="h-4 w-4 ml-2" />
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[18px] flex-1 h-11" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1.5" /> Back
                </button>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] flex-1 h-11 text-base" disabled={isSubmitting}>
                  {isSubmitting ? 'Taking Snapshot…' : 'Take Snapshot'}
                </button>
              </div>
            )}
            <button type="button" onClick={onClose}
              className="w-full text-center text-sm text-muted-foreground py-1 hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
