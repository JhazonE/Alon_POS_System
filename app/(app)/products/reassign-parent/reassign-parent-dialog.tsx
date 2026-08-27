'use client';

import { useMemo, useState } from 'react';
import type { Product } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GitBranch } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { reassignParent } from '../actions';
import { getIllegalReassignTargets, type TreeProduct } from '@/lib/product-tree';

const DETACH_VALUE = '__detach__';

export function ReassignParentDialog({
  product,
  products,
  onProductUpdated,
  trigger,
}: {
  product: Product;
  products: Product[];
  onProductUpdated?: () => void;
  trigger?: React.ReactNode;
}) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [targetId, setTargetId] = useState<string>('');
  const [factor, setFactor] = useState<string>('');
  const [autoDetectedFrom, setAutoDetectedFrom] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Legal targets = every product except the child itself and its descendants.
  const legalTargets = useMemo(() => {
    const treeProducts: TreeProduct[] = products.map((p) => ({ id: p.id, parentId: p.parentId }));
    const illegal = getIllegalReassignTargets(product.id, treeProducts);
    return products
      .filter((p) => !illegal.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, product.id]);

  const isDetach = targetId === DETACH_VALUE;
  const canSave = targetId !== '' && (isDetach || (Number(factor) > 0));

  const handleTargetChange = (value: string) => {
    setTargetId(value);
    if (value === DETACH_VALUE) {
      setFactor('');
      setAutoDetectedFrom(null);
      return;
    }
    const parent = products.find((p) => p.id === value);
    const match = parent?.conversionFactors?.find(
      (cf) => cf.unit === product.unitOfMeasure,
    );
    if (match) {
      setFactor(String(match.factor));
      setAutoDetectedFrom(parent?.name ?? null);
    } else {
      setFactor('');
      setAutoDetectedFrom(null);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const newParentId = isDetach ? null : targetId;
      const result = await reassignParent(product.id, newParentId, isDetach ? 0 : Number(factor));
      if (result.success) {
        toast({ title: 'Reassigned', description: result.message });
        setIsOpen(false);
        setTargetId('');
        setFactor('');
        setAutoDetectedFrom(null);
        onProductUpdated?.();
      } else {
        toast({ variant: 'destructive', title: 'Reassignment failed', description: result.message });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] gap-2">
            <GitBranch className="h-4 w-4" />
            Reassign Parent
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign Parent</DialogTitle>
          <DialogDescription>
            Move <span className="font-medium">{product.name}</span> under a different mother product,
            or detach it to become a top-level product.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reassign-target">New parent</Label>
            <Select value={targetId} onValueChange={handleTargetChange}>
              <SelectTrigger id="reassign-target">
                <SelectValue placeholder="Select a new parent product" />
              </SelectTrigger>
              <SelectContent>
                {product.parentId && (
                  <SelectItem value={DETACH_VALUE}>Detach (no parent)</SelectItem>
                )}
                {legalTargets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isDetach && targetId !== '' && (
            <div className="space-y-2">
              <Label htmlFor="reassign-factor">
                Conversion factor ({product.unitOfMeasure} per 1 parent unit)
              </Label>
              <Input
                id="reassign-factor"
                type="number"
                step="0.0001"
                min="0"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                placeholder="e.g., 12"
              />
              <p className="text-xs text-muted-foreground">
                How many {product.unitOfMeasure} equal one unit of the new parent.
              </p>
              {autoDetectedFrom && (
                <p className="text-xs text-muted-foreground">
                  Auto-detected from {autoDetectedFrom}. You can override it.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 px-[18px]">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSave || isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? 'Saving...' : 'Reassign'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
