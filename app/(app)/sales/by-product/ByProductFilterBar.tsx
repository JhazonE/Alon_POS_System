import { Search, X, SlidersHorizontal, FileDown, Columns } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Table } from '@tanstack/react-table';

type Props = {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  setCurrentPage: (v: number) => void;
  activeFilterCount: number;
  dateRange: any;
  terminal: string;
  categoryFilter: string;
  brandFilter: string;
  cashierFilter: string;
  referenceFilter: string;
  resetFilters: () => void;
  exportToCSV: () => void;
  exportToPDF: () => void;
  table: Table<any>;
  onOpenDateRange: () => void;
  onOpenTerminal: () => void;
  onOpenCategory: () => void;
  onOpenBrand: () => void;
  onOpenCashier: () => void;
  onOpenReference: () => void;
};

export function ByProductFilterBar({
  searchTerm, setSearchTerm, setCurrentPage,
  activeFilterCount,
  dateRange, terminal, categoryFilter, brandFilter, cashierFilter, referenceFilter,
  resetFilters, exportToCSV, exportToPDF,
  table,
  onOpenDateRange, onOpenTerminal, onOpenCategory, onOpenBrand, onOpenCashier, onOpenReference,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-4 pt-4 mb-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by product name..."
          className="pl-8 sm:w-[300px]"
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Column Visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <Columns className="h-4 w-4 mr-2" />
              Columns
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllColumns().filter((col) => col.getCanHide()).map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                className="capitalize"
                checked={col.getIsVisible()}
                onCheckedChange={(val) => col.toggleVisibility(!!val)}
              >
                {col.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <FileDown className="h-4 w-4 mr-2" />
              Export
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={exportToCSV}>Export to CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={exportToPDF}>Export to PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Filters */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">{activeFilterCount}</Badge>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onOpenDateRange}>
              Date Range
              {dateRange && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenTerminal}>
              Terminal
              {terminal !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenCategory}>
              Category
              {categoryFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{categoryFilter}</Badge>}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenBrand}>
              Brand
              {brandFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{brandFilter}</Badge>}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenCashier}>
              Cashier
              {cashierFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{cashierFilter}</Badge>}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenReference}>
              Transaction Reference
              {referenceFilter && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={resetFilters} className="text-destructive">
              Clear All Filters
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(searchTerm || activeFilterCount > 0) && (
          <button onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <X className="h-4 w-4 mr-1" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
