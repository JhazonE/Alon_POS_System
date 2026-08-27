'use client';

import { useState } from 'react';
import { PlusCircle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { PriceLevel } from '@/lib/types';

import { CurrencyIcon } from './currency-icon';
import { PriceLevelForm } from './price-level-form';
import { PriceLevelRow } from './price-level-row';
import { PriceLevelSkeleton } from './price-level-skeleton';
import { useManagePriceLevels } from './use-manage-price-levels';

export function ManagePriceLevelsDialog({ trigger, onLevelAdded, open, onOpenChange }: { trigger?: React.ReactNode; onLevelAdded?: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingLevel, setEditingLevel] = useState<PriceLevel | undefined>(undefined);
  const { levels, isLoading, addLevel, updateLevel, deleteLevel } = useManagePriceLevels({ onLevelAdded });

  const handleAddLevel = async (name: string, description: string, isDefault: boolean, percentageAdjustment: number, calculationBase: 'retail' | 'cost', adjustmentType: 'percentage' | 'fixed') => {
    const success = await addLevel(name, description, isDefault, percentageAdjustment, calculationBase, adjustmentType);
    if (success) {
      setView('list');
    }
    return success;
  };

  const handleUpdateLevel = async (name: string, description: string, isDefault: boolean, percentageAdjustment: number, calculationBase: 'retail' | 'cost', adjustmentType: 'percentage' | 'fixed') => {
    if (!editingLevel) return false;
    const success = await updateLevel(editingLevel.id, name, description, isDefault, percentageAdjustment, calculationBase, adjustmentType);
    if (success) {
      setView('list');
      setEditingLevel(undefined);
    }
    return success;
  };

  const dialogTrigger = trigger || (
    <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
      <CurrencyIcon className="mr-2 h-4 w-4" />
      Manage Price Levels
    </button>
  );

  return (
     <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {dialogTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl !rounded-lg !duration-500 ease-in-out data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 data-[state=closed]:!zoom-out-95 data-[state=open]:!zoom-in-90 data-[state=closed]:!slide-out-to-top-[5%] data-[state=open]:!slide-in-from-top-[5%]">
        <DialogHeader>
          <DialogTitle>
            {view === 'list' && 'Manage Price Levels'}
            {view === 'form' && (editingLevel ? 'Edit Price Level' : 'Add New Price Level')}
          </DialogTitle>
          <DialogDescription>
            {view === 'list' && 'Configure multiple price points for your products.'}
            {view === 'form' && (editingLevel ? `Editing the price level "${editingLevel.name}".` : 'Enter details for the new price level.')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
            {view === 'list' ? (
                <>
                    <div className="flex justify-end mb-4">
                        <button onClick={() => { setEditingLevel(undefined); setView('form'); }} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Price Level
                        </button>
                    </div>
                    <Card>
                        <CardContent className='p-0'>
                            <Table>
                            <TableHeader>
                                <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-center">Markup</TableHead>
                                <TableHead>
                                    <span className="sr-only">Actions</span>
                                </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading && Array.from({ length: 4 }).map((_, i) => <PriceLevelSkeleton key={i} />)}
                                {!isLoading && levels.map((level) => (
                                  <PriceLevelRow
                                    key={level.id}
                                    level={level}
                                    onDelete={deleteLevel}
                                    onEdit={(lvl) => { setEditingLevel(lvl); setView('form'); }}
                                  />
                                ))}
                                 {!isLoading && levels.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center h-24">
                                            No price levels found. Add one to get started.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            ) : (
                <PriceLevelForm
                  initialData={editingLevel}
                  onSave={editingLevel ? handleUpdateLevel : handleAddLevel}
                  onCancel={() => { setView('list'); setEditingLevel(undefined); }}
                />
            )}
        </div>
        {view === 'list' && (
            <DialogFooter>
              <DialogTrigger asChild>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Close</button>
              </DialogTrigger>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
