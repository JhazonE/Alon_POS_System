'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Database, HardDrive, RotateCcw, Trash2 } from 'lucide-react';
import type { ResetAction } from './data-management-types';

interface Props {
  onOpenResetDialog: (action: ResetAction) => void;
}

export function ResetDataTab({ onOpenResetDialog }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Danger Zone</CardTitle>
        <CardDescription>Destructive actions to reset system data. These actions cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border border-red-200 rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-red-900 dark:text-red-200">Clear Sales Data</h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                Deletes all sales transactions (POS, Orders, Invoices), payments, shifts, readings, and related approval queue items. Invoice numbering restarts at SI 000001.
              </p>
            </div>
            <button onClick={() => onOpenResetDialog('clear_sales')} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-10 px-[18px]">
              <Trash2 className="mr-2 h-4 w-4" /> Clear Sales
            </button>
          </div>
        </div>

        <div className="border border-orange-200 rounded-lg p-4 bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-orange-900 dark:text-orange-200">Reset Transaction References</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Resets all transaction counters and terminal OR numbers to default values.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] border-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900 text-orange-700 dark:text-orange-300" onClick={() => onOpenResetDialog('reset_references')}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset References
            </button>
          </div>
        </div>

        <div className="border border-red-200 rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-red-900 dark:text-red-200">Delete Inventory</h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                Deletes ALL products, stock history, adjustments, transfers, counts, and product shelves.
              </p>
            </div>
            <button onClick={() => onOpenResetDialog('clear_inventory')} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-10 px-[18px]">
              <Trash2 className="mr-2 h-4 w-4" /> Delete Inventory
            </button>
          </div>
        </div>

        <div className="border border-orange-200 rounded-lg p-4 bg-orange-50 dark:bg-orange-950/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-orange-900 dark:text-orange-200">Clear Master Data</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Deletes all Customers, Suppliers, Categories, Brands, Units, and Shelf Locations.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] border-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900 text-orange-700 dark:text-orange-300" onClick={() => onOpenResetDialog('clear_master_data')}>
              <Database className="mr-2 h-4 w-4" /> Clear Master Data
            </button>
          </div>
        </div>

        <div className="border-2 border-destructive rounded-lg p-6 bg-destructive/5">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <h3 className="text-xl font-bold text-destructive">Full Factory Reset</h3>
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                This will wipe ALL data from the system except for existing user accounts and basic system settings.
                The system will be returned to its initial empty state.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-[46px] text-[15px] px-8 shadow-lg shadow-destructive/20" onClick={() => onOpenResetDialog('factory_reset')}>
              <HardDrive className="mr-2 h-5 w-5" /> FACTORY RESET
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
